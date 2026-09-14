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
 *   - `invalid_quantity`: the ordered/received quantity was missing or
 *     `<= 0` -- `purchases_invalid_quantity` (0120), raised by
 *     `api.record_purchase_order`/`api.record_purchase_receipt` before any
 *     RLS check runs.
 *   - `stale_snapshot`: `p_expected_stock_count_id` no longer matches the
 *     item's true latest stock count -- `purchases_stale_snapshot` (0120),
 *     raised by `api.record_purchase_receipt`'s optional optimistic-
 *     concurrency guard when a duplicate/concurrent submit races a newer
 *     count for the same item.
 */
export type PurchasesWriteResult<T> =
  | TenantAccessResult<T>
  | { status: 'not_found' }
  | { status: 'not_short' }
  | { status: 'invalid_quantity' }
  | { status: 'stale_snapshot' };
