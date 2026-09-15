import { parseUuid } from './validation';

export interface RecordPurchaseOrderFormInput {
  locationId: string;
  itemId: string;
  orderedQuantity: number;
}

/** Fail-closed: malformed/missing input (including a non-positive quantity) returns `null`, never throws -- the server-side `purchases_invalid_quantity` check remains the authoritative guard regardless. */
export function parseRecordPurchaseOrderInput(formData: FormData): RecordPurchaseOrderFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;

  const rawQuantity = formData.get('orderedQuantity');
  const orderedQuantity = typeof rawQuantity === 'string' ? Number(rawQuantity) : NaN;
  if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0) return null;

  return { locationId, itemId, orderedQuantity };
}
