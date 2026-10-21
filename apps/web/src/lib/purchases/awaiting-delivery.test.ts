import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listPurchasesAwaitingDelivery,
  mapAwaitingDeliveryRow,
  splitAwaitingDelivery,
  type ApiPurchasesAwaitingDeliveryRow,
  type PurchaseAwaitingDeliveryItem,
} from './awaiting-delivery.js';
import { parseClosePurchaseOrderRemainderInput } from './close-purchase-order-remainder-input.js';
import { closePurchaseOrderRemainder } from './close-purchase-order-remainder.js';
import { mapPurchasesWriteError } from './pg-error.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const LOCATION = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const ORDER = '44444444-4444-4444-8444-444444444444';
const COUNT = '55555555-5555-4555-8555-555555555555';

interface RecordedCall {
  method: string;
  args: unknown[];
}

function recordingClient(result: { data: unknown; error: unknown }) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'select', 'eq', 'order', 'rpc']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  builder.maybeSingle = () => Promise.resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

function row(overrides: Partial<ApiPurchasesAwaitingDeliveryRow> = {}): ApiPurchasesAwaitingDeliveryRow {
  return {
    item_id: ITEM,
    tenant_id: TENANT,
    location_id: LOCATION,
    name: 'Milk',
    unit: 'L',
    required_quantity: '10.000',
    reorder_point: '5.000',
    actual_quantity: '6.000',
    shortage_quantity: '4.000',
    is_short: false,
    latest_stock_count_id: COUNT,
    order_action_id: ORDER,
    ordered_quantity: '8.000',
    received_since_order_quantity: '4.000',
    open_order_quantity: '4.000',
    ordered_at: '2026-10-20T09:00:00+00:00',
    ordered_by_staff_id: null,
    ...overrides,
  };
}

function item(itemId: string, name: string, orderedAt: string): PurchaseAwaitingDeliveryItem {
  return { ...mapAwaitingDeliveryRow(row({ item_id: itemId, name, ordered_at: orderedAt })) };
}

test('mapAwaitingDeliveryRow converts numeric strings and renames every column', () => {
  assert.deepEqual(mapAwaitingDeliveryRow(row({ ordered_by_staff_id: 'staff-1' })), {
    itemId: ITEM,
    tenantId: TENANT,
    locationId: LOCATION,
    name: 'Milk',
    unit: 'L',
    requiredQuantity: 10,
    reorderPoint: 5,
    actualQuantity: 6,
    shortageQuantity: 4,
    isShort: false,
    latestStockCountId: COUNT,
    orderActionId: ORDER,
    orderedQuantity: 8,
    receivedSinceOrderQuantity: 4,
    openOrderQuantity: 4,
    orderedAt: '2026-10-20T09:00:00+00:00',
    orderedByStaffId: 'staff-1',
  });
});

test('mapAwaitingDeliveryRow keeps fractional quantities', () => {
  const mapped = mapAwaitingDeliveryRow(row({ ordered_quantity: 2.5, received_since_order_quantity: '0.750', open_order_quantity: '1.750' }));
  assert.equal(mapped.orderedQuantity, 2.5);
  assert.equal(mapped.receivedSinceOrderQuantity, 0.75);
  assert.equal(mapped.openOrderQuantity, 1.75);
});

