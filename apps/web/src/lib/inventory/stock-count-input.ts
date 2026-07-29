import { parseQuantity, parseUuid } from './validation';

export interface RecordStockCountFormInput {
  locationId: string;
  itemId: string;
  actualQuantity: number;
}

export function parseRecordStockCountInput(formData: FormData): RecordStockCountFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;

  const actualQuantity = parseQuantity(formData.get('actualQuantity'));
  if (actualQuantity === null) return null;

  return { locationId, itemId, actualQuantity };
}
