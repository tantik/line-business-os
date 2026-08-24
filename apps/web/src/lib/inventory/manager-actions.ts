'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { parseSetInventoryItemActiveInput, parseUpsertInventoryItemInput } from './items-input';
import { parseUuid } from './validation';
import { listInventoryItemStatus, permanentlyDeleteInventoryItem, setInventoryItemActive, upsertInventoryItem, type InventoryItem } from './items';
import type { InventoryWriteResult } from './result-types';

/**
 * Server Actions for the Inventory catalog (manager-only; enforced by RLS --
 * `inv_items_insert`/`inv_items_update`, both `inventory.item.manage`). Thin
 * controllers: validate -> resolve tenant -> delegate to `items.ts`, which
 * owns the actual Supabase calls. `tenantId` always comes from
 * `requireTenantContext()` (server-resolved active membership), never from
 * client input.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

/** Matches the recipe photo action's own limit (`MAX_RECIPE_PHOTO_BYTES` in `recipe-actions.ts`) -- client-side check in `item-form.tsx` is a fast-fail UX nicety, the server re-checks regardless. */
const MAX_ITEM_PHOTO_BYTES = 2 * 1024 * 1024;
const ITEM_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function upsertInventoryItemAction(formData: FormData): Promise<InventoryWriteResult<InventoryItem>> {
  const input = parseUpsertInventoryItemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const photo = formData.get('photo');
  if (photo instanceof File && photo.size > 0 &&
      (photo.size > MAX_ITEM_PHOTO_BYTES || !ITEM_PHOTO_MIME_TYPES.includes(photo.type as (typeof ITEM_PHOTO_MIME_TYPES)[number]))) {
    return INVALID_INPUT_RESULT;
  }

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  // Photo handling mirrors `upsertRecipe` (`@/lib/workforce/recipe-actions.ts`,
  // WP-6): a brand-new item's Storage path embeds its own `itemId`, which
  // only exists after the first insert, so a new item's photo upload is a
  // second, immediately-following update rather than part of the initial
  // insert.
  let previousMediaPath: string | null = null;
  if (input.id) {
    const existingResult = await listInventoryItemStatus(supabase, tenantId, input.locationId, { includeInactive: true });
    if (existingResult.status !== 'success') return existingResult;
    const existing = existingResult.data.find((item) => item.itemId === input.id);
    if (!existing) return { status: 'not_found' };
    previousMediaPath = existing.mediaPath;
  }
  const mediaPath = formData.get('removePhoto') === 'true' ? null : previousMediaPath;

  const saved = await upsertInventoryItem(supabase, tenantId, {
    id: input.id ?? undefined,
    locationId: input.locationId,
    name: input.name,
    unit: input.unit,
    requiredQuantity: input.requiredQuantity,
    reorderPoint: input.reorderPoint,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    mediaPath,
  });
  if (saved.status !== 'success') return saved;

  let nextMediaPath = mediaPath;
  if (photo instanceof File && photo.size > 0) {
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    nextMediaPath = `${tenantId}/${input.locationId}/${saved.data.itemId}/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from('inventory-media').upload(nextMediaPath, photo, {
      contentType: photo.type, cacheControl: '3600', upsert: false,
    });
    if (upload.error) return { status: 'unexpected_error', message: `Could not upload the photo: ${upload.error.message}` };
    const mediaSaved = await upsertInventoryItem(supabase, tenantId, {
      id: saved.data.itemId,
      locationId: input.locationId,
      name: input.name,
      unit: input.unit,
      requiredQuantity: input.requiredQuantity,
      reorderPoint: input.reorderPoint,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      mediaPath: nextMediaPath,
    });
    if (mediaSaved.status !== 'success') {
      await supabase.storage.from('inventory-media').remove([nextMediaPath]);
      return mediaSaved;
    }
    if (previousMediaPath && previousMediaPath !== nextMediaPath) {
      await supabase.storage.from('inventory-media').remove([previousMediaPath]);
    }
    return mediaSaved;
  }
  if (previousMediaPath && previousMediaPath !== nextMediaPath) {
    await supabase.storage.from('inventory-media').remove([previousMediaPath]);
  }
  return saved;
}

export async function setInventoryItemActiveAction(formData: FormData): Promise<InventoryWriteResult<InventoryItem>> {
  const input = parseSetInventoryItemActiveInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return setInventoryItemActive(supabase, tenantContext.data.activeTenant.tenantId, input.itemId, input.isActive);
}

export async function deleteInventoryItemAction(formData: FormData): Promise<InventoryWriteResult<{ itemId: string; mediaPath: string | null }>> {
  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const result = await permanentlyDeleteInventoryItem(supabase, tenantContext.data.activeTenant.tenantId, itemId);
  if (result.status === 'success' && result.data.mediaPath) {
    await supabase.storage.from('inventory-media').remove([result.data.mediaPath]);
  }
  return result;
}
