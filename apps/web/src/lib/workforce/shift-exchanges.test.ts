import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptShiftExchange,
  cancelShiftExchange,
  createShiftExchange,
  decideShiftExchange,
  listShiftExchanges,
} from './shift-exchanges.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const LOCATION_ID = 'loc-1';
const EMPLOYEE_ID = 'emp-1';

const exchangeRow = {
  exchange_id: 'ex-1',
  tenant_id: TENANT_ID,
  location_id: LOCATION_ID,
  shift_id: 'shift-1',
  requester_employee_id: EMPLOYEE_ID,
  replacement_employee_id: null,
  reason: 'Doctor appointment',
  status: 'open',
  accepted_at: null,
  decided_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  request_kind: 'cancel',
  requested_shift_type_id: null,
};

test('listShiftExchanges scopes the read by tenant and location, and maps rows', async () => {
  const { client, calls } = recordingClient({ data: [exchangeRow], error: null });
  const result = await listShiftExchanges(client, TENANT_ID, LOCATION_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data[0]!.exchangeId, 'ex-1');
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT_ID));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'location_id' && c.args[1] === LOCATION_ID));
});

test('createShiftExchange rejects an empty or over-length reason before touching Supabase', async () => {
  const { client, calls } = recordingClient({ data: exchangeRow, error: null });
  const empty = await createShiftExchange(client, {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    shiftId: 'shift-1',
    requesterEmployeeId: EMPLOYEE_ID,
    reason: '   ',
    requestKind: 'cancel',
  });
  assert.equal(empty.status, 'unexpected_error');
  const tooLong = await createShiftExchange(client, {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    shiftId: 'shift-1',
    requesterEmployeeId: EMPLOYEE_ID,
    reason: 'x'.repeat(501),
    requestKind: 'cancel',
  });
  assert.equal(tooLong.status, 'unexpected_error');
  assert.equal(calls.length, 0, 'no Supabase call for either invalid reason');
});

test('createShiftExchange only carries requestedShiftTypeId through for request_kind=change', async () => {
  const { client, calls } = recordingClient({ data: exchangeRow, error: null });
  await createShiftExchange(client, {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    shiftId: 'shift-1',
    requesterEmployeeId: EMPLOYEE_ID,
    reason: 'Family event',
    requestKind: 'cancel',
    requestedShiftTypeId: 'type-1',
  });
  const cancelInsert = calls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
  assert.equal(cancelInsert.requested_shift_type_id, null, 'cancel requests never carry a requested shift type, even if one was passed');

  const { client: changeClient, calls: changeCalls } = recordingClient({ data: exchangeRow, error: null });
  await createShiftExchange(changeClient, {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    shiftId: 'shift-1',
    requesterEmployeeId: EMPLOYEE_ID,
    reason: 'Prefer a different shift',
    requestKind: 'change',
    requestedShiftTypeId: 'type-1',
  });
  const changeInsert = changeCalls.find((c) => c.method === 'insert')!.args[0] as Record<string, unknown>;
  assert.equal(changeInsert.requested_shift_type_id, 'type-1');
});

test('acceptShiftExchange, cancelShiftExchange, decideShiftExchange each call their own RPC name with the exchange id', async () => {
  const rpcCallName = (calls: { method: string; args: unknown[] }[]) =>
    calls.find((c) => c.method === 'rpc')!.args[0];

  const { client: acceptClient, calls: acceptCalls } = recordingClient({ data: { exchange_id: 'ex-1' }, error: null });
  await acceptShiftExchange(acceptClient, 'ex-1');
  assert.equal(rpcCallName(acceptCalls), 'accept_workforce_shift_exchange');

  const { client: cancelClient, calls: cancelCalls } = recordingClient({ data: { exchange_id: 'ex-1' }, error: null });
  await cancelShiftExchange(cancelClient, 'ex-1');
  assert.equal(rpcCallName(cancelCalls), 'cancel_workforce_shift_exchange');

  const { client: decideClient, calls: decideCalls } = recordingClient({ data: { exchange_id: 'ex-1' }, error: null });
  await decideShiftExchange(decideClient, 'ex-1', 'approved');
  assert.equal(rpcCallName(decideCalls), 'decide_workforce_shift_exchange');
  const rpcArgs = decideCalls.find((c) => c.method === 'rpc')!.args[1] as Record<string, unknown>;
  assert.deepEqual(rpcArgs, { p_exchange_id: 'ex-1', p_decision: 'approved' });
});

test('decideShiftExchange maps the RPC\'s stale-reference exceptions to status "stale_reference", not a generic error', async () => {
  const { client } = recordingClient({ data: null, error: { message: 'shift_exchange_schedule_conflict' } });
  const result = await decideShiftExchange(client, 'ex-1', 'approved');
  assert.equal(result.status, 'stale_reference');
});

test('decideShiftExchange maps a permission-denied RPC error to something other than success, without throwing', async () => {
  const { client } = recordingClient({ data: null, error: { message: 'permission denied for function decide_workforce_shift_exchange', code: '42501' } });
  const result = await decideShiftExchange(client, 'ex-1', 'rejected');
  assert.notEqual(result.status, 'success');
});
