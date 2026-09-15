import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchasesWriteResult } from './result-types';
import { mapPurchasesWriteError } from './pg-error';

export interface RecordedPurchaseOrder {
  actionId: string;
  itemId: string;
  orderedQuantity: number;
  actionedAt: string;
}

/**
 * Logs an "Ordered" acknowledgement via `api.record_purchase_order` (0120).
 * Informational only -- never writes to Inventory. `actioned_by` is stamped
 * server-side inside that function as `core.current_user_id()`, and
 * `snapshot_stock_count_id` is resolved server-side from the item's current
 * latest stock count -- this call never sends either. The list shown
 * afterward is always recomputed by `api.purchases_needed`, never trusted
 * from the client that submitted this action.
 */
export async function recordPurchaseOrder(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  itemId: string,
  orderedQuantity: number,
): Promise<PurchasesWriteResult<RecordedPurchaseOrder>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('record_purchase_order', {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_item_id: itemId,
        p_ordered_quantity: orderedQuantity,
      })
      .maybeSingle();

    if (error) return mapPurchasesWriteError(error, 'record this order');
    if (!data) return { status: 'not_found' };

    const row = data as { action_id: string; item_id: string; ordered_quantity: string | number; actioned_at: string };
    return {
      status: 'success',
      data: {
        actionId: row.action_id,
        itemId: row.item_id,
        orderedQuantity: Number(row.ordered_quantity),
        actionedAt: row.actioned_at,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error recording this order.',
    };
  }
}
