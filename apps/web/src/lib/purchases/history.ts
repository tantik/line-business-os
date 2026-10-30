import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { fetchAllRows } from '@/lib/db/fetch-all-rows';
import type { InventoryUnit } from '@/lib/inventory/validation';
import { mapPurchasesReadError } from './pg-error';

/** Flat row shape returned by `api.purchase_history` (0120). */
export interface ApiPurchaseHistoryRow {
  action_id: string;
  tenant_id: string;
  location_id: string;
  item_id: string;
  item_name: string;
  unit: InventoryUnit;
  /** 'order_closed' since 0137 ("cancel the rest" -- no quantity, no Inventory write). */
  action_type: 'bought' | 'ordered' | 'received' | 'order_closed';
  ordered_quantity: string | number | null;
  received_quantity: string | number | null;
  actioned_at: string;
  actioned_by_staff_id: string | null;
}

export interface PurchaseHistoryEntry {
  actionId: string;
  tenantId: string;
  locationId: string;
  itemId: string;
  itemName: string;
  unit: InventoryUnit;
  actionType: 'bought' | 'ordered' | 'received' | 'order_closed';
  orderedQuantity: number | null;
  receivedQuantity: number | null;
  actionedAt: string;
  actionedByStaffId: string | null;
}

function mapRow(row: ApiPurchaseHistoryRow): PurchaseHistoryEntry {
  return {
    actionId: row.action_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    itemId: row.item_id,
    itemName: row.item_name,
    unit: row.unit,
    actionType: row.action_type,
    orderedQuantity: row.ordered_quantity === null ? null : Number(row.ordered_quantity),
    receivedQuantity: row.received_quantity === null ? null : Number(row.received_quantity),
    actionedAt: row.actioned_at,
    actionedByStaffId: row.actioned_by_staff_id,
  };
}

/** Rows of `api.purchase_history` (direct read or `api.manager_dashboard`) -> entries in DB order (newest first). */
export function mapPurchaseHistoryRows(rows: ApiPurchaseHistoryRow[]): PurchaseHistoryEntry[] {
  return rows.map(mapRow);
}

export function mapPurchaseHistoryReadError(error: PostgrestError): TenantAccessResult<never> {
  return mapPurchasesReadError(error, 'read purchase history');
}

/**
 * Read the full append-only purchase action log through the app-facing API
 * facade, narrowed to the active tenant and location, newest first. Mirrors
 * `listPurchasesNeeded`'s exact read pattern: the tenant_id/location_id
 * filters here are a display narrowing only, not the security boundary --
 * `purchases_actions_select`/`inv_items_select` RLS is.
 */
export async function listPurchaseHistory(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<PurchaseHistoryEntry[]>> {
  try {
    // Paged (DEBT-114): the append-only log outgrows max_rows (1000) within months.
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .schema('api')
        .from('purchase_history')
        .select(
          'action_id, tenant_id, location_id, item_id, item_name, unit, action_type, ordered_quantity, received_quantity, actioned_at, actioned_by_staff_id',
        )
        .eq('tenant_id', tenantId)
        .eq('location_id', locationId)
        .order('actioned_at', { ascending: false })
        .order('action_id', { ascending: true })
        .range(from, to),
    );

    if (error) return mapPurchaseHistoryReadError(error);

    return { status: 'success', data: mapPurchaseHistoryRows((data ?? []) as ApiPurchaseHistoryRow[]) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading purchase history.',
    };
  }
}
