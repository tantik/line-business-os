import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Shared discriminated result shape for every Inventory write helper,
 * mirroring `@/lib/workforce/result-types.ts`'s `WorkforceWriteResult`
 * (kept as an independent copy -- Inventory does not import from the
 * Workforce module, see `validation.ts`'s header note).
 *
 *   - `not_found`: the target row doesn't exist, isn't visible under RLS to
 *     this caller, or doesn't belong to the active tenant/location -- these
 *     are indistinguishable at the query layer (RLS filters rows, it does
 *     not reject the request), so a zero-row UPDATE/SELECT-after-write is
 *     always reported as `not_found`, never as an error.
 *   - `blocked_by_history`: only ever returned by
 *     `permanentlyDeleteInventoryItem` -- the item has one or more
 *     `inventory.stock_counts` rows referencing it, so the guarded
 *     `api.permanently_delete_inventory_item` RPC (0055) refused to delete
 *     it rather than losing that history.
 */
export type InventoryWriteResult<T> = TenantAccessResult<T> | { status: 'not_found' } | { status: 'blocked_by_history' };
