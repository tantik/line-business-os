import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchasesWriteResult } from './result-types';
import { mapPurchasesWriteError } from './pg-error';

export interface RecordedPurchaseReceipt {
  actionId: string;
  itemId: string;
  receivedQuantity: number;
  newActualQuantity: number;
  actionedAt: string;
}

/**
 * Records a real delivery via `api.record_purchase_receipt` (0120): writes
 * the new total into Inventory through that function's own call to the
 * unmodified `api.record_inventory_stock_count` (the sole canonical
 * quantity mechanism), then logs a 'received' action row, in one
 * transaction. `actioned_by`/`counted_by` are always stamped server-side as
 * `core.current_user_id()` -- this call never sends either.
 *
 * `expectedStockCountId` is the optional optimistic-concurrency guard: pass
 * the item's `latestStockCountId` this caller last observed. If the item's
 * true latest stock count has moved on since (a duplicate submit, or
 * someone else's concurrent count/receipt for the same item), the RPC
 * raises `purchases_stale_snapshot` instead of silently receiving against
 * data the caller never actually saw -- surfaced here as
 * `{ status: 'stale_snapshot' }`.
 */
export async function recordPurchaseReceipt(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  itemId: string,
  receivedQuantity: number,
  expectedStockCountId?: string,
): Promise<PurchasesWriteResult<RecordedPurchaseReceipt>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('record_purchase_receipt', {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_item_id: itemId,
        p_received_quantity: receivedQuantity,
        p_expected_stock_count_id: expectedStockCountId ?? null,
      })
      .maybeSingle();

    if (error) return mapPurchasesWriteError(error, 'record this delivery');
    if (!data) return { status: 'not_found' };

    const row = data as {
      action_id: string;
      item_id: string;
      received_quantity: string | number;
      new_actual_quantity: string | number;
      actioned_at: string;
    };
    return {
      status: 'success',
      data: {
        actionId: row.action_id,
        itemId: row.item_id,
        receivedQuantity: Number(row.received_quantity),
        newActualQuantity: Number(row.new_actual_quantity),
        actionedAt: row.actioned_at,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error recording this delivery.',
    };
  }
}
