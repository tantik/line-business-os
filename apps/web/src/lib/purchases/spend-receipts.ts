import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { fetchAllRows } from '@/lib/db/fetch-all-rows';

/**
 * Spend receipts (レシート, DEBT-136, 0147): a paper receipt of a purchase --
 * date, total in JPY as printed (optional; amount or photo is required),
 * category/note, private photo, linked bought/received purchase actions.
 * Design: docs/architecture/purchase-receipts-design-2026-11-02.md.
 *
 * Reads go through `api.spend_receipts` / `api.spend_receipt_settings` (RLS:
 * the buyer sees their own receipts, `purchases.receipt.manage` sees every
 * receipt of the location); writes only through the `api.*_spend_receipt*`
 * RPCs, which re-check every rule server-side. The tenant/location filters
 * here are a display narrowing, never the security boundary.
 */

export const SPEND_RECEIPT_CATEGORIES = ['food', 'supplies', 'equipment', 'other'] as const;
export type SpendReceiptCategory = (typeof SPEND_RECEIPT_CATEGORIES)[number];
export type ReceiptPhotoMode = 'off' | 'optional' | 'required';
export const RECEIPT_PHOTO_MODES: readonly ReceiptPhotoMode[] = ['off', 'optional', 'required'];
export const RECEIPT_MANAGE_PERMISSION = 'purchases.receipt.manage';
export const RECEIPTS_BUCKET = 'purchase-receipts';
export const MAX_RECEIPT_NOTE_LENGTH = 200;
export const MAX_RECEIPT_AMOUNT_JPY = 100_000_000;
/** The DB accepts a purchase date from today-90 to today (location-local). */
export const RECEIPT_DATE_WINDOW_DAYS = 90;

export interface ApiSpendReceiptRow {
  receipt_id: string;
  tenant_id: string;
  location_id: string;
  purchased_on: string;
  amount_jpy: number | null;
  category: SpendReceiptCategory | null;
  note: string | null;
  media_path: string | null;
  status: 'active' | 'canceled';
  cancel_reason: string | null;
  created_by: string;
  created_on: string;
  created_at: string;
  is_mine: boolean;
  created_by_employee_id: string | null;
  items: Array<{
    action_id: string;
    item_id: string | null;
    item_name: string | null;
    action_type: 'bought' | 'received' | null;
    actioned_at: string | null;
  }>;
}

export interface SpendReceiptItem {
  actionId: string;
  /** Inventory item id (null when the item was deleted) -- keys the item name translation (0153). */
  itemId: string | null;
  itemName: string | null;
  actionType: 'bought' | 'received' | null;
}

export interface SpendReceipt {
  receiptId: string;
  locationId: string;
  purchasedOn: string;
  amountJpy: number | null;
  category: SpendReceiptCategory | null;
  note: string | null;
  mediaPath: string | null;
  status: 'active' | 'canceled';
  cancelReason: string | null;
  createdOn: string;
  createdAt: string;
  isMine: boolean;
  createdByEmployeeId: string | null;
  items: SpendReceiptItem[];
}

export interface SpendReceiptSettings {
  receiptsEnabled: boolean;
  photoMode: ReceiptPhotoMode;
}

/** No settings row = receipts on, photo optional (0147). */
export const DEFAULT_RECEIPT_SETTINGS: SpendReceiptSettings = { receiptsEnabled: true, photoMode: 'optional' };

const RECEIPT_COLUMNS =
  'receipt_id, tenant_id, location_id, purchased_on, amount_jpy, category, note, media_path, status, cancel_reason, created_by, created_on, created_at, is_mine, created_by_employee_id, items';

export function mapSpendReceiptRow(row: ApiSpendReceiptRow): SpendReceipt {
  return {
    receiptId: row.receipt_id,
    locationId: row.location_id,
    purchasedOn: row.purchased_on,
    amountJpy: row.amount_jpy === null ? null : Number(row.amount_jpy),
    category: row.category,
    note: row.note,
    mediaPath: row.media_path,
    status: row.status,
    cancelReason: row.cancel_reason,
    createdOn: row.created_on,
    createdAt: row.created_at,
    isMine: row.is_mine,
    createdByEmployeeId: row.created_by_employee_id,
    items: (row.items ?? []).map((item) => ({
      actionId: item.action_id,
      itemId: item.item_id,
      itemName: item.item_name,
      actionType: item.action_type,
    })),
  };
}

