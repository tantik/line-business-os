import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryWriteResult } from './result-types';
import { mapInventoryWriteError } from './pg-error';

export interface RecordedInventoryStockCount {
  countId: string;
  itemId: string;
  actualQuantity: number;
  countedAt: string;
}

/**
 * Records a new actual-quantity stock count via `api.record_inventory_stock_count`
 * (0038). `counted_by` is stamped server-side inside that function as
 * `core.current_user_id()` -- this call never sends a counted-by identity,
 * and the shortage/status shown afterward is always recomputed by
 * `api.inventory_item_status`, never trusted from the client that submitted
 * this count.
 */
export async function recordInventoryStockCount(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  itemId: string,
  actualQuantity: number,
): Promise<InventoryWriteResult<RecordedInventoryStockCount>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('record_inventory_stock_count', {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_item_id: itemId,
        p_actual_quantity: actualQuantity,
      })
      .maybeSingle();

    if (error) return mapInventoryWriteError(error, 'record this stock count');
    if (!data) return { status: 'not_found' };

    const row = data as { count_id: string; item_id: string; actual_quantity: string | number; counted_at: string };
    return {
      status: 'success',
      data: {
        countId: row.count_id,
        itemId: row.item_id,
        actualQuantity: Number(row.actual_quantity),
        countedAt: row.counted_at,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error recording this stock count.',
    };
  }
}
