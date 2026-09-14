import { parseUuid } from './validation';

export interface RecordPurchaseReceiptFormInput {
  locationId: string;
  itemId: string;
  receivedQuantity: number;
  /** Optional optimistic-concurrency guard -- see `record-purchase-receipt.ts`. Omitted (not merely empty) when the caller has no snapshot to pass. */
  expectedStockCountId?: string;
}

/** Fail-closed: malformed/missing required input (including a non-positive quantity) returns `null`, never throws. `expectedStockCountId` is optional -- an invalid/missing value is simply omitted, never treated as a parse failure. */
export function parseRecordPurchaseReceiptInput(formData: FormData): RecordPurchaseReceiptFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;

  const rawQuantity = formData.get('receivedQuantity');
  const receivedQuantity = typeof rawQuantity === 'string' ? Number(rawQuantity) : NaN;
  if (!Number.isFinite(receivedQuantity) || receivedQuantity <= 0) return null;

  const expectedStockCountId = parseUuid(formData.get('expectedStockCountId')) ?? undefined;

  return { locationId, itemId, receivedQuantity, expectedStockCountId };
}
