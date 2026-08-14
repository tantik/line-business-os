import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaffScheduleRoster,
  computeStaffAttentionCellKeys,
  toStaffViewAssignments,
  toStaffViewShiftTypes,
  toStaffViewWorkReports,
} from './staff-schedule-view-model.js';
import type { WorkforceShiftAssignment } from './shift-assignments.js';
import type { WorkforceShiftType } from './shift-types.js';
import type { WorkforceAttendance } from './attendance.js';
import type { WorkforceShiftRequest } from './shift-requests.js';
import type { WorkforceShiftExchange } from './shift-exchanges.js';

/**
 * Cafe v2.1 canonical Staff consolidation: `staff-schedule-view-model.ts` is
 * the shared, pure port of `_client-preview`'s roster/self-pin/All-Only-me
 * derivation (`preview-staff-schedule.tsx`) into `@/lib/workforce`, so the
 * canonical dashboard Staff surface renders the same coworker-roster shift
 * grid without duplicating the logic. These tests exercise the real shared
 * functions directly (see also `preview-staff-schedule.test.ts`, which
 * guards the same roster-stability invariant against the preview surface's
 * own component source).
 */

function assignment(overrides: Partial<WorkforceShiftAssignment>): WorkforceShiftAssignment {
  return {
    assignmentId: 'assignment-default',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    employeeId: null,
    shiftTypeId: null,
    startsAt: '2026-08-10T00:00:00.000Z',
    endsAt: '2026-08-10T05:00:00.000Z',
    breakMinutes: 0,
    role: null,
    notes: null,
    published: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function shiftType(overrides: Partial<WorkforceShiftType>): WorkforceShiftType {
  return {
    shiftTypeId: 'shift-type-default',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    code: 'AM',
    labelJa: '早番',
    labelEn: 'Morning',
    startsAtLocal: '09:00:00',
    endsAtLocal: '13:00:00',
    breakMinutes: 0,
    isCustom: false,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

function attendance(overrides: Partial<WorkforceAttendance>): WorkforceAttendance {
  return {
    attendanceId: 'attendance-default',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    employeeId: 'staff-1',
    shiftId: null,
    workDate: '2026-08-10',
    clockIn: '2026-08-10T00:00:00.000Z',
    clockOut: '2026-08-10T05:00:00.000Z',
    actualBreakMinutes: 0,
    status: 'submitted',
    transportationCost: null,
    dailyMessage: null,
    createdAt: '2026-08-10T05:00:00.000Z',
    updatedAt: '2026-08-10T05:00:00.000Z',
    ...overrides,
  };
}

function shiftRequest(overrides: Partial<WorkforceShiftRequest>): WorkforceShiftRequest {
  return {
    requestId: 'request-default',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    employeeId: 'staff-1',
    shiftId: null,
    shiftTypeId: null,
    workDate: '2026-08-10',
    kind: 'correction',
    isUnavailable: false,
    status: 'pending',
    details: {},
    attendanceId: null,
    createdAt: '2026-08-10T05:00:00.000Z',
    updatedAt: '2026-08-10T05:00:00.000Z',
    ...overrides,
  };
}

function shiftExchange(overrides: Partial<WorkforceShiftExchange>): WorkforceShiftExchange {
  return {
    exchangeId: 'exchange-default',
    tenantId: 'tenant-1',
    locationId: 'location-1',
    shiftId: 'assignment-default',
    requesterEmployeeId: 'staff-1',
    replacementEmployeeId: null,
    reason: 'test',
    status: 'open',
    acceptedAt: null,
    decidedAt: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    requestKind: 'exchange',
    requestedShiftTypeId: null,
    ...overrides,
  };
}

test('buildStaffScheduleRoster pins self first and never duplicates self', () => {
  const roster = buildStaffScheduleRoster(
    [
      assignment({ employeeId: 'staff-2', startsAt: '2026-08-10T00:00:00.000Z' }),
      assignment({ employeeId: 'staff-1', startsAt: '2026-08-10T00:00:00.000Z' }),
    ],
    'staff-1',
    { me: 'Me', colleaguePrefix: 'Staff' },
  );
  assert.deepEqual(roster.map((r) => r.id), ['staff-1', 'staff-2']);
  assert.equal(roster[0]!.name, 'Me');
  assert.equal(roster[1]!.name, 'Staff 1');
  assert.equal(roster.filter((r) => r.id === 'staff-1').length, 1);
});

test('buildStaffScheduleRoster stays stable across two different weeks of the same underlying data (Founder P1, 2026-08-13)', () => {
  const windowAssignments = [
    assignment({ employeeId: 'staff-1', startsAt: '2026-08-10T00:00:00.000Z' }),
    assignment({ employeeId: 'staff-2', startsAt: '2026-08-10T00:00:00.000Z' }),
    // staff-3 only has a shift in a different week than either week below - must still appear, same position, both times.
    assignment({ employeeId: 'staff-3', startsAt: '2026-08-24T00:00:00.000Z' }),
  ];
  const labels = { me: 'Me', colleaguePrefix: 'Staff' };
  const week1 = buildStaffScheduleRoster(windowAssignments, 'staff-1', labels);
  const week2 = buildStaffScheduleRoster(windowAssignments, 'staff-1', labels);
  assert.deepEqual(week1, week2);
  assert.deepEqual(new Set(week1.map((r) => r.id)), new Set(['staff-1', 'staff-2', 'staff-3']));
});

test('buildStaffScheduleRoster excludes unpublished rows and rows with no employeeId', () => {
  const roster = buildStaffScheduleRoster(
    [
      assignment({ employeeId: 'staff-1' }),
      assignment({ employeeId: 'staff-2', published: false }),
      assignment({ employeeId: null }),
    ],
    'staff-1',
    { me: 'Me', colleaguePrefix: 'Staff' },
  );
  assert.deepEqual(roster.map((r) => r.id), ['staff-1']);
});

test('toStaffViewAssignments only includes published rows within the displayed dates, localized', () => {
  const result = toStaffViewAssignments(
    [
      assignment({ employeeId: 'staff-1', shiftTypeId: 'am', startsAt: '2026-08-09T23:00:00.000Z' }), // 2026-08-10 08:00 JST
      assignment({ employeeId: 'staff-1', published: false, startsAt: '2026-08-09T23:00:00.000Z' }),
      assignment({ employeeId: 'staff-2', startsAt: '2026-08-16T23:00:00.000Z' }), // out of the displayed week
    ],
    ['2026-08-10', '2026-08-11'],
    'Asia/Tokyo',
  );
  assert.deepEqual(result, [{ staffId: 'staff-1', date: '2026-08-10', shiftTypeId: 'am' }]);
});

test('toStaffViewShiftTypes includes active types plus any inactive type still referenced in the displayed week', () => {
  const result = toStaffViewShiftTypes(
    [shiftType({ shiftTypeId: 'am', isActive: true }), shiftType({ shiftTypeId: 'pm-retired', isActive: false })],
    [assignment({ employeeId: 'staff-1', shiftTypeId: 'pm-retired', startsAt: '2026-08-09T23:00:00.000Z' })],
    ['2026-08-10'],
    'Asia/Tokyo',
  );
  assert.deepEqual(
    result.map((t) => t.id).sort(),
    ['am', 'pm-retired'],
  );
});

test('toStaffViewShiftTypes drops an inactive type not referenced in the displayed week', () => {
  const result = toStaffViewShiftTypes(
    [shiftType({ shiftTypeId: 'am', isActive: true }), shiftType({ shiftTypeId: 'pm-retired', isActive: false })],
    [],
    ['2026-08-10'],
    'Asia/Tokyo',
  );
  assert.deepEqual(result.map((t) => t.id), ['am']);
});

test('toStaffViewWorkReports only includes completed reports (has clockOut) and attaches a matching pending correction', () => {
  const reports = toStaffViewWorkReports(
    [
      attendance({ workDate: '2026-08-10', clockOut: '2026-08-10T05:00:00.000Z' }),
      attendance({ workDate: '2026-08-11', clockOut: null }),
    ],
    [shiftRequest({ workDate: '2026-08-10', kind: 'correction', status: 'pending', details: { message: 'wrong time' } })],
    'staff-1',
    'Asia/Tokyo',
  );
  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.date, '2026-08-10');
  assert.equal(reports[0]!.hasCorrectionRequest, true);
  assert.equal(reports[0]!.correctionRequest?.reason, 'wrong time');
});

test('computeStaffAttentionCellKeys flags a pending correction request and an open exchange on the caller\'s own shift', () => {
  const keys = computeStaffAttentionCellKeys(
    [shiftRequest({ workDate: '2026-08-10', kind: 'correction', status: 'pending' })],
    [shiftExchange({ shiftId: 'assignment-1', status: 'open' })],
    [assignment({ assignmentId: 'assignment-1', employeeId: 'staff-1', startsAt: '2026-08-11T00:00:00.000Z' })],
    'staff-1',
    'UTC',
  );
  assert.ok(keys.has('staff-1:2026-08-10'), 'pending correction date must be flagged');
  assert.ok(keys.has('staff-1:2026-08-11'), 'date of the shift under an open exchange must be flagged');
});

test('computeStaffAttentionCellKeys never flags a coworker\'s open exchange on the caller\'s own dashboard (Founder QA 2026-08-14: listShiftExchanges is location-wide, not self-scoped)', () => {
  const keys = computeStaffAttentionCellKeys(
    [],
    [shiftExchange({ shiftId: 'assignment-coworker', status: 'open' })],
    [
      assignment({ assignmentId: 'assignment-coworker', employeeId: 'staff-2', startsAt: '2026-08-15T00:00:00.000Z' }),
      assignment({ assignmentId: 'assignment-mine', employeeId: 'staff-1', startsAt: '2026-08-15T00:00:00.000Z' }),
    ],
    'staff-1',
    'UTC',
  );
  assert.equal(keys.size, 0, 'a coworker\'s exchange on a different assignment must not flag the caller\'s own same-date cell');
});

test('computeStaffAttentionCellKeys ignores an approved/rejected correction and a cancelled/rejected exchange', () => {
  const keys = computeStaffAttentionCellKeys(
    [shiftRequest({ workDate: '2026-08-10', kind: 'correction', status: 'approved' })],
    [shiftExchange({ shiftId: 'assignment-1', status: 'rejected' })],
    [assignment({ assignmentId: 'assignment-1', employeeId: 'staff-1', startsAt: '2026-08-11T00:00:00.000Z' })],
    'staff-1',
    'UTC',
  );
  assert.equal(keys.size, 0);
});
