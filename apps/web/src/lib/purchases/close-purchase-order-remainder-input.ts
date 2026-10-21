import { parseUuid } from './validation';

export interface ClosePurchaseOrderRemainderFormInput {
  locationId: string;
  itemId: string;
  /** Optional guard -- the open order the caller was looking at (see `close-purchase-order-remainder.ts`). Omitted (not merely empty) when absent/invalid. */
  expectedOrderActionId?: string;
}

/** Fail-closed: malformed/missing required input returns `null`, never throws. `expectedOrderActionId` is optional -- an invalid/missing value is simply omitted. */
export function parseClosePurchaseOrderRemainderInput(formData: FormData): ClosePurchaseOrderRemainderFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;

  const expectedOrderActionId = parseUuid(formData.get('expectedOrderActionId')) ?? undefined;

  return { locationId, itemId, expectedOrderActionId };
}
