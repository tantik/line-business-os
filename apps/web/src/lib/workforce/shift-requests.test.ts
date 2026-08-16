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

test('decideCorrectionRequest returns not_found when the request never existed (or is invisible under RLS)', async () => {
  // First call: the `.eq('status','pending')` update matches zero rows.
  // Second call: the existence follow-up also finds nothing -- genuinely
  // not found, not a decision race.
  const { client, calls } = recordingClient([
    { data: null, error: null },
    { data: null, error: null },
  ]);
  const result = await decideCorrectionRequest(client, TENANT_ID, 'missing', 'approved');
  assert.equal(result.status, 'not_found');
  assert.ok(
    calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'pending'),
    'decision update must be guarded by .eq("status", "pending") to prevent a double-decide race',
  );
});

test('decideCorrectionRequest applies requested clock-in/clock-out to the target attendance row exactly once when approving a correction that carries requested values (FR-01)', async () => {
  const decidedRow = {
    ...requestRow,
    kind: 'correction',
    status: 'approved',
    location_id: 'loc-1',
    attendance_id: 'att-1',
    work_date: '2026-08-03',
    details: { clockInLocal: '09:00', clockOutLocal: '17:00' },
  };
  const locationRow = { tenant_id: TENANT_ID, location_id: 'loc-1', location_name: 'Main', timezone: 'Asia/Tokyo', is_active: true };
  const { client, calls } = recordingClient([
    { data: decidedRow, error: null }, // decide: status -> approved
    { data: [locationRow], error: null }, // listTenantLocations
    { data: { ...decidedRow }, error: null }, // applyApprovedCorrection
  ]);
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'success');

  const updateCalls = calls.filter((c) => c.method === 'update');
  assert.equal(updateCalls.length, 2, 'exactly one status write + exactly one attendance write, no duplicates');
  assert.deepEqual(updateCalls[0]!.args[0], { status: 'approved' });
  // Asia/Tokyo is UTC+9 with no DST: 2026-08-03 09:00/17:00 local -> 00:00/08:00 UTC.
  assert.deepEqual(updateCalls[1]!.args[0], {
    clock_in: '2026-08-03T00:00:00.000Z',
    clock_out: '2026-08-03T08:00:00.000Z',
  });
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'attendance_id' && c.args[1] === 'att-1'));
});

test('decideCorrectionRequest never touches attendance on reject, even when the request carries requested values', async () => {
  const decidedRow = {
    ...requestRow,
    kind: 'correction',
    status: 'rejected',
    location_id: 'loc-1',
    attendance_id: 'att-1',
    details: { clockInLocal: '09:00', clockOutLocal: '17:00' },
  };
  const { client, calls } = recordingClient({ data: decidedRow, error: null });
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'rejected');
  assert.equal(result.status, 'success');
  assert.equal(calls.filter((c) => c.method === 'update').length, 1, 'reject must only write status, never attendance');
});

test('decideCorrectionRequest is a no-op on attendance when an approved correction carries no requested clock/break values', async () => {
  const decidedRow = {
    ...requestRow,
    kind: 'correction',
    status: 'approved',
    location_id: 'loc-1',
    attendance_id: 'att-1',
    details: { message: 'Forgot to clock out, please review.' },
  };
  const { client, calls } = recordingClient({ data: decidedRow, error: null });
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'success');
  assert.equal(calls.filter((c) => c.method === 'update').length, 1, 'no requested values means nothing to apply to attendance');
});

test('decideCorrectionRequest applies requested values to a newly created attendance row when the request has no attendance_id (FR-01 from-scratch correction)', async () => {
  const decidedRow = {
    ...requestRow,
    kind: 'correction',
    status: 'approved',
    location_id: 'loc-1',
    attendance_id: null,
    work_date: '2026-08-03',
    details: { clockInLocal: '07:05', clockOutLocal: '15:05' },
  };
  const locationRow = { tenant_id: TENANT_ID, location_id: 'loc-1', location_name: 'Main', timezone: 'Asia/Tokyo', is_active: true };
  const { client, calls } = recordingClient([
    { data: decidedRow, error: null }, // decide: status -> approved
    { data: [locationRow], error: null }, // listTenantLocations
    { data: null, error: null }, // applyApprovedCorrection: find existing row for the day -> none
    { data: { ...decidedRow, attendance_id: 'att-new' }, error: null }, // applyApprovedCorrection: insert
  ]);
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'success');

  const insertCall = calls.find((c) => c.method === 'insert');
  assert.ok(insertCall, 'a request with no attendance_id must create the attendance row on approval, never silently no-op');
  const insertPayload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(insertPayload.employee_id, EMPLOYEE_ID);
  assert.equal(insertPayload.work_date, '2026-08-03');
  // Asia/Tokyo is UTC+9 with no DST: 2026-08-03 07:05/15:05 local -> 2026-08-02T22:05 / 2026-08-03T06:05 UTC.
  assert.equal(insertPayload.clock_in, '2026-08-02T22:05:00.000Z');
  assert.equal(insertPayload.clock_out, '2026-08-03T06:05:00.000Z');
});

test('decideCorrectionRequest reverts the decision back to pending when applying the attendance side fails (atomicity: never Approved without applied hours)', async () => {
  const decidedRow = {
    ...requestRow,
    kind: 'correction',
    status: 'approved',
    location_id: 'loc-1',
    attendance_id: 'att-1',
    work_date: '2026-08-03',
    details: { clockInLocal: '09:00', clockOutLocal: '17:00' },
  };
  const locationRow = { tenant_id: TENANT_ID, location_id: 'loc-1', location_name: 'Main', timezone: 'Asia/Tokyo', is_active: true };
  const { client, calls } = recordingClient([
    { data: decidedRow, error: null }, // decide: status -> approved
    { data: [locationRow], error: null }, // listTenantLocations
    { data: null, error: { code: '42501', message: 'permission denied' } }, // applyApprovedCorrection: fails
    { data: { ...decidedRow, status: 'pending' }, error: null }, // revert back to pending
  ]);
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'unauthorized');

  const updateCalls = calls.filter((c) => c.method === 'update');
  assert.equal(updateCalls.length, 3, 'status->approved, failed attendance update, and the revert back to pending');
  assert.deepEqual(updateCalls[0]!.args[0], { status: 'approved' });
  assert.deepEqual(updateCalls[2]!.args[0], { status: 'pending' });
});

test('decideCorrectionRequest returns stale_reference when the request exists but was already decided concurrently', async () => {
  // First call: the `.eq('status','pending')` update matches zero rows
  // because another manager's decision already flipped the status away
  // from 'pending' between this manager loading the queue and submitting
  // theirs. Second call: the existence follow-up finds the row -- this is
  // the concurrent-decision race, not a missing request, so it must map to
  // the same `stale_reference` status `decideShiftExchange('approved', ...)`
  // uses for its own concurrent-decision race (see shift-exchanges.ts),
  // not the generic `not_found`.
  const { client, calls } = recordingClient([
    { data: null, error: null },
    { data: { request_id: 'r1' }, error: null },
  ]);
  const result = await decideCorrectionRequest(client, TENANT_ID, 'r1', 'approved');
  assert.equal(result.status, 'stale_reference');
  assert.ok(
    calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'pending'),
    'decision update must be guarded by .eq("status", "pending") to prevent a double-decide race',
  );
});
