'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import {
  createRecipeMediaUrlMap,
  getWorkforceRecipeDetail,
  groupRecipesByCategory,
  hasRecipeManagerAccess,
  listWorkforceRecipes,
  permanentlyDeleteRecipe as permanentlyDeleteRecipeWrite,
  setWorkforceRecipeArchived,
  upsertWorkforceRecipe,
  type WorkforceRecipeDetail,
  type WorkforceRecipeGroup,
  type WorkforceRecipe,
} from './recipes';
import { listWorkforceRecipeCategories } from './recipe-categories';
import { parseUpsertRecipeInput } from './recipe-input';
import type { WorkforceWriteResult } from './result-types';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { listContentTranslationsForEntities, listContentTranslationsForField, setMachineContentTranslation } from '@/lib/content/translations';
import {
  buildRecipeTranslationField,
  buildRecipeTranslationWorkspace,
  flattenRecipeTranslationFields,
  type RecipeTranslationField,
} from '@/lib/content/recipe-translation-workspace';
import { resolveContentTranslationProvider } from '@/lib/content/translation-provider-factory';
import { runContentTranslationBatch } from '@/lib/content/translation-orchestrator';
import type { SupabaseClient } from '@supabase/supabase-js';
import { queueLineNotification } from '@/lib/notifications/queue-line-notification';
import { optimizeImageForWeb } from '@/lib/media/optimize-image';

/**
 * Server Actions for Manager recipe CRUD (Cafe v2.1 QA audit P1-2,
 * 2026-08-17: the backend for all of this -- `upsertWorkforceRecipe`,
 * `setWorkforceRecipeArchived`, `permanentlyDeleteRecipe` -- already existed
 * and was already tested; nothing in the canonical UI ever called it). Thin
 * controllers, same shape as `attendance-actions.ts`/`staff-actions.ts`:
 * authorization is `wf_recipes_*` RLS (`workforce.recipe.manage`,
 * `hasRecipeManagerAccess`'s pre-check), not re-derived here.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

/** Matches the reference preview implementation's own client-side hint (2MB) -- see `recipe-form.tsx`'s matching dimension check. */
const MAX_RECIPE_PHOTO_BYTES = 2 * 1024 * 1024;
const RECIPE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Recipes are tenant-wide content, not per-caller like a staff profile, so
 * there is no "my own recipe location" to resolve the way
 * `submitWorkReport` resolves the caller's staff profile location. Instead
 * this mirrors `/manager` page's own LOC-1 fail-closed rule (exactly one
 * active location) -- required because `upsert_workforce_recipe` (0060)
 * always takes a concrete `p_location_id`, tenant-wide recipes included
 * (its own header: "p_location_id is always the caller's own resolved
 * location"). A multi-location tenant needs a real location picker in the
 * form, out of scope for this MVP slice.
 */
async function resolveSoleActiveLocationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
): Promise<WorkforceWriteResult<string>> {
  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const activeLocations = locationsResult.data.filter((l) => l.tenantId === tenantId && l.isActive);
  if (activeLocations.length !== 1) {
    return { status: 'unexpected_error', message: 'This action requires exactly one active location; multi-location recipe management is not supported yet.' };
  }
  return { status: 'success', data: activeLocations[0]!.locationId };
}

