import { test } from 'node:test';
import './estimated-earnings.test.js';
import assert from 'node:assert/strict';
import { listAttendanceForManager, listMyAttendance, submitWorkReport } from './attendance.js';
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
