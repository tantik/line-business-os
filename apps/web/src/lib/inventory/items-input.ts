import { parseBooleanFlag, parseInventoryUnit, parseItemName, parseQuantity, parseSortOrder, parseUuid } from './validation';
import type { InventoryUnit } from './validation';

export interface UpsertInventoryItemFormInput {
  id: string | null;
  locationId: string;
  name: string;
  unit: InventoryUnit;
  requiredQuantity: number;
  sortOrder: number;
  /** `undefined` on create (defaults to active at the DB layer); on edit, `undefined` means "leave unchanged". */
  isActive: boolean | undefined;
}

/** `id` field absent/blank -> create; present -> edit that item. */
export function parseUpsertInventoryItemInput(formData: FormData): UpsertInventoryItemFormInput | null {
  const rawId = formData.get('id');
  const id = typeof rawId === 'string' && rawId.trim().length > 0 ? parseUuid(rawId) : null;
  if (typeof rawId === 'string' && rawId.trim().length > 0 && id === null) return null; // malformed, non-blank id

  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const name = parseItemName(formData.get('name'));
  if (!name) return null;

  const unit = parseInventoryUnit(formData.get('unit'));
  if (!unit) return null;

  const requiredQuantity = parseQuantity(formData.get('requiredQuantity'));
  if (requiredQuantity === null) return null;

  const sortOrder = formData.has('sortOrder') ? parseSortOrder(formData.get('sortOrder')) : 0;
  if (sortOrder === null) return null;

  const hasActiveField = formData.has('isActive');

  return {
    id,
    locationId,
    name,
    unit,
    requiredQuantity,
    sortOrder,
    isActive: hasActiveField ? parseBooleanFlag(formData.get('isActive')) : undefined,
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
