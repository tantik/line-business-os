'use server';

import {
  createRecipeMediaUrlMap,
  getWorkforceRecipeDetail,
  listWorkforceRecipes,
  permanentlyDeleteRecipe,
  setWorkforceRecipeArchived,
  upsertWorkforceRecipe,
  type WorkforceRecipe,
  type WorkforceRecipeDetail,
} from '@/lib/workforce/recipes';
import { parseUpsertRecipeInput } from '@/lib/workforce/recipe-input';
import { listContentTranslationsForEntities, listContentTranslationsForField, setMachineContentTranslation } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace, flattenRecipeTranslationFields } from '@/lib/content/recipe-translation-workspace';
import { withResolvedRecipeListTitles } from '../manager-recipe-title-translations';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';
import { resolveContentTranslationProvider } from '@/lib/content/translation-provider-factory';
import { runContentTranslationBatch } from '@/lib/content/translation-orchestrator';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PreviewEditableRecipeDetail = WorkforceRecipeDetail & { mediaUrl: string | null };
const MAX_RECIPE_PHOTO_BYTES = 2 * 1024 * 1024;

export async function previewListRecipeMediaUrls(
  recipeIds: string[],
): Promise<PreviewWriteResult<Record<string, string>>> {
  if (recipeIds.length > 200 || recipeIds.some((recipeId) => !/^[0-9a-f-]{36}$/i.test(recipeId))) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  const recipes = await listWorkforceRecipes(context.context.supabase, context.context.tenantId);
  if (recipes.status !== 'success') return mapWorkforceWriteResult(recipes);
  const requested = new Set(recipeIds);
  const media = recipes.data.filter((recipe) =>
    requested.has(recipe.recipeId) && recipe.locationId === context.context.locationId && recipe.mediaPath,
  );
  return { status: 'success', data: await createRecipeMediaUrlMap(context.context.supabase, media) };
}

/**
 * Manager-only: re-read the current recipe list. Preview Manager
 * architecture (perf phase 2) - called by the Recipes panel instead of
 * `router.refresh()` after a successful save/archive, so a Recipes mutation
 * refreshes only its own list, not the whole Manager page.
 */
export async function previewGetRecipesManagerData(): Promise<PreviewWriteResult<WorkforceRecipe[]>> {
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  const [recipes, translations] = await Promise.all([
    listWorkforceRecipes(context.context.supabase, context.context.tenantId),
    listContentTranslationsForField(
      context.context.supabase,
      context.context.tenantId,
      'workforce_recipe',
      'title',
    ),
  ]);
  if (recipes.status !== 'success') return mapWorkforceWriteResult(recipes);
  return {
    status: 'success',
    data: withResolvedRecipeListTitles(
      recipes.data,
      translations.status === 'success' ? translations.data : [],
    ),
  };
}

export async function previewGetRecipeForEdit(recipeId: string): Promise<PreviewWriteResult<PreviewEditableRecipeDetail>> {
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  const detail = await getWorkforceRecipeDetail(context.context.supabase, context.context.tenantId, recipeId);
  if (detail.status !== 'success') return mapWorkforceWriteResult(detail);
  if (!detail.data || detail.data.recipe.locationId !== context.context.locationId) return { status: 'not_found' };
  const mediaPath = detail.data.recipe.mediaPath;
  const signed = mediaPath
    ? await context.context.supabase.storage.from('recipe-media').createSignedUrl(mediaPath, 3600)
    : null;
  return { status: 'success', data: { ...detail.data, mediaUrl: signed?.data?.signedUrl ?? null } };
}

export async function previewSetRecipeArchived(
  recipeId: string,
  archived: boolean,
): Promise<PreviewWriteResult<{ recipeId: string; archived: boolean }>> {
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  const detail = await getWorkforceRecipeDetail(context.context.supabase, context.context.tenantId, recipeId);
  if (detail.status !== 'success') return mapWorkforceWriteResult(detail);
  if (!detail.data || detail.data.recipe.locationId !== context.context.locationId) return { status: 'not_found' };
  const result = await setWorkforceRecipeArchived(context.context.supabase, context.context.tenantId, recipeId, archived);
  if (result.status !== 'success') return mapWorkforceWriteResult(result);
  return { status: 'success', data: { recipeId, archived } };
}

/**
 * Manager-only: permanently delete a recipe. Only ever offered by the UI
 * from the Archived state; `permanentlyDeleteRecipe` (`api.permanently_delete_recipe`,
 * 0057) re-checks that server-side too (`blocked_not_archived`), so this is
 * never a UI-only guard. The location check below (same shape as
 * `previewSetRecipeArchived`) runs BEFORE the delete so a manager can never
 * even attempt to delete a recipe outside their resolved location -- the RPC
 * itself also re-checks `workforce.recipe.manage` for the recipe's own
 * location independently, so this is defense in depth, not the only check.
 * On success, removes the Storage object for the recipe's old `mediaPath`
 * (if any) -- the RPC has no Storage access of its own, same division of
 * responsibility `previewUpsertRecipe`'s old-photo cleanup already uses.
 * Storage removal is best-effort: the row is already gone by this point, and
 * a storage failure must never be reported back as if the delete itself
 * failed.
 */