export async function upsertRecipe(formData: FormData): Promise<WorkforceWriteResult<{ recipeId: string }>> {
  const input = parseUpsertRecipeInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0 &&
      (photo.size > MAX_RECIPE_PHOTO_BYTES || !RECIPE_PHOTO_MIME_TYPES.includes(photo.type as (typeof RECIPE_PHOTO_MIME_TYPES)[number]))) {
    return INVALID_INPUT_RESULT;
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationResult = await resolveSoleActiveLocationId(supabase, tenantId);
  if (locationResult.status !== 'success') return locationResult;

  // WP-6 (Cafe Manager UI/UX Parity mission): recipe photo. Ported from the
  // reference preview implementation (`previewUpsertRecipe`) -- this Server
  // Action has no Storage access of its own until now, so it owns the same
  // upload-after-insert + old-photo-cleanup responsibility that action
  // already had. A brand-new recipe's Storage path embeds its own
  // `recipeId`, which only exists after the first insert, hence the
  // two-step upsert (once without media, again with the uploaded path) --
  // unavoidable for create, kept uniform for edit too.
  let previousMediaPath: string | null = null;
  if (input.recipeId) {
    const existing = await getWorkforceRecipeDetail(supabase, tenantId, input.recipeId);
    if (existing.status !== 'success') return existing;
    if (!existing.data) return { status: 'not_found' };
    previousMediaPath = existing.data.recipe.mediaPath ?? null;
  }
  input.mediaPath = formData.get('removePhoto') === 'true' ? null : previousMediaPath;

  const saved = await upsertWorkforceRecipe(supabase, tenantId, locationResult.data, input);
  if (saved.status !== 'success') return saved;

  let nextMediaPath = input.mediaPath;
  if (photo instanceof File && photo.size > 0) {
    let optimized;
    try {
      optimized = await optimizeImageForWeb(await photo.arrayBuffer());
    } catch {
      return { status: 'unexpected_error', message: 'Could not process the photo.' };
    }
    nextMediaPath = `${tenantId}/${locationResult.data}/${saved.data.recipeId}/${crypto.randomUUID()}.${optimized.extension}`;
    const upload = await supabase.storage.from('recipe-media').upload(nextMediaPath, optimized.buffer, {
      contentType: optimized.contentType, cacheControl: '3600', upsert: false,
    });
    if (upload.error) return { status: 'unexpected_error', message: 'Could not upload the photo.' };
    const mediaSaved = await upsertWorkforceRecipe(supabase, tenantId, locationResult.data, { ...input, recipeId: saved.data.recipeId, mediaPath: nextMediaPath });
    if (mediaSaved.status !== 'success') {
      await supabase.storage.from('recipe-media').remove([nextMediaPath]);
      return mediaSaved;
    }
  }
  if (previousMediaPath && previousMediaPath !== nextMediaPath) {
    await supabase.storage.from('recipe-media').remove([previousMediaPath]);
  }

  // Auto-translation (Cafe v2.1 QA audit P1-3, 2026-08-17): fires ONLY here,
  // once per Save, never on page view/open -- direction is always this
  // recipe's own `originalLanguage` -> the other language (never guessed per
  // field). Best-effort: a translation-provider failure, or no provider
  // configured at all, must never fail the save the manager just made. Ports
  // the identical, already-tested `autoTranslateRecipe` logic the now-retired
  // Surface A preview action had (`src/lib/preview/actions/recipe-actions.ts`)
  // -- that surface's removal silently took the only working translation
  // trigger with it; the canonical Manager recipe CRUD (`upsertWorkforceRecipe`
  // via this action) never had one.
  await autoTranslateRecipe(supabase, tenantId, saved.data.recipeId);

  // WP C2: inert today, never affects this write's own result either way.
  queueLineNotification({ type: 'recipe_updated', tenantId, targetStaffId: null, payload: { recipeId: saved.data.recipeId } });

  return saved;
}

async function autoTranslateRecipe(supabase: SupabaseClient, tenantId: string, recipeId: string): Promise<void> {
  const provider = resolveContentTranslationProvider();
  if (!provider) return;
  try {
    const detailResult = await getWorkforceRecipeDetail(supabase, tenantId, recipeId);
    if (detailResult.status !== 'success' || !detailResult.data) return;

    const fieldRefs = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace(detailResult.data, []));
    const translationsResult = await listContentTranslationsForEntities(
      supabase,
      tenantId,
      fieldRefs.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
    );
    if (translationsResult.status !== 'success') return;

    const workspace = buildRecipeTranslationWorkspace(detailResult.data, translationsResult.data);
    const fields = flattenRecipeTranslationFields(workspace);
    const sourceLang = detailResult.data.recipe.originalLanguage;
    const targetLang = sourceLang === 'ja' ? 'en' : 'ja';
    const batchResult = await runContentTranslationBatch(
      fields.map((field) => ({
        sourceEntityType: field.sourceEntityType,
        sourceEntityId: field.sourceEntityId,
        sourceField: field.sourceField,
        sourceText: field.sourceText,
        existing: field.existing,
      })),
      provider,
      { sourceLang, targetLang },
    );
    for (const accepted of batchResult.accepted) {
      const saveResult = await setMachineContentTranslation(supabase, tenantId, {
        sourceEntityType: accepted.sourceEntityType,
        sourceEntityId: accepted.sourceEntityId,
        sourceField: accepted.sourceField,
        translatedText: accepted.translatedText,
        sourceContentHash: accepted.sourceContentHash,
        translationProvider: provider.providerId,
      });
      if (saveResult.status !== 'success' && saveResult.status !== 'reviewed_conflict') {
        console.error(`[recipe-translation] failed to persist machine translation for recipe=${recipeId} field=${accepted.sourceField}: status=${saveResult.status}`);
      }
    }
  } catch (err) {
    console.error(`[recipe-translation] unexpected error translating recipe=${recipeId}:`, err instanceof Error ? err.message : err);
  }
}

