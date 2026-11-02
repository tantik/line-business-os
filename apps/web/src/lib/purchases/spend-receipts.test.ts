import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDate,
  mapReceiptWriteError,
  mapSpendReceiptRow,
  monthRange,
  shiftMonth,
  subtractDays,
  summarizeSpend,
  type ApiSpendReceiptRow,
  type SpendReceipt,
} from './spend-receipts.js';
import { parseCancelReason, parseReceiptPhotoMode, parseSaveSpendReceiptInput, parseYenAmount } from './spend-receipt-input.js';

const LOCATION = '22222222-2222-4222-8222-222222222222';
const RECEIPT = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const ACTION_A = '55555555-5555-4555-8555-555555555555';
const ACTION_B = '66666666-6666-4666-8666-666666666666';

function receipt(overrides: Partial<SpendReceipt> = {}): SpendReceipt {
  return {
    receiptId: RECEIPT,
    locationId: LOCATION,
    purchasedOn: '2026-11-02',
    amountJpy: 1000,
    category: null,
    note: null,
    mediaPath: null,
    status: 'active',
    cancelReason: null,
    createdOn: '2026-11-02',
    createdAt: '2026-11-02T01:00:00Z',
    isMine: true,
    createdByEmployeeId: 'emp-a',
    items: [],
    ...overrides,
  };
}

test('monthRange: first day to first day of next month, December rolls the year', () => {
  assert.deepEqual(monthRange('2026-11'), { from: '2026-11-01', to: '2026-12-01' });
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2027-01-01' });
  assert.equal(monthRange('2026-13'), null);
  assert.equal(monthRange('2026-1'), null);
  assert.equal(monthRange("2026-11' or 1=1"), null);
});

test('shiftMonth / subtractDays: calendar arithmetic across year boundaries', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-11', 0), '2026-11');
  assert.equal(subtractDays('2026-03-01', 1), '2026-02-28');
  assert.equal(subtractDays('2026-11-02', 90), '2026-08-04');
});

test('localDate: the location-local calendar day, not UTC', () => {
  // 2026-11-01 16:30 UTC = 2026-11-02 01:30 in Tokyo
  assert.equal(localDate(new Date('2026-11-01T16:30:00Z'), 'Asia/Tokyo'), '2026-11-02');
  assert.equal(localDate(new Date('2026-11-01T16:30:00Z'), 'UTC'), '2026-11-01');
});

test('mapSpendReceiptRow: maps the view row and its linked items', () => {
  const row: ApiSpendReceiptRow = {
    receipt_id: RECEIPT,
    tenant_id: 't',
    location_id: LOCATION,
    purchased_on: '2026-11-02',
    amount_jpy: null,
    category: 'supplies',
    note: '洗剤',
    media_path: 'a/b/c/d.webp',
    status: 'active',
    cancel_reason: null,
    created_by: 'u',
    created_on: '2026-11-02',
    created_at: '2026-11-02T01:00:00Z',
    is_mine: false,
    created_by_employee_id: null,
    items: [{ action_id: ACTION_A, item_id: null, item_name: null, action_type: null, actioned_at: null }],
  };
  const mapped = mapSpendReceiptRow(row);
  assert.equal(mapped.amountJpy, null);
  assert.equal(mapped.isMine, false);
  assert.deepEqual(mapped.items, [{ actionId: ACTION_A, itemName: null, actionType: null }]);
});

test('summarizeSpend: canceled receipts excluded, missing amounts counted, uncategorized linked receipts = stock', () => {
  const summary = summarizeSpend([
    receipt({ amountJpy: 1200, createdByEmployeeId: 'emp-a', items: [{ actionId: ACTION_A, itemName: '牛乳', actionType: 'bought' }] }),
    receipt({ receiptId: 'r2', amountJpy: null, mediaPath: 'x', createdByEmployeeId: 'emp-b', category: 'supplies' }),
    receipt({ receiptId: 'r3', amountJpy: 800, createdByEmployeeId: 'emp-a', category: 'supplies' }),
    receipt({ receiptId: 'r4', amountJpy: 5000, status: 'canceled', cancelReason: 'dup' }),
    receipt({ receiptId: 'r5', amountJpy: 300, createdByEmployeeId: null, category: 'other' }),
  ]);
  assert.equal(summary.totalJpy, 2300);
  assert.equal(summary.receiptCount, 4);
  assert.equal(summary.missingAmountCount, 1);
  assert.deepEqual(summary.byPerson, [
    { employeeId: 'emp-a', totalJpy: 2000, count: 2, missingAmountCount: 0 },
    { employeeId: '', totalJpy: 300, count: 1, missingAmountCount: 0 },
    { employeeId: 'emp-b', totalJpy: 0, count: 1, missingAmountCount: 1 },
  ]);
  assert.deepEqual(summary.byCategory, [
    { category: 'stock', totalJpy: 1200, count: 1 },
    { category: 'supplies', totalJpy: 800, count: 2 },
    { category: 'other', totalJpy: 300, count: 1 },
  ]);
});

test('summarizeSpend: empty month', () => {
  assert.deepEqual(summarizeSpend([]), { totalJpy: 0, receiptCount: 0, missingAmountCount: 0, byPerson: [], byCategory: [] });
});