/** `YYYY-MM` -> [first day, first day of the next month) as `YYYY-MM-DD`; null for a malformed month. */
export function monthRange(month: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const nextYear = monthIndex === 12 ? year + 1 : year;
  const nextMonth = monthIndex === 12 ? 1 : monthIndex + 1;
  return { from: `${month}-01`, to: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01` };
}

/** `YYYY-MM` shifted by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Location-local calendar date (`YYYY-MM-DD`) of an instant. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** `YYYY-MM-DD` minus `days` (calendar arithmetic, timezone-free). */
export function subtractDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function listSpendReceipts(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  month: string,
): Promise<TenantAccessResult<SpendReceipt[]>> {
  const range = monthRange(month);
  if (!range) return { status: 'unexpected_error', message: 'Invalid month.' };
  try {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase
        .schema('api')
        .from('spend_receipts')
        .select(RECEIPT_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('location_id', locationId)
        .gte('purchased_on', range.from)
        .lt('purchased_on', range.to)
        .order('purchased_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('receipt_id', { ascending: true })
        .range(from, to),
    );
    if (error) return mapReceiptReadError(error);
    return { status: 'success', data: ((data ?? []) as ApiSpendReceiptRow[]).map(mapSpendReceiptRow) };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading receipts.' };
  }
}

export async function getSpendReceiptSettings(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<SpendReceiptSettings>> {
  const { data, error } = await supabase
    .schema('api')
    .from('spend_receipt_settings')
    .select('receipts_enabled, photo_mode')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) return mapReceiptReadError(error);
  if (!data) return { status: 'success', data: DEFAULT_RECEIPT_SETTINGS };
  const row = data as { receipts_enabled: boolean; photo_mode: ReceiptPhotoMode };
  return { status: 'success', data: { receiptsEnabled: row.receipts_enabled, photoMode: row.photo_mode } };
}

/** Signed photo URLs keyed by receipt id (same pattern as `createInventoryMediaUrlMap`). */
export async function createReceiptMediaUrlMap(
  supabase: SupabaseClient,
  receipts: Array<{ receiptId: string; mediaPath: string | null }>,
): Promise<Record<string, string>> {
  const media = receipts.filter((r) => r.mediaPath);
  if (media.length === 0) return {};
  const idByPath = new Map(media.map((r) => [r.mediaPath as string, r.receiptId]));
  const signed = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrls(media.map((r) => r.mediaPath as string), 3600);
  if (signed.error) return {};
  return Object.fromEntries(
    signed.data.flatMap((entry) => {
      if (!entry.path || !entry.signedUrl) return [];
      const id = idByPath.get(entry.path);
      return id ? [[id, entry.signedUrl]] : [];
    }),
  );
}

// ---- monthly spend (manager view) -------------------------------------------------------

export interface SpendSummary {
  /** Sum of the amounts of active receipts. */
  totalJpy: number;
  receiptCount: number;
  /** Active receipts without an amount yet (「金額未入力」). */
  missingAmountCount: number;
  /** Key = employee id, or '' when the creator has no employee row. Sorted by total desc. */
  byPerson: Array<{ employeeId: string; totalJpy: number; count: number; missingAmountCount: number }>;
  /** `stock` = linked to purchased items and no category (「仕入れ品」). Sorted by total desc. */
  byCategory: Array<{ category: SpendReceiptCategory | 'stock'; totalJpy: number; count: number }>;
}

export function summarizeSpend(receipts: SpendReceipt[]): SpendSummary {
  const active = receipts.filter((r) => r.status === 'active');
  const people = new Map<string, { totalJpy: number; count: number; missingAmountCount: number }>();
  const categories = new Map<SpendReceiptCategory | 'stock', { totalJpy: number; count: number }>();
  let totalJpy = 0;
  let missingAmountCount = 0;
  for (const r of active) {
    const amount = r.amountJpy ?? 0;
    totalJpy += amount;
    if (r.amountJpy === null) missingAmountCount += 1;
    const personKey = r.createdByEmployeeId ?? '';
    const person = people.get(personKey) ?? { totalJpy: 0, count: 0, missingAmountCount: 0 };
    person.totalJpy += amount;
    person.count += 1;
    if (r.amountJpy === null) person.missingAmountCount += 1;
    people.set(personKey, person);
    const categoryKey = r.category ?? 'stock';
    const category = categories.get(categoryKey) ?? { totalJpy: 0, count: 0 };
    category.totalJpy += amount;
    category.count += 1;
    categories.set(categoryKey, category);
  }
  return {
    totalJpy,
    receiptCount: active.length,
    missingAmountCount,
    byPerson: [...people.entries()]
      .map(([employeeId, v]) => ({ employeeId, ...v }))
      .sort((a, b) => b.totalJpy - a.totalJpy || b.count - a.count),
    byCategory: [...categories.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.totalJpy - a.totalJpy || b.count - a.count),
  };
}

// ---- writes ---------------------------------------------------------------------------------

export type ReceiptErrorCode =
  | 'module_disabled'
  | 'receipts_disabled'
  | 'photo_required'
  | 'photo_off'
  | 'edit_window_closed'
  | 'canceled'
  | 'not_found'
  | 'item_not_allowed'
  | 'amount_or_photo_required'
  | 'category_and_note_required'
  | 'invalid_date'
  | 'invalid_amount'
  | 'photo_upload_failed'
  | 'invalid_input';

export type SpendReceiptWriteResult<T> = TenantAccessResult<T> | { status: 'receipt_error'; code: ReceiptErrorCode };

/** 0147 error codes -> one app-level code. Never surfaces the raw database message. */
export function mapReceiptWriteError(error: Pick<PostgrestError, 'code' | 'message'>): SpendReceiptWriteResult<never> {
  const message = error.message ?? '';
  switch (error.code) {
    case 'P0004':
      return { status: 'receipt_error', code: 'module_disabled' };
    case 'P0010':
      return { status: 'receipt_error', code: 'receipts_disabled' };
    case 'P0011':
      return { status: 'receipt_error', code: /photo_off/.test(message) ? 'photo_off' : 'photo_required' };
    case 'P0012':
      return { status: 'receipt_error', code: 'edit_window_closed' };
    case 'P0013':
      return { status: 'receipt_error', code: 'canceled' };
    case 'P0002':
      return { status: 'receipt_error', code: 'not_found' };
    case '42501':
      if (/receipt_item_not_allowed/.test(message)) return { status: 'receipt_error', code: 'item_not_allowed' };
      return { status: 'unauthorized', message: 'Not permitted to change receipts.' };
    case '22023':
      if (/receipt_amount_or_photo_required/.test(message)) return { status: 'receipt_error', code: 'amount_or_photo_required' };
      if (/receipt_category_and_note_required/.test(message)) return { status: 'receipt_error', code: 'category_and_note_required' };
      if (/purchased_on/.test(message)) return { status: 'receipt_error', code: 'invalid_date' };
      if (/amount_jpy/.test(message)) return { status: 'receipt_error', code: 'invalid_amount' };
      if (/media_path/.test(message)) return { status: 'receipt_error', code: 'photo_upload_failed' };
      return { status: 'receipt_error', code: 'invalid_input' };
    default:
      if (/permission denied|row-level security/i.test(message)) {
        return { status: 'unauthorized', message: 'Not permitted to change receipts.' };
      }
      return { status: 'unexpected_error', message: 'Unable to save the receipt right now.' };
  }
}

function mapReceiptReadError(error: PostgrestError): TenantAccessResult<never> {
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read receipts.' };
  }
  return { status: 'unexpected_error', message: 'Unable to load receipts right now.' };
}

export interface SpendReceiptPayload {
  purchasedOn: string;
  amountJpy: number | null;
  category: SpendReceiptCategory | null;
  note: string | null;
  mediaPath: string | null;
  actionIds: string[];
}

export async function createSpendReceipt(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  payload: SpendReceiptPayload,
  clientRequestId: string,
): Promise<SpendReceiptWriteResult<{ receiptId: string }>> {
  const { data, error } = await supabase.schema('api').rpc('create_spend_receipt', {
    p_tenant_id: tenantId,
    p_location_id: locationId,
    p_purchased_on: payload.purchasedOn,
    p_amount_jpy: payload.amountJpy,
    p_category: payload.category,
    p_note: payload.note,
    p_media_path: payload.mediaPath,
    p_action_ids: payload.actionIds,
    p_client_request_id: clientRequestId,
  });
  if (error) return mapReceiptWriteError(error);
  return { status: 'success', data: { receiptId: data as string } };
}

export async function updateSpendReceipt(
  supabase: SupabaseClient,
  tenantId: string,
  receiptId: string,
  payload: SpendReceiptPayload,
): Promise<SpendReceiptWriteResult<{ receiptId: string }>> {
  const { error } = await supabase.schema('api').rpc('update_spend_receipt', {
    p_tenant_id: tenantId,
    p_receipt_id: receiptId,
    p_purchased_on: payload.purchasedOn,
    p_amount_jpy: payload.amountJpy,
    p_category: payload.category,
    p_note: payload.note,
    p_media_path: payload.mediaPath,
    p_action_ids: payload.actionIds,
  });
  if (error) return mapReceiptWriteError(error);
  return { status: 'success', data: { receiptId } };
}

export async function cancelSpendReceipt(
  supabase: SupabaseClient,
  tenantId: string,
  receiptId: string,
  reason: string,
): Promise<SpendReceiptWriteResult<null>> {
  const { error } = await supabase
    .schema('api')
    .rpc('cancel_spend_receipt', { p_tenant_id: tenantId, p_receipt_id: receiptId, p_reason: reason });
  if (error) return mapReceiptWriteError(error);
  return { status: 'success', data: null };
}

export async function setSpendReceiptSettings(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  settings: SpendReceiptSettings,
): Promise<SpendReceiptWriteResult<SpendReceiptSettings>> {
  const { error } = await supabase.schema('api').rpc('set_spend_receipt_settings', {
    p_tenant_id: tenantId,
    p_location_id: locationId,
    p_receipts_enabled: settings.receiptsEnabled,
    p_photo_mode: settings.photoMode,
  });
  if (error) return mapReceiptWriteError(error);
  return { status: 'success', data: settings };
}
