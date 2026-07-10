import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideCorrectionRequest,
  listMyShiftRequests,
  listShiftRequestsForManager,
  submitCorrectionRequest,
  submitShiftPreference,
} from './shift-requests.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const EMPLOYEE_ID = 'emp-1';

const requestRow = {
  request_id: 'r1',
  tenant_id: TENANT_ID,
  location_id: 'loc-1',
  employee_id: EMPLOYEE_ID,
  shift_id: null,
  shift_type_id: 'st-1',
  work_date: '2026-08-03',
  kind: 'preference',
  is_unavailable: false,
  status: 'pending',
  details: {},
  attendance_id: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

test('listMyShiftRequests maps rows and applies an optional kind filter', async () => {
  const { client, calls } = recordingClient({ data: [requestRow], error: null });
  const result = await listMyShiftRequests(client, TENANT_ID, { kind: 'preference' });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data[0]!.requestId, 'r1');
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'kind' && c.args[1] === 'preference'));
});

test('listShiftRequestsForManager applies optional kind + status filters', async () => {
  const { client, calls } = recordingClient({ data: [requestRow], error: null });
  await listShiftRequestsForManager(client, TENANT_ID, { kind: 'correction', status: 'pending' });
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'kind' && c.args[1] === 'correction'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'pending'));
});

test('submitShiftPreference inserts kind=preference and maps a duplicate (23505) to duplicate', async () => {
  const { client, calls } = recordingClient({ data: requestRow, error: null });
  const result = await submitShiftPreference(client, TENANT_ID, {
    employeeId: EMPLOYEE_ID,
    locationId: 'loc-1',
    workDate: '2026-08-03',
    shiftTypeId: 'st-1',
    isUnavailable: false,
  });
  assert.equal(result.status, 'success');
  const insertCall = calls.find((c) => c.method === 'insert');
  assert.equal((insertCall!.args[0] as Record<string, unknown>).kind, 'preference');

  const { client: dupClient } = recordingClient({ data: null, error: { code: '23505', message: 'duplicate key' } });
  const dupResult = await submitShiftPreference(dupClient, TENANT_ID, {
    employeeId: EMPLOYEE_ID,
    locationId: 'loc-1',
    workDate: '2026-08-03',
    shiftTypeId: 'st-1',
    isUnavailable: false,
  });
  assert.equal(dupResult.status, 'duplicate');
});

test('submitCorrectionRequest inserts kind=correction', async () => {
  const { client, calls } = recordingClient({ data: { ...requestRow, kind: 'correction' }, error: null });
  const result = await submitCorrectionRequest(client, TENANT_ID, {
    employeeId: EMPLOYEE_ID,
    locationId: 'loc-1',
    workDate: '2026-08-03',
    attendanceId: null,
    details: { message: 'Forgot to clock out' },
  });
  assert.equal(result.status, 'success');
  const insertCall = calls.find((c) => c.method === 'insert');
  assert.equal((insertCall!.args[0] as Record<string, unknown>).kind, 'correction');
});

test('decideCorrectionRequest only writes status (decided_by/decided_at are server-stamped by the DB trigger, never sent by the client)', async () => {
  const { client, calls } = recordingClient({ data: { ...requestRow, status: 'approved' }, error: null });
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'success');
  const updateCall = calls.find((c) => c.method === 'update');
  assert.deepEqual(updateCall!.args[0], { status: 'approved' });
});

test('decideCorrectionRequest returns not_found when RLS/filter matches zero rows', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await decideCorrectionRequest(client, TENANT_ID, 'missing', 'approved');
  assert.equal(result.status, 'not_found');
});
