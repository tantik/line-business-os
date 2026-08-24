import type { SupabaseClient } from '@supabase/supabase-js';
import type { PurchasesWriteResult } from './result-types';
import { mapPurchasesWriteError } from './pg-error';

export interface RecordedPurchaseAction {
  actionId: string;
  itemId: string;
  actionedAt: string;
}

/**
 * Marks an item as bought via `api.record_purchase_action` (0089).
 * `actioned_by` is stamped server-side inside that function as
 * `core.current_user_id()`, and `snapshot_stock_count_id` is resolved
 * server-side from the item's current latest stock count -- this call never
 * sends either. The list shown afterward is always recomputed by
 * `api.purchases_needed`, never trusted from the client that submitted this
 * action.
 */
export async function recordPurchaseAction(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  itemId: string,
): Promise<PurchasesWriteResult<RecordedPurchaseAction>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('record_purchase_action', {
        p_tenant_id: tenantId,
        p_location_id: locationId,
        p_item_id: itemId,
      })
      .maybeSingle();

    if (error) return mapPurchasesWriteError(error, 'mark this item as bought');
    if (!data) return { status: 'not_found' };

    const row = data as { action_id: string; item_id: string; actioned_at: string };
    return {
      status: 'success',
      data: { actionId: row.action_id, itemId: row.item_id, actionedAt: row.actioned_at },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error marking this item as bought.',
    };
  }
}
