'use server';

import { parseUuid } from '@/lib/workforce/validation';
import { getWorkforceRecipeDetail } from '@/lib/workforce/recipes';
import {
  listContentTranslationsForEntities,
  setContentTranslation,
  setMachineContentTranslation,
  markContentTranslationReviewed,
  type ContentSourceEntityType,
  type ContentSourceField,
} from '@/lib/content/translations';
import {
  buildRecipeTranslationWorkspace,
  flattenRecipeTranslationFields,
} from '@/lib/content/recipe-translation-workspace';
import { runContentTranslationBatch } from '@/lib/content/translation-orchestrator';
import { resolveContentTranslationProvider } from '@/lib/content/translation-provider-factory';
import { resolvePreviewManagerContext } from './authorize';
import { PREVIEW_INVALID_INPUT_RESULT } from '../write-result';
import type { RecipeTranslationActionResult } from './recipe-translation-result';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** Maps the shared `TenantAccessResult` failure statuses onto this feature's result contract -- `unauthorized`/`no_membership` both collapse to `no_access`, `config_error` to `unexpected_error`, matching the same neutral-failure posture every other preview action uses. */
function mapTenantAccessFailure<T>(
  result: Exclude<TenantAccessResult<T>, { status: 'success' }>,
): RecipeTranslationActionResult<never> {
  switch (result.status) {
    case 'not_authenticated':
      return { status: 'not_authenticated' };
    case 'no_membership':
    case 'unauthorized':
      return { status: 'no_access' };
    case 'config_error':
    case 'unexpected_error':
      return { status: 'unexpected_error' };
    default:
      return { status: 'unexpected_error' };
  }
}

const SOURCE_ENTITY_TYPES: ContentSourceEntityType[] = [
  'workforce_recipe',
  'workforce_recipe_ingredient',
  'workforce_recipe_step',
  'workforce_recipe_note',
];
const SOURCE_FIELDS: ContentSourceField[] = ['title', 'description', 'label', 'instruction', 'note_title', 'note_body'];

function isSourceEntityType(value: FormDataEntryValue | null): value is ContentSourceEntityType {
  return typeof value === 'string' && (SOURCE_ENTITY_TYPES as string[]).includes(value);
}

function isSourceField(value: FormDataEntryValue | null): value is ContentSourceField {
  return typeof value === 'string' && (SOURCE_FIELDS as string[]).includes(value);
}

/**
 * Loads a recipe's translation workspace after re-validating (server-side,
 * never trusting a client-supplied source text) that the recipe belongs to
 * the manager's own tenant/location, exactly like `previewSetRecipeContentKind`
 * (`recipe-actions.ts`) already does for its own mutation.
 */
async function loadOwnedWorkspace(
  supabase: Parameters<typeof getWorkforceRecipeDetail>[0],
  tenantId: string,
  locationId: string,
  recipeId: string,
) {
  const detailResult = await getWorkforceRecipeDetail(supabase, tenantId, recipeId);
  if (detailResult.status !== 'success' || !detailResult.data) return null;
  const { recipe } = detailResult.data;
  if (recipe.locationId !== null && recipe.locationId !== locationId) return null;

  const fieldsForLookup = flattenRecipeTranslationFields(
    buildRecipeTranslationWorkspace(detailResult.data, []),
  );
  const translationsResult = await listContentTranslationsForEntities(
    supabase,
    tenantId,
    fieldsForLookup.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
  );
  if (translationsResult.status !== 'success') return null;

  return buildRecipeTranslationWorkspace(detailResult.data, translationsResult.data);
}

/**
 * "Generate English translation" -- Manager-only. Translates every missing
 * or stale, non-reviewed field of one recipe via the configured provider
 * (currently DeepL) and persists accepted results as `machine` translations.
 * Never accepts source text from the client -- everything is re-read from
 * the DB after re-validating the recipe belongs to this manager's tenant.
 */