export async function setRecipeArchived(formData: FormData): Promise<WorkforceWriteResult<WorkforceRecipe>> {
  const recipeId = formData.get('recipeId');
  const archived = formData.get('archived');
  if (typeof recipeId !== 'string' || !recipeId.trim() || (archived !== 'true' && archived !== 'false')) {
    return INVALID_INPUT_RESULT;
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return setWorkforceRecipeArchived(supabase, tenantContext.data.activeTenant.tenantId, recipeId, archived === 'true');
}

export async function permanentlyDeleteRecipe(
  formData: FormData,
): Promise<WorkforceWriteResult<{ recipeId: string; mediaPath: string | null }>> {
  const recipeId = formData.get('recipeId');
  if (typeof recipeId !== 'string' || !recipeId.trim()) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const result = await permanentlyDeleteRecipeWrite(supabase, tenantContext.data.activeTenant.tenantId, recipeId);
  // Storage removal is best-effort (matches previewPermanentlyDeleteRecipe):
  // the row is already gone by this point, and a Storage failure must never
  // be reported back as if the delete itself failed.
  if (result.status === 'success' && result.data.mediaPath) {
    await supabase.storage.from('recipe-media').remove([result.data.mediaPath]);
  }
  return result;
}

/**
 * Recipes module redesign (Cafe Manager UI/UX Parity mission, 2026-08-20,
 * Founder direction): the UI's single "Delete" action (list row and detail
 * view alike, any status) archives-then-hard-deletes in one server round
 * trip, rather than requiring the Manager to archive a recipe first as a
 * separate step. Reuses the existing archive/permanent-delete plumbing
 * unchanged (`setWorkforceRecipeArchived`, `permanentlyDeleteRecipeWrite`,
 * including its `status === 'archived'` guard) -- this action just chains
 * them, it does not loosen that guard. A recipe can still be moved to
 * `archived` on its own (without deletion) via the edit form's status
 * select; this action is only for "actually gone."
 */
export async function deleteRecipe(
  formData: FormData,
): Promise<WorkforceWriteResult<{ recipeId: string; mediaPath: string | null }>> {
  const recipeId = formData.get('recipeId');
  if (typeof recipeId !== 'string' || !recipeId.trim()) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const archiveResult = await setWorkforceRecipeArchived(supabase, tenantId, recipeId, true);
  if (archiveResult.status !== 'success') return archiveResult;

  const result = await permanentlyDeleteRecipeWrite(supabase, tenantId, recipeId);
  if (result.status === 'success' && result.data.mediaPath) {
    await supabase.storage.from('recipe-media').remove([result.data.mediaPath]);
  }
  return result;
}

export interface RecipeDetailForPopup {
  recipe: WorkforceRecipeDetail['recipe'];
  ingredients: WorkforceRecipeDetail['ingredients'];
  steps: WorkforceRecipeDetail['steps'];
  notes: WorkforceRecipeDetail['notes'];
  translationFields: RecipeTranslationField[];
  canManage: boolean;
  /** Signed URL for the recipe's `mediaPath`, if any -- `null` when it has no photo. */
  mediaUrl: string | null;
}

/**
 * Lazy, on-demand recipe-detail read for the Manager Recipes popup (WP
 * A5b): the popup only fetches one recipe's full detail (ingredients/
 * steps/notes/translations) when the caller actually clicks into it from
 * the list, mirroring exactly what `/recipes/[recipeId]/page.tsx` already
 * fetches server-side -- same two reads (`getWorkforceRecipeDetail` +
 * `listContentTranslationsForEntities`), just callable from a client
 * component instead of a page's own request. `data: null` covers "recipe
 * id does not exist, belongs to another tenant, or is filtered out by
 * RLS" identically to the page's own `NotFoundState` handling -- these are
 * indistinguishable at the query layer.
 */
export async function getRecipeDetailForPopup(recipeId: string): Promise<TenantAccessResult<RecipeDetailForPopup | null>> {
  if (typeof recipeId !== 'string' || !recipeId.trim()) return { status: 'unexpected_error', message: 'Invalid input.' };

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const { activeTenant } = tenantContext.data;

  const [detailResult, canManage] = await Promise.all([
    getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipeId),
    hasRecipeManagerAccess(supabase, activeTenant.tenantId),
  ]);

  if (detailResult.status !== 'success') return detailResult;
  if (detailResult.data === null) return { status: 'success', data: null };

  const { recipe, ingredients, steps, notes } = detailResult.data;
  // Translations and the media URL each depend only on `recipe`/its children
  // (already resolved above), not on each other -- running them in parallel
  // instead of one after the other removes another full Supabase round trip
  // from every popup open.
  const [translationsResult, mediaUrlMap] = await Promise.all([
    listContentTranslationsForEntities(supabase, activeTenant.tenantId, [
      { sourceEntityType: 'workforce_recipe', sourceEntityId: recipe.recipeId },
      ...ingredients.map((i) => ({ sourceEntityType: 'workforce_recipe_ingredient' as const, sourceEntityId: i.ingredientId })),
      ...steps.map((s) => ({ sourceEntityType: 'workforce_recipe_step' as const, sourceEntityId: s.stepId })),
      ...notes.map((n) => ({ sourceEntityType: 'workforce_recipe_note' as const, sourceEntityId: n.noteId })),
    ]),
    createRecipeMediaUrlMap(supabase, [recipe]),
  ]);
  const translations = translationsResult.status === 'success' ? translationsResult.data : [];
  const translationFields = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace({ recipe, ingredients, steps, notes }, translations));

  return { status: 'success', data: { recipe, ingredients, steps, notes, translationFields, canManage, mediaUrl: mediaUrlMap[recipe.recipeId] ?? null } };
}

