'use server';

import {
  getWorkforceRecipeDetail,
  upsertWorkforceRecipe,
  type WorkforceRecipeDetail,
} from '@/lib/workforce/recipes';
import { parseUpsertRecipeInput } from '@/lib/workforce/recipe-input';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

export type PreviewEditableRecipeDetail = WorkforceRecipeDetail & { mediaUrl: string | null };

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

export async function previewUpsertRecipe(formData: FormData): Promise<PreviewWriteResult<{ recipeId: string }>> {
  const input = parseUpsertRecipeInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;
  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0 &&
      (photo.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type))) {
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
