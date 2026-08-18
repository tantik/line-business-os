import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatedLabourCostSoFar } from './labour-cost.js';
import type { LabourCostStaffEntry } from './labour-cost.js';
import type { WorkforceAttendance } from './attendance.js';

const PERIOD_START = '2026-08-17';
const PERIOD_END = '2026-08-23';
const NOW_ISO = '2026-08-17T05:00:00.000Z';

function makeAttendance(overrides: Partial<WorkforceAttendance>): WorkforceAttendance {
  return {
    attendanceId: 'att-1',
    tenantId: 'tenant-a',
    locationId: 'loc-1',
    employeeId: 'staff-1',
    shiftId: null,
    workDate: '2026-08-17',
    clockIn: null,
    clockOut: null,
    actualBreakMinutes: 0,
    status: 'open',
    transportationCost: null,
    dailyMessage: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

function makeStaff(overrides: Partial<LabourCostStaffEntry> = {}): LabourCostStaffEntry {
  return { staffId: 'staff-1', name: 'Test Staff', isActive: true, hourlyWageYen: 1200, ...overrides };
}

test('estimatedLabourCostSoFar: not yet clocked in -> zero', () => {
  const attendance = [makeAttendance({ clockIn: null, clockOut: null })];
  const result = estimatedLabourCostSoFar([makeStaff()], attendance, PERIOD_START, PERIOD_END, NOW_ISO);
  assert.equal(result.perStaff[0]!.workedHours, 0);
  assert.equal(result.perStaff[0]!.estimatedCostYen, 0);
  assert.equal(result.totalCostYen, 0);
});

test('estimatedLabourCostSoFar: in-progress shift counts up to now, not projected further', () => {
  // 01:00Z clock-in, "now" is 05:00Z -> 4 worked hours, no break.
  const attendance = [makeAttendance({ clockIn: '2026-08-17T01:00:00.000Z', clockOut: null })];
  const result = estimatedLabourCostSoFar([makeStaff()], attendance, PERIOD_START, PERIOD_END, NOW_ISO);
  assert.equal(result.perStaff[0]!.workedHours, 4);
  assert.equal(result.perStaff[0]!.estimatedCostYen, 4800);
});

test('estimatedLabourCostSoFar: fully clocked shift counts fully regardless of "now"', () => {
  const attendance = [makeAttendance({ clockIn: '2026-08-17T00:00:00.000Z', clockOut: '2026-08-17T08:00:00.000Z', actualBreakMinutes: 60 })];
  const result = estimatedLabourCostSoFar([makeStaff()], attendance, PERIOD_START, PERIOD_END, NOW_ISO);
  // 8h - 1h break = 7h.
  assert.equal(result.perStaff[0]!.workedHours, 7);
  assert.equal(result.perStaff[0]!.estimatedCostYen, 8400);
});

test('estimatedLabourCostSoFar: excludes rows outside the displayed period', () => {
  const attendance = [makeAttendance({ workDate: '2026-08-10', clockIn: '2026-08-10T00:00:00.000Z', clockOut: '2026-08-10T08:00:00.000Z' })];
  const result = estimatedLabourCostSoFar([makeStaff()], attendance, PERIOD_START, PERIOD_END, NOW_ISO);
  assert.equal(result.perStaff[0]!.workedHours, 0);
});

test('estimatedLabourCostSoFar: excludes inactive staff, null hourlyWageYen yields null cost, total sums only known costs', () => {
  const staff = [
    makeStaff({ staffId: 'staff-1', hourlyWageYen: 1000 }),
    makeStaff({ staffId: 'staff-2', hourlyWageYen: null }),
    makeStaff({ staffId: 'staff-3', isActive: false }),
  ];
  const attendance = [
    makeAttendance({ employeeId: 'staff-1', clockIn: '2026-08-17T00:00:00.000Z', clockOut: '2026-08-17T01:00:00.000Z' }),
    makeAttendance({ employeeId: 'staff-2', clockIn: '2026-08-17T00:00:00.000Z', clockOut: '2026-08-17T01:00:00.000Z' }),
    makeAttendance({ employeeId: 'staff-3', clockIn: '2026-08-17T00:00:00.000Z', clockOut: '2026-08-17T01:00:00.000Z' }),
  ];
  const result = estimatedLabourCostSoFar(staff, attendance, PERIOD_START, PERIOD_END, NOW_ISO);
  assert.deepEqual(result.perStaff.map((e) => e.staffId), ['staff-1', 'staff-2']);
  assert.equal(result.perStaff[0]!.estimatedCostYen, 1000);
  assert.equal(result.perStaff[1]!.estimatedCostYen, null);
  assert.equal(result.totalCostYen, 1000);
});
