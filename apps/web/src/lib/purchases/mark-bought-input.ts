import { parseUuid } from './validation';

export interface MarkPurchaseBoughtFormInput {
  locationId: string;
  itemId: string;
}

export function parseMarkPurchaseBoughtInput(formData: FormData): MarkPurchaseBoughtFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const itemId = parseUuid(formData.get('itemId'));
  if (!itemId) return null;

  return { locationId, itemId };
}
