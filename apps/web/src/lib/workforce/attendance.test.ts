import { test } from 'node:test';
import './estimated-earnings.test.js';
import assert from 'node:assert/strict';
import { applyApprovedCorrection, listAttendanceForManager, listMyAttendance, submitWorkReport } from './attendance.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';
const EMPLOYEE_ID = 'emp-1';

const attendanceRow = {
  attendance_id: 'att-1',
  tenant_id: TENANT_ID,
  location_id: 'loc-1',
  employee_id: EMPLOYEE_ID,
  shift_id: null,
  work_date: '2026-08-03',
  clock_in: '2026-08-03T00:00:00.000Z',
  clock_out: null,
  actual_break_minutes: 0,
  status: 'present',
  transportation_cost: 300,
  daily_message: null,
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

test('listMyAttendance maps rows', async () => {
  const { client } = recordingClient({ data: [attendanceRow], error: null });
  const result = await listMyAttendance(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data[0]!.attendanceId, 'att-1');
    assert.equal(result.data[0]!.actualBreakMinutes, 0);
  }
});

test('listAttendanceForManager maps rows', async () => {
  const { client } = recordingClient({ data: [attendanceRow], error: null });
  const result = await listAttendanceForManager(client, TENANT_ID);
  assert.equal(result.status, 'success');
});

test('listAttendanceForManager applies work_date bounds and the one-employee filter (scale fix / F2)', async () => {
  const { client, calls } = recordingClient({ data: [attendanceRow], error: null });
  const result = await listAttendanceForManager(client, TENANT_ID, { fromDate: '2026-09-01', toDate: '2026-09-30', employeeId: EMPLOYEE_ID });
  assert.equal(result.status, 'success');
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT_ID));
  assert.ok(calls.some((c) => c.method === 'gte' && c.args[0] === 'work_date' && c.args[1] === '2026-09-01'));
  assert.ok(calls.some((c) => c.method === 'lte' && c.args[0] === 'work_date' && c.args[1] === '2026-09-30'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'employee_id' && c.args[1] === EMPLOYEE_ID));
});

test('listAttendanceForManager by ids: empty id list makes no query', async () => {
  const { client, calls } = recordingClient({ data: [attendanceRow], error: null });
  const empty = await listAttendanceForManager(client, TENANT_ID, { attendanceIds: [] });
  assert.deepEqual(empty, { status: 'success', data: [] });
  assert.equal(calls.length, 0);
  await listAttendanceForManager(client, TENANT_ID, { attendanceIds: ['att-1'] });
  assert.ok(calls.some((c) => c.method === 'in' && c.args[0] === 'attendance_id'));
});

/**
 * Fake client that behaves like PostgREST under `max_rows = 1000`: every
 * awaited query returns at most 1000 rows, honouring `.range(from, to)`.
 * Without paging the caller would only ever see the first 1000 rows.
 */
function maxRowsCappedClient(totalRows: unknown[]) {
  const ranges: Array<[number, number]> = [];
  const orders: unknown[][] = [];
  const makeBuilder = () => {
    let range: [number, number] = [0, Number.MAX_SAFE_INTEGER];
    const builder: Record<string, unknown> = {};
    for (const method of ['schema', 'from', 'select', 'eq', 'gte', 'lte', 'in']) builder[method] = () => builder;
    builder.order = (...args: unknown[]) => {
      orders.push(args);
      return builder;
    };
    builder.range = (from: number, to: number) => {
      range = [from, to];
      ranges.push([from, to]);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const [from, to] = range;
      const data = totalRows.slice(from, Math.min(to + 1, from + 1000));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return builder;
  };
  const client = { schema: () => makeBuilder() } as unknown as Parameters<typeof listAttendanceForManager>[0];
  return { client, ranges, orders };
}

function manyAttendanceRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...attendanceRow,
    attendance_id: `att-${String(i).padStart(5, '0')}`,
    employee_id: `emp-${i % 40}`,
    work_date: `2026-09-${String((i % 30) + 1).padStart(2, '0')}`,
  }));
}