export async function previewPermanentlyDeleteRecipe(recipeId: string): Promise<PreviewWriteResult<{ recipeId: string }>> {
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  const detail = await getWorkforceRecipeDetail(context.context.supabase, context.context.tenantId, recipeId);
  if (detail.status !== 'success') return mapWorkforceWriteResult(detail);
  if (!detail.data || detail.data.recipe.locationId !== context.context.locationId) return { status: 'not_found' };

  const result = await permanentlyDeleteRecipe(context.context.supabase, context.context.tenantId, recipeId);
  if (result.status !== 'success') return mapWorkforceWriteResult(result);

  if (result.data.mediaPath) {
    await context.context.supabase.storage.from('recipe-media').remove([result.data.mediaPath]);
  }
  return { status: 'success', data: { recipeId } };
}

export async function previewUpsertRecipe(formData: FormData): Promise<PreviewWriteResult<{ recipeId: string }>> {
  const input = parseUpsertRecipeInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0 &&
      (photo.size > MAX_RECIPE_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }
  const context = await resolvePreviewManagerContext(
    'workforce.recipe.manage',
    input.status === 'published' ? 'workforce.recipe.publish' : undefined,
  );
  if (context.status !== 'ok') return context.result;
  let previousMediaPath: string | null = null;
  if (input.recipeId) {
    const detail = await getWorkforceRecipeDetail(context.context.supabase, context.context.tenantId, input.recipeId);
    if (detail.status !== 'success') return mapWorkforceWriteResult(detail);
    if (!detail.data || detail.data.recipe.locationId !== context.context.locationId) return { status: 'not_found' };
    previousMediaPath = detail.data.recipe.mediaPath ?? null;
  }
  input.mediaPath = formData.get('removePhoto') === 'true' ? null : previousMediaPath;
  const saved = await upsertWorkforceRecipe(
    context.context.supabase, context.context.tenantId, context.context.locationId, input,
  );
  if (saved.status !== 'success') return mapWorkforceWriteResult(saved);

  let nextMediaPath = input.mediaPath;
  if (photo instanceof File && photo.size > 0) {
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    nextMediaPath = `${context.context.tenantId}/${context.context.locationId}/${saved.data.recipeId}/${crypto.randomUUID()}.${extension}`;
    const upload = await context.context.supabase.storage.from('recipe-media').upload(nextMediaPath, photo, {
      contentType: photo.type, cacheControl: '3600', upsert: false,
    });
    if (upload.error) return { status: 'unexpected_error' };
    const mediaSaved = await upsertWorkforceRecipe(
      context.context.supabase, context.context.tenantId, context.context.locationId,
      { ...input, recipeId: saved.data.recipeId, mediaPath: nextMediaPath },
    );
    if (mediaSaved.status !== 'success') {
      await context.context.supabase.storage.from('recipe-media').remove([nextMediaPath]);
      return mapWorkforceWriteResult(mediaSaved);
    }
  }
  if (previousMediaPath && previousMediaPath !== nextMediaPath) {
    await context.context.supabase.storage.from('recipe-media').remove([previousMediaPath]);
  }

  // Auto-translation (Cafe v2.1 final polish - restores the automatic
  // translation this recipe used to get from the now-removed manager-facing
  // "Generate English translation" panel, per that removal's own stated
  // intent: "translation keeps running automatically server-side, just
  // invisible to managers" - the panel/button were removed, but nothing was
  // ever wired to actually keep it running, so it had been fully dormant).
  // Fires ONLY here, once per Save, never on page load/open/browse. Reuses
  // the same workspace/orchestrator every field of this recipe (title,
  // description, ingredients, steps, notes) already goes through for Staff
  // display - `runContentTranslationBatch` refuses to touch a `reviewed`
  // (manually confirmed) translation and skips a field whose current
  // (non-stale) machine translation already exists, so a manager's manual
  // edit -- or an unchanged JA field -- is never overwritten. Recipes author
  // Japanese only (no English input field exists in this form), so this is
  // one-directional (ja -> en) by construction, not a restriction added
  // here. Best-effort: a translation-provider failure (or no provider
  // configured at all) must never fail the save the manager just made.
  await autoTranslateRecipe(context.context.supabase, context.context.tenantId, saved.data.recipeId);

  return { status: 'success', data: saved.data };
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
    const batchResult = await runContentTranslationBatch(
      fields.map((field) => ({
        sourceEntityType: field.sourceEntityType,
        sourceEntityId: field.sourceEntityId,
        sourceField: field.sourceField,
        sourceText: field.sourceText,
        existing: field.existing,
      })),
      provider,
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
        console.error(`[preview:recipe-translation] failed to persist machine translation for recipe=${recipeId} field=${accepted.sourceField}: status=${saveResult.status}`);
      }
    }
  } catch (err) {
    console.error(`[preview:recipe-translation] unexpected error translating recipe=${recipeId}:`, err instanceof Error ? err.message : err);
  }
}
