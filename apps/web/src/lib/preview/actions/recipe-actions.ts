'use server';

import {
  getWorkforceRecipeDetail,
  listWorkforceRecipes,
  setWorkforceRecipeArchived,
  upsertWorkforceRecipe,
  type WorkforceRecipeDetail,
} from '@/lib/workforce/recipes';
import { parseUpsertRecipeInput } from '@/lib/workforce/recipe-input';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

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
  const recipeIdByPath = new Map(media.map((recipe) => [recipe.mediaPath as string, recipe.recipeId]));
  const signed = await context.context.supabase.storage
    .from('recipe-media')
    .createSignedUrls(media.map((recipe) => recipe.mediaPath as string), 3600);
  if (signed.error) return { status: 'unexpected_error' };
  return {
    status: 'success',
    data: Object.fromEntries(signed.data.flatMap((entry) => {
      if (!entry.path || !entry.signedUrl) return [];
      const recipeId = recipeIdByPath.get(entry.path);
      return recipeId ? [[recipeId, entry.signedUrl]] : [];
    })),
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

export async function previewUpsertRecipe(formData: FormData): Promise<PreviewWriteResult<{ recipeId: string }>> {
  const input = parseUpsertRecipeInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0 &&
      (photo.size > MAX_RECIPE_PHOTO_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }
  const context = await resolvePreviewManagerContext('workforce.recipe.manage');
  if (context.status !== 'ok') return context.result;
  if (input.status === 'published') {
    const publishContext = await resolvePreviewManagerContext('workforce.recipe.publish');
    if (publishContext.status !== 'ok') return publishContext.result;
  }
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
  return { status: 'success', data: saved.data };
}
