import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { InventoryWriteResult } from './result-types';
import { mapInventoryReadError, mapInventoryWriteError } from './pg-error';
import type { InventoryUnit } from './validation';

/** Flat row shape returned by `api.inventory_item_status`. */
interface ApiInventoryItemStatusRow {
  item_id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  unit: InventoryUnit;
  required_quantity: string | number;
  sort_order: number;
  is_active: boolean;
  actual_quantity: string | number | null;
  counted_at: string | null;
  counted_by_staff_id: string | null;
  shortage_quantity: string | number;
  status: 'unknown' | 'sufficient' | 'shortage';
}

export interface InventoryItemStatus {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  sortOrder: number;
  isActive: boolean;
  actualQuantity: number | null;
  countedAt: string | null;
  countedByStaffId: string | null;
  shortageQuantity: number;
  status: 'unknown' | 'sufficient' | 'shortage';
}

function mapItemStatusRow(row: ApiInventoryItemStatusRow): InventoryItemStatus {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    unit: row.unit,
    requiredQuantity: Number(row.required_quantity),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    actualQuantity: row.actual_quantity === null ? null : Number(row.actual_quantity),
    countedAt: row.counted_at,
    countedByStaffId: row.counted_by_staff_id,
    shortageQuantity: Number(row.shortage_quantity),
    status: row.status,
  };
}

function compareItems(a: InventoryItemStatus, b: InventoryItemStatus): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId);
}

/**
 * Read current inventory status (catalog + latest count + derived
 * shortage/status) through the app-facing API facade, narrowed to the active
 * tenant and location. `api.inventory_item_status` has no additional WHERE
 * beyond RLS (`inv_items_select`/`inv_stock_counts_select`); the
 * tenant_id/location_id filters here are a display narrowing only, not the
 * security boundary.
 *
 * `includeInactive`: manager catalog views need to see deactivated items too
 * (to reactivate/audit them); the staff daily-check view should only ever
 * request `includeInactive: false`.
 */
export async function listInventoryItemStatus(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  options: { includeInactive?: boolean } = {},
): Promise<TenantAccessResult<InventoryItemStatus[]>> {
  try {
    let query = supabase
      .schema('api')
      .from('inventory_item_status')
      .select(
        'item_id, tenant_id, location_id, name, unit, required_quantity, sort_order, is_active, actual_quantity, counted_at, counted_by_staff_id, shortage_quantity, status',
      )
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId);

    if (!options.includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) return mapInventoryReadError(error, 'read inventory items');

    const items = ((data ?? []) as ApiInventoryItemStatusRow[]).map(mapItemStatusRow);
    items.sort(compareItems);
    return { status: 'success', data: items };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading inventory items.',
    };
  }
}

export interface UpsertInventoryItemInput {
  id?: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  sortOrder: number;
  isActive?: boolean;
}

/** Flat row shape returned by `api.inventory_items` (plain catalog, no computed status). */
interface ApiInventoryItemRow {
  item_id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  unit: InventoryUnit;
  required_quantity: string | number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapItemRow(row: ApiInventoryItemRow): InventoryItem {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    unit: row.unit,
    requiredQuantity: Number(row.required_quantity),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create or edit a catalog item (manager-only; enforced by
 * `inv_items_insert`/`inv_items_update` RLS, `inventory.item.manage`). `tenantId`
 * is always the server-resolved active tenant, never a client-supplied value.
 */
export async function upsertInventoryItem(
  supabase: SupabaseClient,
  tenantId: string,
  input: UpsertInventoryItemInput,
): Promise<InventoryWriteResult<InventoryItem>> {
  try {
    const row = {
      tenant_id: tenantId,
      location_id: input.locationId,
      name: input.name,
      unit: input.unit,
      required_quantity: input.requiredQuantity,
      sort_order: input.sortOrder,
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    };

    const query = input.id
      ? supabase
          .schema('api')
          .from('inventory_items')
          .update(row)
          .eq('tenant_id', tenantId)
          .eq('item_id', input.id)
      : supabase.schema('api').from('inventory_items').insert(row);

    const { data, error } = await query
      .select('item_id, tenant_id, location_id, name, unit, required_quantity, sort_order, is_active, created_at, updated_at')
      .maybeSingle();

    if (error) return mapInventoryWriteError(error, 'save this inventory item');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapItemRow(data as ApiInventoryItemRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error saving this inventory item.',
    };
  }
}

/** Deactivate/reactivate an item without deleting it (history in `inventory.stock_counts` is preserved regardless). */
export async function setInventoryItemActive(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  isActive: boolean,
): Promise<InventoryWriteResult<InventoryItem>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('inventory_items')
      .update({ is_active: isActive })
      .eq('tenant_id', tenantId)
      .eq('item_id', itemId)
      .select('item_id, tenant_id, location_id, name, unit, required_quantity, sort_order, is_active, created_at, updated_at')
      .maybeSingle();

    if (error) return mapInventoryWriteError(error, 'update this inventory item');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapItemRow(data as ApiInventoryItemRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error updating this inventory item.',
    };
  }
}

/**
 * Boolean permission check delegating to `api.has_permission` (0019), which
 * forwards to `core.has_permission`. Used to decide whether to render
 * manager-only catalog controls -- a pure UX affordance, never the actual
 * write authorization boundary (RLS is, regardless of what this returns).
 */
export async function hasInventoryPermission(
  supabase: SupabaseClient,
  tenantId: string,
  permission: 'inventory.item.read' | 'inventory.item.manage' | 'inventory.count.write',
  locationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .schema('api')
    .rpc('has_permission', { p_tenant_id: tenantId, p_permission: permission, p_location_id: locationId });
  if (error) return false;
  return data === true;
}