export interface RecipesListForPoll {
  groups: WorkforceRecipeGroup[] | null;
  titleFieldByRecipeId: Record<string, RecipeTranslationField>;
  mediaUrlByRecipeId: Record<string, string>;
}

/**
 * WP C1 (Track C, live-sync): re-reads the recipe list, grouped by category
 * plus title translation fields -- identical shape/fetch to
 * `recipes/page.tsx`'s own initial load, just callable from a client
 * component's poll instead of a page request. Used by `RecipesListBody`'s
 * 2.5s poll (same interval/visibility/in-flight pattern already proven on
 * the Staff dashboard's schedule poll) so a Manager's recipe edit appears
 * for a Staff member with the list already open, without a reload.
 */
export async function getRecipesListForPoll(): Promise<TenantAccessResult<RecipesListForPoll>> {
  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const { activeTenant } = tenantContext.data;

  const [categoriesResult, recipesResult] = await Promise.all([
    listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
    listWorkforceRecipes(supabase, activeTenant.tenantId),
  ]);

  const groups =
    categoriesResult.status === 'success' && recipesResult.status === 'success'
      ? groupRecipesByCategory(categoriesResult.data, recipesResult.data)
      : null;

  const titleTranslationsResult =
    recipesResult.status === 'success'
      ? await listContentTranslationsForField(supabase, activeTenant.tenantId, 'workforce_recipe', 'title')
      : null;
  const titleTranslations = titleTranslationsResult?.status === 'success' ? titleTranslationsResult.data : [];
  const titleFieldByRecipeId: Record<string, RecipeTranslationField> =
    recipesResult.status === 'success'
      ? Object.fromEntries(
          recipesResult.data.map((recipe) => [
            recipe.recipeId,
            buildRecipeTranslationField(
              'workforce_recipe',
              recipe.recipeId,
              'title',
              recipe.originalLanguage,
              (recipe.originalLanguage === 'ja' ? recipe.titleJa : recipe.titleEn) ?? '',
              recipe.originalLanguage === 'ja' ? recipe.titleEn : recipe.titleJa,
              titleTranslations,
            ),
          ]),
        )
      : {};

  const mediaUrlByRecipeId = recipesResult.status === 'success' ? await createRecipeMediaUrlMap(supabase, recipesResult.data) : {};

  return { status: 'success', data: { groups, titleFieldByRecipeId, mediaUrlByRecipeId } };
}
