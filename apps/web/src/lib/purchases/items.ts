import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { InventoryUnit } from '@/lib/inventory/validation';
import { mapPurchasesReadError } from './pg-error';

/** Flat row shape returned by `api.purchases_needed` (0089). */
interface ApiPurchasesNeededRow {
  item_id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  unit: InventoryUnit;
  required_quantity: string | number;
  reorder_point: string | number;
  actual_quantity: string | number;
  shortage_quantity: string | number;
  latest_stock_count_id: string;
  purchase_status: 'pending' | 'bought';
  actioned_at: string | null;
  actioned_by_staff_id: string | null;
}

export interface PurchaseNeededItem {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  reorderPoint: number;
  actualQuantity: number;
  /** "Need to buy" -- `greatest(requiredQuantity - actualQuantity, 0)`, computed server-side. */
  shortageQuantity: number;
  /** The stock count this row's shortage is pinned to -- required by `markPurchaseBoughtAction`'s optimistic staleness check on the client, mirrors the server-side snapshot check. */
  latestStockCountId: string;
  purchaseStatus: 'pending' | 'bought';
  actionedAt: string | null;
  actionedByStaffId: string | null;
}

function mapRow(row: ApiPurchasesNeededRow): PurchaseNeededItem {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    unit: row.unit,
    requiredQuantity: Number(row.required_quantity),
    reorderPoint: Number(row.reorder_point),
    actualQuantity: Number(row.actual_quantity),
    shortageQuantity: Number(row.shortage_quantity),
    latestStockCountId: row.latest_stock_count_id,
    purchaseStatus: row.purchase_status,
    actionedAt: row.actioned_at,
    actionedByStaffId: row.actioned_by_staff_id,
  };
}

function compareItems(a: PurchaseNeededItem, b: PurchaseNeededItem): number {
  // Pending items surface above already-bought ones; otherwise alphabetical.
  if (a.purchaseStatus !== b.purchaseStatus) return a.purchaseStatus === 'pending' ? -1 : 1;
  return a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId);
}

/**
 * Read the current shopping list through the app-facing API facade,
 * narrowed to the active tenant and location. `api.purchases_needed` already
 * only contains items with `status = 'shortage'` (0089); the
 * tenant_id/location_id filters here are a display narrowing only, not the
 * security boundary -- `inv_items_select`/`inv_stock_counts_select`/
 * `purchases_actions_select` RLS is.
 */
export async function listPurchasesNeeded(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<PurchaseNeededItem[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('purchases_needed')
      .select(
        'item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, actual_quantity, shortage_quantity, latest_stock_count_id, purchase_status, actioned_at, actioned_by_staff_id',
      )
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId);

    if (error) return mapPurchasesReadError(error, 'read purchases items');

    const items = ((data ?? []) as ApiPurchasesNeededRow[]).map(mapRow);
    items.sort(compareItems);
    return { status: 'success', data: items };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading purchases items.',
    };
  }
}