test('listPurchasesAwaitingDelivery reads the api view narrowed to tenant and location, oldest order first', async () => {
  const { client, calls } = recordingClient({
    data: [
      row({ item_id: 'b', name: 'Beans', ordered_at: '2026-10-21T09:00:00+00:00' }),
      row({ item_id: 'a', name: 'Milk', ordered_at: '2026-10-19T09:00:00+00:00' }),
    ],
    error: null,
  });
  const result = await listPurchasesAwaitingDelivery(client, TENANT, LOCATION);
  assert.equal(result.status, 'success');
  assert.deepEqual(
    result.status === 'success' ? result.data.map((i) => i.itemId) : null,
    ['a', 'b'],
  );
  assert.deepEqual(calls.find((c) => c.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((c) => c.method === 'from')?.args, ['purchases_awaiting_delivery']);
  assert.deepEqual(
    calls.filter((c) => c.method === 'eq').map((c) => c.args),
    [
      ['tenant_id', TENANT],
      ['location_id', LOCATION],
    ],
  );
});

test('listPurchasesAwaitingDelivery maps a permission error to unauthorized and anything else to a generic error', async () => {
  const denied = await listPurchasesAwaitingDelivery(
    recordingClient({ data: null, error: { code: '42501', message: 'permission denied for view purchases_awaiting_delivery' } }).client,
    TENANT,
    LOCATION,
  );
  assert.equal(denied.status, 'unauthorized');

  const broken = await listPurchasesAwaitingDelivery(
    recordingClient({ data: null, error: { code: 'XX000', message: 'boom' } }).client,
    TENANT,
    LOCATION,
  );
  assert.deepEqual(broken, { status: 'unexpected_error', message: 'Unable to load purchases data right now.' });
});

test('splitAwaitingDelivery puts each item in exactly one place', () => {
  const short = item('short', 'Beans', '2026-10-20T09:00:00+00:00');
  const later = item('later', 'Sugar', '2026-10-21T09:00:00+00:00');
  const earlier = item('earlier', 'Milk', '2026-10-19T09:00:00+00:00');
  const { openOrderByItemId, awaitingOnly } = splitAwaitingDelivery(['short', 'not-ordered'], [later, short, earlier]);

  assert.deepEqual([...openOrderByItemId.keys()], ['short']);
  assert.equal(openOrderByItemId.get('short'), short);
  assert.deepEqual(
    awaitingOnly.map((i) => i.itemId),
    ['earlier', 'later'],
    'not-short open orders, oldest order first',
  );
});

test('splitAwaitingDelivery with no open orders returns empty results', () => {
  const { openOrderByItemId, awaitingOnly } = splitAwaitingDelivery(['a'], []);
  assert.equal(openOrderByItemId.size, 0);
  assert.deepEqual(awaitingOnly, []);
});

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

test('parseClosePurchaseOrderRemainderInput accepts valid ids and normalises case/whitespace', () => {
  assert.deepEqual(
    parseClosePurchaseOrderRemainderInput(form({ locationId: ` ${LOCATION.toUpperCase()} `, itemId: ITEM, expectedOrderActionId: ORDER })),
    { locationId: LOCATION, itemId: ITEM, expectedOrderActionId: ORDER },
  );
});

test('parseClosePurchaseOrderRemainderInput fails closed on missing/malformed required ids', () => {
  assert.equal(parseClosePurchaseOrderRemainderInput(form({ itemId: ITEM })), null);
  assert.equal(parseClosePurchaseOrderRemainderInput(form({ locationId: LOCATION })), null);
  assert.equal(parseClosePurchaseOrderRemainderInput(form({ locationId: 'not-a-uuid', itemId: ITEM })), null);
  assert.equal(parseClosePurchaseOrderRemainderInput(form({ locationId: LOCATION, itemId: `${ITEM}'; drop table x;--` })), null);
});

test('parseClosePurchaseOrderRemainderInput omits an invalid optional order id instead of failing', () => {
  const parsed = parseClosePurchaseOrderRemainderInput(form({ locationId: LOCATION, itemId: ITEM, expectedOrderActionId: 'nope' }));
  assert.deepEqual(parsed, { locationId: LOCATION, itemId: ITEM, expectedOrderActionId: undefined });
});

test('closePurchaseOrderRemainder calls the RPC with exactly the 0137 argument names', async () => {
  const { client, calls } = recordingClient({
    data: { action_id: 'act', item_id: ITEM, order_action_id: ORDER, closed_quantity: '4.000', actioned_at: '2026-10-21T10:00:00+00:00' },
    error: null,
  });
  const result = await closePurchaseOrderRemainder(client, TENANT, LOCATION, ITEM, ORDER);
  assert.deepEqual(calls.find((c) => c.method === 'rpc')?.args, [
    'close_purchase_order_remainder',
    { p_tenant_id: TENANT, p_location_id: LOCATION, p_item_id: ITEM, p_expected_order_action_id: ORDER },
  ]);
  assert.deepEqual(result, {
    status: 'success',
    data: { actionId: 'act', itemId: ITEM, orderActionId: ORDER, closedQuantity: 4, actionedAt: '2026-10-21T10:00:00+00:00' },
  });
});

test('closePurchaseOrderRemainder sends null when no order guard is given, and not_found on an empty result', async () => {
  const { client, calls } = recordingClient({ data: null, error: null });
  const result = await closePurchaseOrderRemainder(client, TENANT, LOCATION, ITEM);
  const args = calls.find((c) => c.method === 'rpc')?.args[1] as Record<string, unknown>;
  assert.equal(args.p_expected_order_action_id, null);
  assert.deepEqual(result, { status: 'not_found' });
});

test('close errors map to friendly statuses (never raw Postgres text)', () => {
  const err = (code: string, message: string) => ({ code, message, details: '', hint: '', name: 'PostgrestError' }) as never;
  assert.deepEqual(mapPurchasesWriteError(err('P0007', 'purchases_no_open_order'), 'x'), { status: 'no_open_order' });
  assert.deepEqual(mapPurchasesWriteError(err('P0005', 'purchases_stale_snapshot'), 'x'), { status: 'stale_snapshot' });
  assert.deepEqual(mapPurchasesWriteError(err('P0002', 'purchases_item_not_found'), 'x'), { status: 'not_found' });
  assert.equal(mapPurchasesWriteError(err('42501', 'new row violates row-level security policy'), 'x').status, 'unauthorized');
  assert.deepEqual(mapPurchasesWriteError(err('XX000', 'internal detail'), 'cancel the rest of this order'), {
    status: 'unexpected_error',
    message: 'Unable to cancel the rest of this order right now.',
  });
});
