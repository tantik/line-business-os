import { parseBooleanFlag, parseInventoryUnit, parseItemName, parseQuantity, parseSortOrder, parseUuid } from './validation';
import type { InventoryUnit } from './validation';
import type { InventoryItemInputError } from './result-types';

export interface UpsertInventoryItemFormInput {
  id: string | null;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  reorderPoint: number;
  sortOrder: number;
  /** `undefined` on create (defaults to active at the DB layer); on edit, `undefined` means "leave unchanged". */
  isActive: boolean | undefined;
}

export type ParseUpsertInventoryItemResult =
  | { ok: true; input: UpsertInventoryItemFormInput }
  | { ok: false; reason: InventoryItemInputError };

function invalid(reason: InventoryItemInputError): ParseUpsertInventoryItemResult {
  return { ok: false, reason };
}

/**
 * `id` field absent/blank -> create; present -> edit that item. Fail-closed:
 * the first invalid field wins and is reported as a specific `reason` so the
 * form can tell the user what to fix.
 */
export function parseUpsertInventoryItemInput(formData: FormData): ParseUpsertInventoryItemResult {
  const rawId = formData.get('id');
  const id = typeof rawId === 'string' && rawId.trim().length > 0 ? parseUuid(rawId) : null;
  if (typeof rawId === 'string' && rawId.trim().length > 0 && id === null) return invalid('invalid_request'); // malformed, non-blank id

  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return invalid('invalid_request');

  const name = parseItemName(formData.get('name'));
  if (!name) return invalid('invalid_name');

  const unit = parseInventoryUnit(formData.get('unit'));
  if (!unit) return invalid('invalid_unit');

  const requiredQuantity = parseQuantity(formData.get('requiredQuantity'));
  if (requiredQuantity === null) return invalid('invalid_target_quantity');

  const reorderPoint = parseQuantity(formData.get('reorderPoint'));
  if (reorderPoint === null) return invalid('invalid_reorder_point');
  // Mirrors the DB CHECK `inventory_items_reorder_point_check` (0046).
  if (reorderPoint > requiredQuantity) return invalid('reorder_above_target');

  const sortOrder = formData.has('sortOrder') ? parseSortOrder(formData.get('sortOrder')) : 0;
  if (sortOrder === null) return invalid('invalid_sort_order');

  const hasActiveField = formData.has('isActive');

  return {
    ok: true,
    input: {
      id,
      locationId,
      name,
      unit,
      requiredQuantity,
      reorderPoint,
      sortOrder,
      isActive: hasActiveField ? parseBooleanFlag(formData.get('isActive')) : undefined,
    },
  };
}

export interface SetInventoryItemActiveFormInput {
  itemId: string;
  isActive: boolean;
}

export function parseSetInventoryItemActiveInput(formData: FormData): SetInventoryItemActiveFormInput | null {
  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;
  return { itemId, isActive: parseBooleanFlag(formData.get('isActive')) };
}

/** Shared by the Permanent Delete action -- just the target item id. */
export function parseInventoryItemIdInput(formData: FormData): { itemId: string } | null {
  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;
  return { itemId };
}
