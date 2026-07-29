'use server';

import { upsertInventoryItem, setInventoryItemActive, type InventoryItem } from '@/lib/inventory/items';
import {
  parseSetInventoryItemActiveInput,
  parseUpsertInventoryItemInput,
} from '@/lib/inventory/items-input';
import type { InventoryWriteResult } from '@/lib/inventory/result-types';
import { resolvePreviewInventoryManagerContext } from './inventory-authorize';
import { PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/**
 * Manager-only Inventory catalog write actions. Kept in their own module
 * (never shared with `inventory-staff-actions.ts`) so this file's Server
 * Action manifest entries are only ever workers for the manager preview
 * route -- Next's reference manifest attributes every export in a `'use
 * server'` file to every route that imports *any* export from it, so mixing
 * manager- and staff-only actions in one file would register both routes'
 * actions on both routes, defeating `verify-preview-server-actions.mjs`'s
 * per-route allowlist. Matches the existing split between
 * `schedule-actions.ts` (manager) and `staff-schedule-actions.ts` (staff).
 */

function mapInventoryWriteResult<T>(result: InventoryWriteResult<T>): PreviewWriteResult<T> {
  switch (result.status) {
    case 'success':
      return { status: 'success', data: result.data };
    case 'not_found':
      return { status: 'not_found' };
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

/**
 * Manager-only: create/edit a catalog item. `locationId` is always the
 * resolved manager context's own location -- never the client-supplied
 * form field, which is ignored for this write (the item is always created
 * in the manager's own resolved location).
 */
export async function previewUpsertInventoryItem(formData: FormData): Promise<PreviewWriteResult<InventoryItem>> {
  const input = parseUpsertInventoryItemInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewInventoryManagerContext('inventory.item.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  return mapInventoryWriteResult(
    await upsertInventoryItem(supabase, tenantId, {
      id: input.id ?? undefined,
      locationId,
      name: input.name,
      unit: input.unit,
      requiredQuantity: input.requiredQuantity,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    }),
  );
}

export async function previewSetInventoryItemActive(formData: FormData): Promise<PreviewWriteResult<InventoryItem>> {
  const input = parseSetInventoryItemActiveInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewInventoryManagerContext('inventory.item.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId } = contextResult.context;

  return mapInventoryWriteResult(await setInventoryItemActive(supabase, tenantId, input.itemId, input.isActive));
}
