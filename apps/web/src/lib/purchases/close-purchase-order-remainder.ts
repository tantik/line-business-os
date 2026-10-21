import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchasesWriteResult } from './result-types';
import { mapPurchasesWriteError } from './pg-error';

export interface ClosedPurchaseOrderRemainder {
  actionId: string;
  itemId: string;
  orderActionId: string;
  closedQuantity: number;
  actionedAt: string;
}

/**
 * "Cancel the rest" via `api.close_purchase_order_remainder` (0137): logs an
 * 'order_closed' action against the item's current latest stock count so its
 * open order stops being awaited. Never writes to Inventory. `actioned_by` is
 * stamped server-side as `core.current_user_id()`; the audit row is written
 * by the `purchases.audit_order_closed` trigger.
 *
 * `expectedOrderActionId` is the optional guard: if a newer order has replaced
 * the one the caller was looking at, the RPC raises `purchases_stale_snapshot`
 * (surfaced as `{ status: 'stale_snapshot' }`) instead of closing an order the
 * caller never saw.
 */
export async function closePurchaseOrderRemainder(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  itemId: string,
  expectedOrderActionId?: string,
): Promise<PurchasesWriteResult<ClosedPurchaseOrderRemainder>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('close_purchase_order_remainder', {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_item_id: itemId,
        p_expected_order_action_id: expectedOrderActionId ?? null,
      })
      .maybeSingle();

    if (error) return mapPurchasesWriteError(error, 'cancel the rest of this order');
    if (!data) return { status: 'not_found' };

    const row = data as {
      action_id: string;
      item_id: string;
      order_action_id: string;
      closed_quantity: string | number;
      actioned_at: string;
    };
    return {
      status: 'success',
      data: {
        actionId: row.action_id,
        itemId: row.item_id,
        orderActionId: row.order_action_id,
        closedQuantity: Number(row.closed_quantity),
        actionedAt: row.actioned_at,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error cancelling the rest of this order.',
    };
  }
}
