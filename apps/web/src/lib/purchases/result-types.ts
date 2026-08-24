import type { TenantAccessResult } from '@/lib/tenant/types';

/**
 * Shared discriminated result shape for every Purchases write helper,
 * mirroring `@/lib/inventory/result-types.ts`'s `InventoryWriteResult` (kept
 * as an independent copy for the same reason Inventory's own copy is
 * independent from Workforce's -- see `validation.ts`'s header note).
 *
 *   - `not_found`: the target row doesn't exist, isn't visible under RLS to
 *     this caller, or doesn't belong to the active tenant/location -- RLS
 *     filters rows rather than rejecting the request, so a zero-row RPC
 *     result is always reported as `not_found`, never as an error.
 *   - `not_short`: the item is not currently in shortage (already bought
 *     elsewhere, restocked, or was never short to begin with) --
 *     `purchases_actions_insert` RLS refuses the insert in this case; this
 *     status lets the UI show "this item no longer needs buying" instead of
 *     a generic error.
 */
export type PurchasesWriteResult<T> =
  | TenantAccessResult<T>
  | { status: 'not_found' }
  | { status: 'not_short' };
