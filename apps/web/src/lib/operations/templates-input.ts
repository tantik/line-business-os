import {
  parseBooleanFlag,
  parseOptionalIsoDate,
  parseOptionalNumeric,
  parseOptionalTrimmedString,
  parseResponseType,
  parseSortOrder,
  parseTrimmedString,
  parseUuid,
  type OperationsResponseType,
} from './validation';

/** `FormData` -> typed-input parsers for every Operations Configuration Server Action, kept out of the `'use server'` module so they stay synchronous and unit-testable, mirroring `@/lib/workforce/employees-input.ts`'s convention. Every parser returns `null` on any malformed input -- fail closed, no partial/guessed input reaches the service layer. */

export interface CreateTemplateInput {
  name: string;
  locationId: string | null;
  category: string | null;
  description: string | null;
}

export function parseCreateTemplateInput(formData: FormData): CreateTemplateInput | null {
  const name = parseTrimmedString(formData.get('name'), 200);
  if (name === null) return null;
  const category = parseOptionalTrimmedString(formData.get('category'), 100);
  if (category === undefined) return null;
  const description = parseOptionalTrimmedString(formData.get('description'), 2000);
  if (description === undefined) return null;
  const rawLocationId = formData.get('locationId');
  const rawLocationIdStr = typeof rawLocationId === 'string' ? rawLocationId.trim() : '';
  let locationId: string | null = null;
  if (rawLocationIdStr.length > 0) {
    locationId = parseUuid(rawLocationIdStr);
    if (locationId === null) return null;
  }
  return { name, locationId, category, description };
}

export interface UpdateTemplateInput {
  templateId: string;
  name: string;
  category: string | null;
  description: string | null;
}

export function parseUpdateTemplateInput(formData: FormData): UpdateTemplateInput | null {
  const templateId = parseUuid(formData.get('templateId'));
  if (templateId === null) return null;
  const name = parseTrimmedString(formData.get('name'), 200);
  if (name === null) return null;
  const category = parseOptionalTrimmedString(formData.get('category'), 100);
  if (category === undefined) return null;
  const description = parseOptionalTrimmedString(formData.get('description'), 2000);
  if (description === undefined) return null;
  return { templateId, name, category, description };
}

export interface RetireTemplateInput {
  templateId: string;
  retiredOn: string | null;
}

export function parseRetireTemplateInput(formData: FormData): RetireTemplateInput | null {
  const templateId = parseUuid(formData.get('templateId'));
  if (templateId === null) return null;
  const retiredOn = parseOptionalIsoDate(formData.get('retiredOn'));
  if (retiredOn === undefined) return null;
  return { templateId, retiredOn };
}

export interface AddTemplateItemInput {
  templateId: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical: boolean;
  isRequired: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
  sortOrder: number;
}

export function parseAddTemplateItemInput(formData: FormData): AddTemplateItemInput | null {
  const templateId = parseUuid(formData.get('templateId'));
  if (templateId === null) return null;
  const label = parseTrimmedString(formData.get('label'), 200);
  if (label === null) return null;
  const responseType = parseResponseType(formData.get('responseType'));
  if (responseType === null) return null;
  const isCritical = parseBooleanFlag(formData.get('isCritical'));
  const isRequired = parseBooleanFlag(formData.get('isRequired'));
  const numericMin = responseType === 'numeric' ? parseOptionalNumeric(formData.get('numericMin')) : null;
  if (numericMin === undefined) return null;
  const numericMax = responseType === 'numeric' ? parseOptionalNumeric(formData.get('numericMax')) : null;
  if (numericMax === undefined) return null;
  const numericUnit = responseType === 'numeric' ? parseOptionalTrimmedString(formData.get('numericUnit'), 40) : null;
  if (numericUnit === undefined) return null;
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  if (sortOrder === undefined) return null;
  return { templateId, label, responseType, isCritical, isRequired, numericMin, numericMax, numericUnit, sortOrder };
}

export interface UpdateTemplateItemInput {
  itemId: string;
  label: string;
  isCritical: boolean;
  isRequired: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
  sortOrder: number;
}

/** `isNumeric` (the item's own, immutable `responseType === 'numeric'`) is passed in by the caller rather than re-derived from `FormData` -- this action never changes `responseType`, so the form only renders the numeric fields when the item already is numeric. */
export function parseUpdateTemplateItemInput(formData: FormData, isNumeric: boolean): UpdateTemplateItemInput | null {
  const itemId = parseUuid(formData.get('itemId'));
  if (itemId === null) return null;
  const label = parseTrimmedString(formData.get('label'), 200);
  if (label === null) return null;
  const isCritical = parseBooleanFlag(formData.get('isCritical'));
  const isRequired = parseBooleanFlag(formData.get('isRequired'));
  const numericMin = isNumeric ? parseOptionalNumeric(formData.get('numericMin')) : null;
  if (numericMin === undefined) return null;
  const numericMax = isNumeric ? parseOptionalNumeric(formData.get('numericMax')) : null;
  if (numericMax === undefined) return null;
  const numericUnit = isNumeric ? parseOptionalTrimmedString(formData.get('numericUnit'), 40) : null;
  if (numericUnit === undefined) return null;
  const sortOrder = parseSortOrder(formData.get('sortOrder'));
  if (sortOrder === undefined) return null;
  return { itemId, label, isCritical, isRequired, numericMin, numericMax, numericUnit, sortOrder };
}

export interface ReplaceTemplateItemInput {
  oldItemId: string;
  label: string;
  responseType: OperationsResponseType;
  isCritical: boolean;
  isRequired: boolean;
  numericMin: number | null;
  numericMax: number | null;
  numericUnit: string | null;
  sortOrder: number | null;
}

export function parseReplaceTemplateItemInput(formData: FormData): ReplaceTemplateItemInput | null {
  const oldItemId = parseUuid(formData.get('oldItemId'));
  if (oldItemId === null) return null;
  const label = parseTrimmedString(formData.get('label'), 200);
  if (label === null) return null;
  const responseType = parseResponseType(formData.get('responseType'));
  if (responseType === null) return null;
  const isCritical = parseBooleanFlag(formData.get('isCritical'));
  const isRequired = parseBooleanFlag(formData.get('isRequired'));
  const numericMin = responseType === 'numeric' ? parseOptionalNumeric(formData.get('numericMin')) : null;
  if (numericMin === undefined) return null;
  const numericMax = responseType === 'numeric' ? parseOptionalNumeric(formData.get('numericMax')) : null;
  if (numericMax === undefined) return null;
  const numericUnit = responseType === 'numeric' ? parseOptionalTrimmedString(formData.get('numericUnit'), 40) : null;
  if (numericUnit === undefined) return null;
  const sortOrder = parseSortOrder(formData.get('sortOrder')) ?? null;
  return { oldItemId, label, responseType, isCritical, isRequired, numericMin, numericMax, numericUnit, sortOrder };
}

export function parseRetireTemplateItemInput(formData: FormData): { itemId: string } | null {
  const itemId = parseUuid(formData.get('itemId'));
  if (itemId === null) return null;
  return { itemId };
}
