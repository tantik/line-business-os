import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { InventoryUnit } from '@/lib/inventory/validation';
import { mapPurchasesReadError } from './pg-error';

/** Flat row shape returned by `api.purchases_awaiting_delivery` (0137). */
export interface ApiPurchasesAwaitingDeliveryRow {
  item_id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  unit: InventoryUnit;
  required_quantity: string | number;
  reorder_point: string | number;
  actual_quantity: string | number;
  shortage_quantity: string | number;
  is_short: boolean;
  latest_stock_count_id: string;
  order_action_id: string;
  ordered_quantity: string | number;
  received_since_order_quantity: string | number;
  open_order_quantity: string | number;
  ordered_at: string;
  ordered_by_staff_id: string | null;
}

/**
 * One item whose latest 'ordered' action is still open (0137): part (or all)
 * of the ordered quantity has not been received yet and nobody cancelled the
 * rest. Listed whether or not the item is still short (`isShort`).
 */
export interface PurchaseAwaitingDeliveryItem {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  reorderPoint: number;
  actualQuantity: number;
  shortageQuantity: number;
  isShort: boolean;
  /** The item's current latest stock count -- passed to Receive as its optimistic-concurrency guard. */
  latestStockCountId: string;
  /** The open 'ordered' action -- passed to "cancel the rest" as `p_expected_order_action_id`. */
  orderActionId: string;
  orderedQuantity: number;
  receivedSinceOrderQuantity: number;
  /** Still expected: `orderedQuantity - receivedSinceOrderQuantity`, always > 0 here (computed server-side). */
  openOrderQuantity: number;
  orderedAt: string;
  orderedByStaffId: string | null;
}

export const AWAITING_DELIVERY_COLUMNS =
  'item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, actual_quantity, shortage_quantity, is_short, latest_stock_count_id, order_action_id, ordered_quantity, received_since_order_quantity, open_order_quantity, ordered_at, ordered_by_staff_id';

export function mapAwaitingDeliveryRow(row: ApiPurchasesAwaitingDeliveryRow): PurchaseAwaitingDeliveryItem {
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
    isShort: row.is_short === true,
    latestStockCountId: row.latest_stock_count_id,
    orderActionId: row.order_action_id,
    orderedQuantity: Number(row.ordered_quantity),
    receivedSinceOrderQuantity: Number(row.received_since_order_quantity),
    openOrderQuantity: Number(row.open_order_quantity),
    orderedAt: row.ordered_at,
    orderedByStaffId: row.ordered_by_staff_id,
  };
}

/** Oldest order first (it has been waiting longest), then by name for a stable order. */
function compareAwaiting(a: PurchaseAwaitingDeliveryItem, b: PurchaseAwaitingDeliveryItem): number {
  return a.orderedAt.localeCompare(b.orderedAt) || a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId);
}

/**
 * Splits the open orders against the shopping list so every item is shown in
 * exactly ONE place on the Purchases screen:
 *   - `openOrderByItemId`: open orders of items that are also on the shopping
 *     list (still short) -- rendered inline on that item's existing row;
 *   - `awaitingOnly`: open orders of items NOT on the shopping list (stock
 *     already above the reorder point, e.g. "ordered 8 L, received 4 L") --
 *     rendered in the separate 「入荷待ち」 section.
 * Membership is decided by the shopping list actually rendered (not by
 * `isShort`), so an item can never appear twice or vanish if the two views
 * were read a moment apart.
 */
export function splitAwaitingDelivery(
  neededItemIds: Iterable<string>,
  awaiting: readonly PurchaseAwaitingDeliveryItem[],
): { openOrderByItemId: Map<string, PurchaseAwaitingDeliveryItem>; awaitingOnly: PurchaseAwaitingDeliveryItem[] } {
  const needed = new Set(neededItemIds);
  const openOrderByItemId = new Map<string, PurchaseAwaitingDeliveryItem>();
  const awaitingOnly: PurchaseAwaitingDeliveryItem[] = [];
  for (const entry of awaiting) {
    if (needed.has(entry.itemId)) openOrderByItemId.set(entry.itemId, entry);
    else awaitingOnly.push(entry);
  }
  awaitingOnly.sort(compareAwaiting);
  return { openOrderByItemId, awaitingOnly };
}

/**
 * Read the open ("awaiting delivery") orders through the app-facing API
 * facade, narrowed to the active tenant and location. Mirrors
 * `listPurchasesNeeded`'s read pattern: the tenant_id/location_id filters are
 * a display narrowing only, not the security boundary -- the view is
 * security_invoker over `inv_items_select`/`inv_stock_counts_select`/
 * `purchases_actions_select` RLS.
 */
export async function listPurchasesAwaitingDelivery(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<PurchaseAwaitingDeliveryItem[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('purchases_awaiting_delivery')
      .select(AWAITING_DELIVERY_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId);

    if (error) return mapPurchasesReadError(error, 'read awaiting deliveries');

    const items = ((data ?? []) as unknown as ApiPurchasesAwaitingDeliveryRow[]).map(mapAwaitingDeliveryRow);
    items.sort(compareAwaiting);
    return { status: 'success', data: items };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading awaiting deliveries.',
    };
  }
}