export async function previewGenerateRecipeTranslation(
  formData: FormData,
): Promise<RecipeTranslationActionResult<{ updatedCount: number; skippedReviewedCount: number }>> {
  const recipeId = parseUuid(formData.get('recipeId'));
  const replaceStaleReviewed = formData.get('replaceStaleReviewed') === 'true';
  if (!recipeId) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const workspace = await loadOwnedWorkspace(supabase, tenantId, locationId, recipeId);
  if (!workspace) return { status: 'not_found' };

  const provider = resolveContentTranslationProvider();
  if (!provider) return { status: 'translation_not_configured' };

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
    { replaceStaleReviewed },
  );

  if (batchResult.error) {
    return { status: batchResult.error.code };
  }

  let updatedCount = 0;
  let failedCount = 0;
  for (const accepted of batchResult.accepted) {
    const writeResult = await setMachineContentTranslation(supabase, tenantId, {
      sourceEntityType: accepted.sourceEntityType,
      sourceEntityId: accepted.sourceEntityId,
      sourceField: accepted.sourceField,
      translatedText: accepted.translatedText,
      sourceContentHash: accepted.sourceContentHash,
      replaceReviewed: replaceStaleReviewed,
    });
    if (writeResult.status === 'success') updatedCount += 1;
    else failedCount += 1;
  }

  if (failedCount > 0) return { status: 'translation_partial_failure' };

  return {
    status: 'success',
    data: { updatedCount, skippedReviewedCount: batchResult.skippedReviewed.length },
  };
}

/** Manual (Manager-authored) translation save/edit -- thin wrapper over the existing `setContentTranslation` service. */
export async function previewSaveManualRecipeTranslation(
  formData: FormData,
): Promise<RecipeTranslationActionResult<{ translationId: string }>> {
  const recipeId = parseUuid(formData.get('recipeId'));
  const sourceEntityId = parseUuid(formData.get('sourceEntityId'));
  const sourceEntityType = formData.get('sourceEntityType');
  const sourceField = formData.get('sourceField');
  const translatedText = formData.get('translatedText');
  const force = formData.get('force') === 'true';

  if (
    !recipeId ||
    !sourceEntityId ||
    !isSourceEntityType(sourceEntityType) ||
    !isSourceField(sourceField) ||
    typeof translatedText !== 'string' ||
    translatedText.trim().length === 0
  ) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }

  const contextResult = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const workspace = await loadOwnedWorkspace(supabase, tenantId, locationId, recipeId);
  if (!workspace) return { status: 'not_found' };

  const field = flattenRecipeTranslationFields(workspace).find(
    (f) => f.sourceEntityType === sourceEntityType && f.sourceEntityId === sourceEntityId && f.sourceField === sourceField,
  );
  if (!field) return { status: 'not_found' };

  const result = await setContentTranslation(supabase, tenantId, {
    sourceEntityType,
    sourceEntityId,
    sourceField,
    targetLanguage: 'en',
    translatedText: translatedText.trim(),
    currentSourceText: field.sourceText,
    force,
  });

  if (result.status === 'confirm_required') return { status: 'translation_requires_force' };
  if (result.status !== 'success') return mapTenantAccessFailure(result);
  return { status: 'success', data: { translationId: result.data.translationId } };
}

/** Confirms an existing translation (machine or manual) as reviewed, without editing its text. */
export async function previewMarkRecipeTranslationReviewed(
  formData: FormData,
): Promise<RecipeTranslationActionResult<{ translationId: string }>> {
  const recipeId = parseUuid(formData.get('recipeId'));
  const translationId = parseUuid(formData.get('translationId'));
  if (!recipeId || !translationId) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const workspace = await loadOwnedWorkspace(supabase, tenantId, locationId, recipeId);
  if (!workspace) return { status: 'not_found' };

  const belongsToRecipe = flattenRecipeTranslationFields(workspace).some(
    (field) => field.existing?.translationId === translationId,
  );
  if (!belongsToRecipe) return { status: 'not_found' };

  const result = await markContentTranslationReviewed(supabase, tenantId, translationId);
  if (result.status === 'not_found') return { status: 'not_found' };
  if (result.status !== 'success') return mapTenantAccessFailure(result);
  return { status: 'success', data: { translationId: result.data.translationId } };
}
