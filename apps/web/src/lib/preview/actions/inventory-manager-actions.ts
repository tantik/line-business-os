'use server';

import {
  upsertInventoryItem,
  setInventoryItemActive,
  permanentlyDeleteInventoryItem,
  listInventoryItemStatus,
  type InventoryItem,
  type InventoryItemStatus,
} from '@/lib/inventory/items';
import {
  parseSetInventoryItemActiveInput,
  parseUpsertInventoryItemInput,
  parseInventoryItemIdInput,
} from '@/lib/inventory/items-input';
import type { InventoryWriteResult } from '@/lib/inventory/result-types';
import { resolvePreviewInventoryManagerContext } from './inventory-authorize';
import { PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';
import { time } from '@/lib/perf/timing';

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
    case 'blocked_by_history':
      return { status: 'blocked_by_history' };
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
 * Manager-only: re-read the current catalog + status list for the manager's
 * own resolved location. Preview Manager architecture (perf phase 2) - the
 * Inventory panel calls this instead of `router.refresh()` after a
 * successful write, so an Inventory mutation refreshes only its own list
 * (one query) instead of the whole Manager page (auth chain + 11-query
 * batch + a full React re-render of every other panel).
 */
export async function previewGetInventoryManagerData(): Promise<PreviewWriteResult<InventoryItemStatus[]>> {
  const contextResult = await resolvePreviewInventoryManagerContext('inventory.item.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;
  const result = await listInventoryItemStatus(supabase, tenantId, locationId, { includeInactive: true });
  return mapInventoryWriteResult(result);
}

/**
 * Manager-only: create/edit a catalog item. `locationId` is always the
 * resolved manager context's own location -- never the client-supplied
 * form field, which is ignored for this write (the item is always created
 * in the manager's own resolved location).
 */
export async function previewUpsertInventoryItem(formData: FormData): Promise<PreviewWriteResult<InventoryItem>> {
  const __actionStart = performance.now();
  const input = parseUpsertInventoryItemInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await time('inventory.upsert:permissionCheck', () =>
    resolvePreviewInventoryManagerContext('inventory.item.manage'),
  );
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const result = await time('inventory.upsert:dbWrite', () =>
    upsertInventoryItem(supabase, tenantId, {
      id: input.id ?? undefined,
      locationId,
      name: input.name,
      unit: input.unit,
      requiredQuantity: input.requiredQuantity,
      reorderPoint: input.reorderPoint,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    }),
  );
  const mapped = mapInventoryWriteResult(result);
  if (process.env.PERF_TIMING_LOG === '1') {
    console.log(`[perf] inventory.upsert:TOTAL ${(performance.now() - __actionStart).toFixed(1)}ms`);
  }
  return mapped;
}

export async function previewSetInventoryItemActive(formData: FormData): Promise<PreviewWriteResult<InventoryItem>> {
  const __actionStart = performance.now();
  const input = parseSetInventoryItemActiveInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await time('inventory.setActive:permissionCheck', () =>
    resolvePreviewInventoryManagerContext('inventory.item.manage'),
  );
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId } = contextResult.context;

  const result = await time('inventory.setActive:dbWrite', () =>
    setInventoryItemActive(supabase, tenantId, input.itemId, input.isActive),
  );
  const mapped = mapInventoryWriteResult(result);
  if (process.env.PERF_TIMING_LOG === '1') {
    console.log(`[perf] inventory.setActive:TOTAL ${(performance.now() - __actionStart).toFixed(1)}ms`);
  }
  return mapped;
}

/**
 * Manager-only: permanently (physically) remove a catalog item. Distinct
 * from `previewSetInventoryItemActive(..., false)` (the normal "Delete",
 * which soft-deletes and always preserves history) -- this refuses when the
 * item has any `inventory.stock_counts` history, via the guarded
 * `api.permanently_delete_inventory_item` RPC (0055).
 */
export async function previewPermanentlyDeleteInventoryItem(formData: FormData): Promise<PreviewWriteResult<{ itemId: string }>> {
  const __actionStart = performance.now();
  const input = parseInventoryItemIdInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await time('inventory.permanentDelete:permissionCheck', () =>
    resolvePreviewInventoryManagerContext('inventory.item.manage'),
  );
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId } = contextResult.context;

  const result = await time('inventory.permanentDelete:dbWrite', () =>
    permanentlyDeleteInventoryItem(supabase, tenantId, input.itemId),
  );
  const mapped = mapInventoryWriteResult(result);
  if (process.env.PERF_TIMING_LOG === '1') {
    console.log(`[perf] inventory.permanentDelete:TOTAL ${(performance.now() - __actionStart).toFixed(1)}ms`);
  }
  return mapped;
}
