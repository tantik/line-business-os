import { parseUuid } from './validation';
import {
  MAX_RECEIPT_AMOUNT_JPY,
  MAX_RECEIPT_NOTE_LENGTH,
  RECEIPT_PHOTO_MODES,
  SPEND_RECEIPT_CATEGORIES,
  type ReceiptPhotoMode,
  type SpendReceiptCategory,
} from './spend-receipts';

/**
 * Form parsing for the spend-receipt Server Actions (DEBT-136). Fast-fail
 * shape checks only -- every business rule (amount or photo, date window,
 * photo mode, own purchases, edit window) is re-checked by the 0147 RPCs.
 */

export interface SaveSpendReceiptInput {
  /** Set when editing; absent when creating. */
  receiptId: string | null;
  locationId: string;
  /** New per sheet open (create idempotency); ignored on edit. */
  clientRequestId: string | null;
  purchasedOn: string;
  amountJpy: number | null;
  category: SpendReceiptCategory | null;
  note: string | null;
  actionIds: string[];
  /** Edit only: drop the current photo without a replacement. */
  removePhoto: boolean;
}

/** 「1,280」「１２８０」「¥1280」 -> 1280; '' -> null; anything else -> undefined (invalid). */
export function parseYenAmount(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，\s¥￥円]/g, '');
  if (normalized === '') return null;
  if (!/^\d+$/.test(normalized)) return undefined;
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RECEIPT_AMOUNT_JPY) return undefined;
  return value;
}

function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw ? raw : null;
}

function parseOptionalText(raw: unknown, max: number): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? undefined : trimmed;
}

export function parseSaveSpendReceiptInput(formData: FormData): SaveSpendReceiptInput | null {
  const rawReceiptId = formData.get('receiptId');
  const receiptId = rawReceiptId === null || rawReceiptId === '' ? null : parseUuid(rawReceiptId);
  if (rawReceiptId !== null && rawReceiptId !== '' && !receiptId) return null;

  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const clientRequestId = receiptId ? null : parseUuid(formData.get('clientRequestId'));
  if (!receiptId && !clientRequestId) return null;

  const purchasedOn = parseDate(formData.get('purchasedOn'));
  if (!purchasedOn) return null;

  const amountJpy = parseYenAmount(formData.get('amountJpy'));
  if (amountJpy === undefined) return null;

  const rawCategory = formData.get('category');
  const category =
    rawCategory === null || rawCategory === ''
      ? null
      : SPEND_RECEIPT_CATEGORIES.includes(rawCategory as SpendReceiptCategory)
        ? (rawCategory as SpendReceiptCategory)
        : undefined;
  if (category === undefined) return null;

  const note = parseOptionalText(formData.get('note'), MAX_RECEIPT_NOTE_LENGTH);
  if (note === undefined) return null;

  const actionIds: string[] = [];
  for (const raw of formData.getAll('actionId')) {
    const id = parseUuid(raw);
    if (!id) return null;
    if (!actionIds.includes(id)) actionIds.push(id);
  }
  if (actionIds.length > 50) return null;

  return {
    receiptId,
    locationId,
    clientRequestId,
    purchasedOn,
    amountJpy,
    category,
    note,
    actionIds,
    removePhoto: formData.get('removePhoto') === 'true',
  };
}

export function parseReceiptPhotoMode(raw: unknown): ReceiptPhotoMode | null {
  return typeof raw === 'string' && (RECEIPT_PHOTO_MODES as readonly string[]).includes(raw) ? (raw as ReceiptPhotoMode) : null;
}

export function parseCancelReason(raw: unknown): string | null {
  const reason = parseOptionalText(raw, MAX_RECEIPT_NOTE_LENGTH);
  return reason ?? null;
}
