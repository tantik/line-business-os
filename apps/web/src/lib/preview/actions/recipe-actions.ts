'use server';

import { listWorkforceRecipes, updateWorkforceRecipeContentKind, type WorkforceRecipe } from '@/lib/workforce/recipes';
import { parseUuid } from '@/lib/workforce/validation';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

export async function previewSetRecipeContentKind(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceRecipe>> {
  const recipeId = parseUuid(formData.get('recipeId'));
  const rawContentKind = formData.get('contentKind');
  if (!recipeId || (rawContentKind !== 'recipe' && rawContentKind !== 'instruction')) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }

  const contextResult = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const recipesResult = await listWorkforceRecipes(supabase, tenantId);
  if (recipesResult.status !== 'success') return { status: 'unexpected_error' };
  const target = recipesResult.data.find((recipe) => recipe.recipeId === recipeId);
  if (!target || (target.locationId !== null && target.locationId !== locationId)) {
    return { status: 'not_found' };
  }

  return mapWorkforceWriteResult(
    await updateWorkforceRecipeContentKind(supabase, tenantId, recipeId, rawContentKind),
  );
}