test('mapReceiptWriteError: every 0147 error code maps to an app code, never the raw message', () => {
  const code = (c: string, message: string) => mapReceiptWriteError({ code: c, message });
  assert.deepEqual(code('P0004', 'purchases_module_disabled'), { status: 'receipt_error', code: 'module_disabled' });
  assert.deepEqual(code('P0010', 'receipts_disabled'), { status: 'receipt_error', code: 'receipts_disabled' });
  assert.deepEqual(code('P0011', 'receipt_photo_required'), { status: 'receipt_error', code: 'photo_required' });
  assert.deepEqual(code('P0011', 'receipt_photo_off'), { status: 'receipt_error', code: 'photo_off' });
  assert.deepEqual(code('P0012', 'receipt_edit_window_closed'), { status: 'receipt_error', code: 'edit_window_closed' });
  assert.deepEqual(code('P0013', 'receipt_canceled'), { status: 'receipt_error', code: 'canceled' });
  assert.deepEqual(code('P0002', 'receipt_not_found'), { status: 'receipt_error', code: 'not_found' });
  assert.deepEqual(code('42501', 'receipt_item_not_allowed'), { status: 'receipt_error', code: 'item_not_allowed' });
  assert.equal(code('42501', 'permission_denied').status, 'unauthorized');
  assert.deepEqual(code('22023', 'receipt_amount_or_photo_required'), { status: 'receipt_error', code: 'amount_or_photo_required' });
  assert.deepEqual(code('22023', 'receipt_category_and_note_required'), { status: 'receipt_error', code: 'category_and_note_required' });
  assert.deepEqual(code('22023', 'invalid_argument: purchased_on'), { status: 'receipt_error', code: 'invalid_date' });
  assert.deepEqual(code('22023', 'invalid_argument: amount_jpy'), { status: 'receipt_error', code: 'invalid_amount' });
  assert.deepEqual(code('22023', 'invalid_argument: media_path not uploaded'), { status: 'receipt_error', code: 'photo_upload_failed' });
  assert.deepEqual(code('22023', 'invalid_argument: note'), { status: 'receipt_error', code: 'invalid_input' });
  const unknown = code('XX000', 'some internal detail');
  assert.equal(unknown.status, 'unexpected_error');
  assert.ok(!('message' in unknown) || !String(unknown.message).includes('internal detail'));
});

test('parseYenAmount: printed totals, full-width digits, separators; rejects junk and out-of-range', () => {
  assert.equal(parseYenAmount('1,280'), 1280);
  assert.equal(parseYenAmount('１２８０'), 1280);
  assert.equal(parseYenAmount('¥1280円'), 1280);
  assert.equal(parseYenAmount(' 980 '), 980);
  assert.equal(parseYenAmount(''), null);
  assert.equal(parseYenAmount(null), null);
  assert.equal(parseYenAmount('0'), undefined);
  assert.equal(parseYenAmount('12.5'), undefined);
  assert.equal(parseYenAmount('-5'), undefined);
  assert.equal(parseYenAmount('100000001'), undefined);
  assert.equal(parseYenAmount('abc'), undefined);
});

function form(entries: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

test('parseSaveSpendReceiptInput: create needs a client request id; edit does not', () => {
  const base = { locationId: LOCATION, purchasedOn: '2026-11-02', amountJpy: '1,000' };
  assert.equal(parseSaveSpendReceiptInput(form(base)), null);
  const created = parseSaveSpendReceiptInput(form({ ...base, clientRequestId: REQUEST, actionId: [ACTION_A, ACTION_B, ACTION_A] }));
  assert.ok(created);
  assert.equal(created.amountJpy, 1000);
  assert.deepEqual(created.actionIds, [ACTION_A, ACTION_B]);
  assert.equal(created.receiptId, null);
  const edited = parseSaveSpendReceiptInput(form({ ...base, receiptId: RECEIPT, removePhoto: 'true' }));
  assert.ok(edited);
  assert.equal(edited.clientRequestId, null);
  assert.equal(edited.removePhoto, true);
});

test('parseSaveSpendReceiptInput: rejects bad ids, dates, categories and long notes', () => {
  const ok = { locationId: LOCATION, clientRequestId: REQUEST, purchasedOn: '2026-11-02' };
  assert.ok(parseSaveSpendReceiptInput(form(ok)));
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, locationId: 'x' })), null);
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, receiptId: 'not-a-uuid' })), null);
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, purchasedOn: '2026-02-30' })), null);
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, category: 'fuel' })), null);
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, note: 'あ'.repeat(201) })), null);
  assert.equal(parseSaveSpendReceiptInput(form({ ...ok, actionId: 'nope' })), null);
  const withCategory = parseSaveSpendReceiptInput(form({ ...ok, category: 'supplies', note: '  洗剤  ' }));
  assert.equal(withCategory?.category, 'supplies');
  assert.equal(withCategory?.note, '洗剤');
});

test('parseReceiptPhotoMode / parseCancelReason', () => {
  assert.equal(parseReceiptPhotoMode('required'), 'required');
  assert.equal(parseReceiptPhotoMode('always'), null);
  assert.equal(parseCancelReason('  重複  '), '重複');
  assert.equal(parseCancelReason('   '), null);
  assert.equal(parseCancelReason('x'.repeat(201)), null);
});
