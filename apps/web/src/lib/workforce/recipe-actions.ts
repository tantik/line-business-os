'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import {
  getWorkforceRecipeDetail,
  hasRecipeManagerAccess,
  permanentlyDeleteRecipe as permanentlyDeleteRecipeWrite,
  setWorkforceRecipeArchived,
  upsertWorkforceRecipe,
  type WorkforceRecipeDetail,
  type WorkforceRecipe,
} from './recipes';
import { parseUpsertRecipeInput } from './recipe-input';
import type { WorkforceWriteResult } from './result-types';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { listContentTranslationsForEntities, setMachineContentTranslation } from '@/lib/content/translations';
import {
  buildRecipeTranslationWorkspace,
  flattenRecipeTranslationFields,
  type RecipeTranslationField,
} from '@/lib/content/recipe-translation-workspace';
import { resolveContentTranslationProvider } from '@/lib/content/translation-provider-factory';
import { runContentTranslationBatch } from '@/lib/content/translation-orchestrator';
import type { SupabaseClient } from '@supabase/supabase-js';

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

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationResult = await resolveSoleActiveLocationId(supabase, tenantId);
  if (locationResult.status !== 'success') return locationResult;

  const saved = await upsertWorkforceRecipe(supabase, tenantId, locationResult.data, input);
  if (saved.status !== 'success') return saved;

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
  return permanentlyDeleteRecipeWrite(supabase, tenantContext.data.activeTenant.tenantId, recipeId);
}

export interface RecipeDetailForPopup {
  recipe: WorkforceRecipeDetail['recipe'];
  ingredients: WorkforceRecipeDetail['ingredients'];
  steps: WorkforceRecipeDetail['steps'];
  notes: WorkforceRecipeDetail['notes'];
  translationFields: RecipeTranslationField[];
  canManage: boolean;
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
  const translationsResult = await listContentTranslationsForEntities(supabase, activeTenant.tenantId, [
    { sourceEntityType: 'workforce_recipe', sourceEntityId: recipe.recipeId },
    ...ingredients.map((i) => ({ sourceEntityType: 'workforce_recipe_ingredient' as const, sourceEntityId: i.ingredientId })),
    ...steps.map((s) => ({ sourceEntityType: 'workforce_recipe_step' as const, sourceEntityId: s.stepId })),
    ...notes.map((n) => ({ sourceEntityType: 'workforce_recipe_note' as const, sourceEntityId: n.noteId })),
  ]);
  const translations = translationsResult.status === 'success' ? translationsResult.data : [];
  const translationFields = flattenRecipeTranslationFields(buildRecipeTranslationWorkspace({ recipe, ingredients, steps, notes }, translations));

  return { status: 'success', data: { recipe, ingredients, steps, notes, translationFields, canManage } };
}
