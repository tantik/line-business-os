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
  reorder_point: string | number;
  sort_order: number;
  is_active: boolean;
  actual_quantity: string | number | null;
  counted_at: string | null;
  counted_by_staff_id: string | null;
  shortage_quantity: string | number;
  status: 'unknown' | 'sufficient' | 'shortage';
  media_path: string | null;
}

export interface InventoryItemStatus {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  reorderPoint: number;
  sortOrder: number;
  isActive: boolean;
  actualQuantity: number | null;
  countedAt: string | null;
  countedByStaffId: string | null;
  shortageQuantity: number;
  status: 'unknown' | 'sufficient' | 'shortage';
  mediaPath: string | null;
}

function mapItemStatusRow(row: ApiInventoryItemStatusRow): InventoryItemStatus {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    unit: row.unit,
    requiredQuantity: Number(row.required_quantity),
    reorderPoint: Number(row.reorder_point),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    actualQuantity: row.actual_quantity === null ? null : Number(row.actual_quantity),
    countedAt: row.counted_at,
    countedByStaffId: row.counted_by_staff_id,
    shortageQuantity: Number(row.shortage_quantity),
    status: row.status,
    mediaPath: row.media_path,
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
        'item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, sort_order, is_active, actual_quantity, counted_at, counted_by_staff_id, shortage_quantity, status, media_path',
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
  reorderPoint: number;
  sortOrder: number;
  isActive?: boolean;
  /** Storage object path for this item's photo, `null` to clear it, or `undefined` to leave the existing value untouched. */
  mediaPath?: string | null;
}

/** Flat row shape returned by `api.inventory_items` (plain catalog, no computed status). */
interface ApiInventoryItemRow {
  item_id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  unit: InventoryUnit;
  required_quantity: string | number;
  reorder_point: string | number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  media_path: string | null;
}

export interface InventoryItem {
  itemId: string;
  tenantId: string;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  reorderPoint: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  mediaPath: string | null;
}

function mapItemRow(row: ApiInventoryItemRow): InventoryItem {
  return {
    itemId: row.item_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.name,
    unit: row.unit,
    requiredQuantity: Number(row.required_quantity),
    reorderPoint: Number(row.reorder_point),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mediaPath: row.media_path,
  };
}

/**
 * Batch-sign the storage media path for every item that has one, keyed by
 * `itemId` -- same one-call-per-list pattern as `createRecipeMediaUrlMap`
 * (`@/lib/workforce/recipes.ts`), against the `inventory-media` bucket.
 */
export async function createInventoryMediaUrlMap(
  supabase: SupabaseClient,
  items: Array<{ itemId: string; mediaPath: string | null }>,
): Promise<Record<string, string>> {
  const media = items.filter((item) => item.mediaPath);
  if (media.length === 0) return {};
  const itemIdByPath = new Map(media.map((item) => [item.mediaPath as string, item.itemId]));
  const signed = await supabase.storage
    .from('inventory-media')
    .createSignedUrls(media.map((item) => item.mediaPath as string), 3600);
  if (signed.error) return {};
  return Object.fromEntries(signed.data.flatMap((entry) => {
    if (!entry.path || !entry.signedUrl) return [];
    const itemId = itemIdByPath.get(entry.path);
    return itemId ? [[itemId, entry.signedUrl]] : [];
  }));
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
      reorder_point: input.reorderPoint,
      sort_order: input.sortOrder,
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.mediaPath !== undefined ? { media_path: input.mediaPath } : {}),
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
      .select('item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, sort_order, is_active, created_at, updated_at, media_path')
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
      .select('item_id, tenant_id, location_id, name, unit, required_quantity, reorder_point, sort_order, is_active, created_at, updated_at, media_path')
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

/** Flat row shape returned by `api.permanently_delete_inventory_item` (0055, media_path added by 0085). */
interface ApiPermanentDeleteRow {
  deleted: boolean;
  blocked_by_history: boolean;
  media_path: string | null;
}

/**
 * Hard-delete an item, but only when it has zero `inventory.stock_counts`
 * history -- calls `api.permanently_delete_inventory_item` (0055), an
 * invoker-only passthrough to the guarded `inventory.permanently_delete_item`
 * SECURITY DEFINER helper, since `inventory.items` itself has no DELETE RLS
 * policy by design (the DEFINER logic lives outside `api` per ADR 0008).
 * Distinct from `setInventoryItemActive`, which remains the normal,
 * always-available soft-delete/reactivate path and never touches this RPC.
 */
export async function permanentlyDeleteInventoryItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
): Promise<InventoryWriteResult<{ itemId: string; mediaPath: string | null }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('permanently_delete_inventory_item', { p_tenant_id: tenantId, p_item_id: itemId });

    if (error) return mapInventoryWriteError(error, 'permanently delete this inventory item');

    const row = (Array.isArray(data) ? data[0] : data) as ApiPermanentDeleteRow | undefined;
    if (!row) return { status: 'not_found' };
    if (row.blocked_by_history) return { status: 'blocked_by_history' };
    if (!row.deleted) return { status: 'unexpected_error', message: 'Unable to permanently delete this inventory item right now.' };
    return { status: 'success', data: { itemId, mediaPath: row.media_path } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error permanently deleting this inventory item.',
    };
  }
}

export interface InventoryItemReferenceData {
  referenceUnitPrice: number | null;
  allergenCodes: string[] | null;
}

/** Flat row shape returned by `api.get_inventory_item_reference_data`. */
interface ApiInventoryItemReferenceDataRow {
  reference_unit_price: string | number | null;
  allergen_codes: string[] | null;
}

/**
 * Manager-only (WP5) read-back of an item's reference_unit_price/
 * allergen_codes -- the edit form's only way to see its own previously-saved
 * values, since neither field is exposed by `api.inventory_items`/
 * `api.inventory_item_status`. Calls `api.get_inventory_item_reference_data`
 * (0121), which raises `permission_denied` (42501) for a Staff-only caller;
 * that surfaces here as `unauthorized`, never thrown.
 */
export async function getInventoryItemReferenceData(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
): Promise<TenantAccessResult<InventoryItemReferenceData>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('get_inventory_item_reference_data', { p_tenant_id: tenantId, p_item_id: itemId });
    if (error) return mapInventoryReadError(error, "read this item's reference price/allergens");
    const row = (Array.isArray(data) ? data[0] : data) as ApiInventoryItemReferenceDataRow | undefined;
    if (!row) return { status: 'success', data: { referenceUnitPrice: null, allergenCodes: null } };
    return {
      status: 'success',
      data: {
        referenceUnitPrice: row.reference_unit_price === null ? null : Number(row.reference_unit_price),
        allergenCodes: row.allergen_codes,
      },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : "Unexpected error reading this item's reference price/allergens.",
    };
  }
}

/**
 * Manager-only (WP5): sets the Manager-maintained ESTIMATE reference unit
 * price on an Inventory item -- never a receiving/accounting price. Calls
 * `api.set_inventory_item_reference_price` (0121), which does its own
 * explicit `inventory.item.manage` check and raises `permission_denied`
 * (42501) for anyone else; this function never selects/returns
 * `reference_unit_price` from `inventory.items` at all (it stays off
 * `api.inventory_items`/`api.inventory_item_status` entirely -- see 0121's
 * header), so there is nothing for a Staff-permission caller to read back
 * even if this RPC were somehow reachable.
 */
export async function setInventoryItemReferencePrice(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  referenceUnitPrice: number | null,
): Promise<InventoryWriteResult<void>> {
  try {
    const { error } = await supabase
      .schema('api')
      .rpc('set_inventory_item_reference_price', { p_tenant_id: tenantId, p_item_id: itemId, p_reference_unit_price: referenceUnitPrice });
    if (error) return mapInventoryWriteError(error, 'set this item\'s reference price');
    return { status: 'success', data: undefined };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error setting this item\'s reference price.',
    };
  }
}

/**
 * Manager-only (WP5): sets an Inventory item's allergen codes.
 * `null` = not configured/unknown; `[]` = Manager explicitly confirmed no
 * known allergens -- callers control which of the two they send, this
 * function never conflates them. Calls `api.set_inventory_item_allergens`
 * (0121), same permission-check pattern as `setInventoryItemReferencePrice`.
 */
export async function setInventoryItemAllergens(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  allergenCodes: string[] | null,
): Promise<InventoryWriteResult<void>> {
  try {
    const { error } = await supabase
      .schema('api')
      .rpc('set_inventory_item_allergens', { p_tenant_id: tenantId, p_item_id: itemId, p_allergen_codes: allergenCodes });
    if (error) return mapInventoryWriteError(error, 'set this item\'s allergens');
    return { status: 'success', data: undefined };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error setting this item\'s allergens.',
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