test('listAttendanceForManager returns every row above the PostgREST 1000-row cap (DEBT-114)', async () => {
  const total = 2_437; // ~40 staff x 2 months
  const { client, ranges, orders } = maxRowsCappedClient(manyAttendanceRows(total));
  const result = await listAttendanceForManager(client, TENANT_ID, { fromDate: '2026-08-01', toDate: '2026-09-30' });
  assert.equal(result.status, 'success');
  if (result.status !== 'success') return;
  assert.equal(result.data.length, total);
  assert.equal(new Set(result.data.map((r) => r.attendanceId)).size, total);
  assert.deepEqual(ranges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  // Deterministic paging needs a unique tiebreaker after work_date.
  assert.ok(orders.some((args) => args[0] === 'attendance_id'));
});

test('listMyAttendance returns every row above the PostgREST 1000-row cap (DEBT-114)', async () => {
  const total = 1_200;
  const { client, ranges } = maxRowsCappedClient(manyAttendanceRows(total));
  const result = await listMyAttendance(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data.length, total);
  assert.equal(ranges.length, 2);
});

test('submitWorkReport inserts when no existing row is found for (employee, work_date)', async () => {
  const { client, calls } = recordingClient([
    { data: null, error: null }, // find: no existing row
    { data: attendanceRow, error: null }, // insert
  ]);
  const result = await submitWorkReport(client, TENANT_ID, {
    employeeId: EMPLOYEE_ID,
    locationId: 'loc-1',
    workDate: '2026-08-03',
    actualBreakMinutes: 60,
    transportationCost: 300,
  });
  assert.equal(result.status, 'success');
  assert.ok(calls.some((c) => c.method === 'insert'));
  assert.ok(calls.some((c) => c.method === 'insert' && (c.args[0] as Record<string, unknown>).actual_break_minutes === 60));
  assert.ok(!calls.some((c) => c.method === 'update'));
});

test('submitWorkReport updates when an existing row is found for (employee, work_date)', async () => {
  const { client, calls } = recordingClient([
    { data: { attendance_id: 'att-1' }, error: null }, // find: existing row
    { data: attendanceRow, error: null }, // update
  ]);
  const result = await submitWorkReport(client, TENANT_ID, {
    employeeId: EMPLOYEE_ID,
    locationId: 'loc-1',
    workDate: '2026-08-03',
    dailyMessage: 'Busy day',
  });
  assert.equal(result.status, 'success');
  assert.ok(calls.some((c) => c.method === 'update'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'attendance_id' && c.args[1] === 'att-1'));
});

test('applyApprovedCorrection updates the target attendance row by attendance_id with only the fields supplied', async () => {
  const { client, calls } = recordingClient({ data: { ...attendanceRow, clock_in: '2026-08-03T00:00:00.000Z', clock_out: '2026-08-03T08:00:00.000Z' }, error: null });
  const result = await applyApprovedCorrection(client, TENANT_ID, {
    attendanceId: 'att-1',
    employeeId: EMPLOYEE_ID,
    workDate: '2026-08-03',
    locationId: 'loc-1',
    clockIn: '2026-08-03T00:00:00.000Z',
    clockOut: '2026-08-03T08:00:00.000Z',
  });
  assert.equal(result.status, 'success');
  const updateCall = calls.find((c) => c.method === 'update');
  assert.deepEqual(updateCall!.args[0], { clock_in: '2026-08-03T00:00:00.000Z', clock_out: '2026-08-03T08:00:00.000Z' });
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'attendance_id' && c.args[1] === 'att-1'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT_ID));
});

test('applyApprovedCorrection returns not_found for a zero-row result (RLS-filtered or missing row), never a fabricated success', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await applyApprovedCorrection(client, TENANT_ID, {
    attendanceId: 'missing',
    employeeId: EMPLOYEE_ID,
    workDate: '2026-08-03',
    locationId: 'loc-1',
    clockIn: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(result.status, 'not_found');
});

test('applyApprovedCorrection with attendanceId=null updates the existing row found for (employee, work_date) when one exists', async () => {
  const { client, calls } = recordingClient([
    { data: { attendance_id: 'att-1' }, error: null }, // find: existing row for the day
    { data: { ...attendanceRow, clock_in: '2026-08-03T00:00:00.000Z' }, error: null }, // update
  ]);
  const result = await applyApprovedCorrection(client, TENANT_ID, {
    attendanceId: null,
    employeeId: EMPLOYEE_ID,
    workDate: '2026-08-03',
    locationId: 'loc-1',
    clockIn: '2026-08-03T00:00:00.000Z',
  });
  assert.equal(result.status, 'success');
  assert.ok(calls.some((c) => c.method === 'update'));
  assert.ok(!calls.some((c) => c.method === 'insert'));
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'attendance_id' && c.args[1] === 'att-1'));
});

test('applyApprovedCorrection with attendanceId=null creates a new attendance row when none exists for (employee, work_date) -- FR-01 from-scratch correction', async () => {
  const { client, calls } = recordingClient([
    { data: null, error: null }, // find: no existing row for the day
    { data: { ...attendanceRow, clock_in: '2026-08-03T22:05:00.000Z', clock_out: '2026-08-04T06:05:00.000Z' }, error: null }, // insert
  ]);
  const result = await applyApprovedCorrection(client, TENANT_ID, {
    attendanceId: null,
    employeeId: EMPLOYEE_ID,
    workDate: '2026-08-03',
    locationId: 'loc-1',
    clockIn: '2026-08-03T22:05:00.000Z',
    clockOut: '2026-08-04T06:05:00.000Z',
  });
  assert.equal(result.status, 'success');
  const insertCall = calls.find((c) => c.method === 'insert');
  assert.ok(insertCall, 'must insert a new attendance row rather than silently doing nothing');
  const insertPayload = insertCall!.args[0] as Record<string, unknown>;
  assert.equal(insertPayload.employee_id, EMPLOYEE_ID);
  assert.equal(insertPayload.work_date, '2026-08-03');
  assert.equal(insertPayload.location_id, 'loc-1');
  assert.equal(insertPayload.clock_in, '2026-08-03T22:05:00.000Z');
  assert.equal(insertPayload.clock_out, '2026-08-04T06:05:00.000Z');
  assert.ok(!calls.some((c) => c.method === 'update'), 'no existing row to update, so no update call should be made');
});
