import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeManagerShortageDateSet,
  toManagerCorrectionSummaries,
  toManagerViewAssignments,
  toManagerViewShiftTypes,
  toManagerViewStaff,
} from './manager-view-model';
import type { ShiftAssignment } from '@/lib/demo/cafe/types';
import { HELP_MANAGER_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';

function staff(overrides: Partial<WorkforceStaffManageEntry> = {}): WorkforceStaffManageEntry {
  return {
    staffId: 's1',
    name: 'Taro',
    positionLabel: null,
    employmentType: null,
    isActive: true,
    ...overrides,
  } as WorkforceStaffManageEntry;
}

test('toManagerViewStaff maps id/name and defaults every entry to the generic staff role (Preview has no manager-role distinction)', () => {
  const result = toManagerViewStaff([staff({ staffId: 'abc', name: 'Hanako' })]);
  assert.deepEqual(result, [{ id: 'abc', name: 'Hanako', role: 'staff' }]);
});

test('toManagerViewShiftTypes prefers labelJa, falls back to labelEn then code, and carries local times through', () => {
  const shiftTypes = [
    { shiftTypeId: 't1', code: 'AM', labelJa: '午前', labelEn: 'Morning', startsAtLocal: '09:00', endsAtLocal: '13:00' },
    { shiftTypeId: 't2', code: 'PM', labelJa: '', labelEn: 'Evening', startsAtLocal: '17:00', endsAtLocal: '21:00' },
    { shiftTypeId: 't3', code: 'CUSTOM', labelJa: '', labelEn: '', startsAtLocal: '00:00', endsAtLocal: '00:00' },
  ] as unknown as WorkforceShiftType[];

  const result = toManagerViewShiftTypes(shiftTypes);
  assert.equal(result[0]?.label, '午前');
  assert.equal(result[1]?.label, 'Evening');
  assert.equal(result[2]?.label, 'CUSTOM');
  assert.equal(result[0]?.startTime, '09:00');
  assert.equal(result[0]?.endTime, '13:00');
});

test('toManagerViewAssignments drops unassigned (employeeId: null) shifts rather than attributing them to a fabricated staff row', () => {
  const assignments = [
    { employeeId: 'staff-1', startsAt: '2026-07-20T00:00:00.000Z', shiftTypeId: 't1' },
    { employeeId: null, startsAt: '2026-07-20T00:00:00.000Z', shiftTypeId: 't1' },
  ] as unknown as WorkforceShiftAssignment[];

  const result = toManagerViewAssignments(assignments, 'Asia/Tokyo');
  assert.equal(result.length, 1);
  assert.equal(result[0]?.staffId, 'staff-1');
  assert.equal(result[0]?.date, '2026-07-20');
});

test('toManagerCorrectionSummaries never leaks a raw employee UUID - an unknown staffId maps to a null staffName, never the id', () => {
  const employeeUuid = 'a3f1c2d4-5678-4abc-9def-0123456789ab';
  const requests = [
    { requestId: 'r1', employeeId: employeeUuid, workDate: '2026-07-20', details: {} },
  ] as unknown as WorkforceShiftRequest[];

  const result = toManagerCorrectionSummaries(requests, new Map());
  assert.equal(result[0]?.staffName, null);
});

test('toManagerCorrectionSummaries returns null (not a baked-in JA string) for a missing staff name or message', () => {
  const requests = [
    { requestId: 'r1', employeeId: 'staff-1', workDate: '2026-07-20', details: { message: '休憩時間の修正をお願いします' } },
    { requestId: 'r2', employeeId: 'unknown-id', workDate: '2026-07-21', details: {} },
  ] as unknown as WorkforceShiftRequest[];
  const staffById = new Map([['staff-1', staff({ staffId: 'staff-1', name: 'Hanako' })]]);

  const result = toManagerCorrectionSummaries(requests, staffById);
  assert.deepEqual(result[0], { requestId: 'r1', workDate: '2026-07-20', staffName: 'Hanako', message: '休憩時間の修正をお願いします' });
  assert.deepEqual(result[1], { requestId: 'r2', workDate: '2026-07-21', staffName: null, message: null });
});

function shiftType(overrides: Partial<WorkforceShiftType> = {}): WorkforceShiftType {
  return {
    shiftTypeId: 'st1',
    tenantId: 't1',
    locationId: 'l1',
    code: 'AM',
    labelJa: '午前',
    labelEn: 'Morning',
    startsAtLocal: '08:30',
    endsAtLocal: '13:00',
    breakMinutes: 0,
    isCustom: false,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

test('computeManagerShortageDateSet flags only a date whose real active window is understaffed', () => {
  const dates = ['2026-08-03', '2026-08-04'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' }), shiftType({ shiftTypeId: 'st-pm', code: 'PM' })];
  const assignments: ShiftAssignment[] = [
    { staffId: 'e1', date: '2026-08-03', shiftTypeId: 'st-am' },
    { staffId: 'e2', date: '2026-08-04', shiftTypeId: 'st-am' },
    { staffId: 'e3', date: '2026-08-04', shiftTypeId: 'st-pm' },
  ];
  // Both dates require 1 staff per window; 2026-08-03 has zero PM coverage.
  const result = computeManagerShortageDateSet(dates, assignments, shiftTypes, [1, 1]);
  assert.deepEqual([...result], ['2026-08-03']);
});

test('computeManagerShortageDateSet reports no shortage when every active window meets the requirement', () => {
  const dates = ['2026-08-03'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' })];
  const assignments: ShiftAssignment[] = [{ staffId: 'e1', date: '2026-08-03', shiftTypeId: 'st-am' }];
  const result = computeManagerShortageDateSet(dates, assignments, shiftTypes, [1]);
  assert.equal(result.size, 0);
});

test('computeManagerShortageDateSet ignores inactive shift types and CUSTOM/unresolved codes', () => {
  const dates = ['2026-08-03'];
  const shiftTypes = [
    shiftType({ shiftTypeId: 'st-inactive', code: 'AM', isActive: false }),
    shiftType({ shiftTypeId: 'st-custom', code: 'CUSTOM' }),
  ];
  const assignments: ShiftAssignment[] = [{ staffId: 'e1', date: '2026-08-03', shiftTypeId: 'st-custom' }];
  // No active, windowed shift type exists at all -- nothing to score against.
  const result = computeManagerShortageDateSet(dates, assignments, shiftTypes, [5]);
  assert.equal(result.size, 0);
});

test('computeManagerShortageDateSet still counts an existing assignment toward its window even if that assignment\'s own shift type was later deactivated', () => {
  const dates = ['2026-08-03'];
  const shiftTypes = [
    // AM is still an active window overall (a different shift type keeps it
    // active) - but the assignment below references the specific shift type
    // that was deactivated after the staff member was scheduled.
    shiftType({ shiftTypeId: 'st-am-active', code: 'AM', isActive: true }),
    shiftType({ shiftTypeId: 'st-am-deactivated', code: 'AM', isActive: false }),
  ];
  const assignments: ShiftAssignment[] = [{ staffId: 'e1', date: '2026-08-03', shiftTypeId: 'st-am-deactivated' }];
  const result = computeManagerShortageDateSet(dates, assignments, shiftTypes, [1]);
  assert.equal(result.size, 0, 'a real assigned worker must still count toward headcount even if their shift type was deactivated afterward');
});

test('computeManagerShortageDateSet derives the required headcount from each date\'s actual weekday, not its position in a full Mon-Sun week', () => {
  // Mon 2026-08-03 .. Sun 2026-08-09. requiredHeadcountByWeekday is
  // Mon-first: index 3 (Thu, 08-06) requires 2; every other day requires 0.
  const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' })];
  const requiredHeadcountByWeekday = [0, 0, 0, 2, 0, 0, 0];
  const result = computeManagerShortageDateSet(dates, [], shiftTypes, requiredHeadcountByWeekday);
  assert.deepEqual([...result], ['2026-08-06'], 'only Thursday (index 3, the only day with a positive requirement) should be flagged');
});

test('computeManagerShortageDateSet scores a partial week starting midweek correctly (no full 7-day array required)', () => {
  // Just Wed 2026-08-05 and Thu 2026-08-06. Requirement array is still the
  // full Mon-first week - Wed is index 2 (required 1, unmet), Thu is index 3
  // (required 0, always met).
  const dates = ['2026-08-05', '2026-08-06'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' })];
  const requiredHeadcountByWeekday = [0, 0, 1, 0, 0, 0, 0];
  const result = computeManagerShortageDateSet(dates, [], shiftTypes, requiredHeadcountByWeekday);
  assert.deepEqual([...result], ['2026-08-05']);
});

test('computeManagerShortageDateSet scores a reordered/bounded date array by each date\'s own weekday, not array order', () => {
  // Sunday (index 6, required 3) listed before Monday (index 0, required 0) -
  // a positional lookup would score these backwards.
  const dates = ['2026-08-09', '2026-08-03'];
  const shiftTypes = [shiftType({ shiftTypeId: 'st-am', code: 'AM' })];
  const requiredHeadcountByWeekday = [0, 0, 0, 0, 0, 0, 3];
  const result = computeManagerShortageDateSet(dates, [], shiftTypes, requiredHeadcountByWeekday);
  assert.deepEqual([...result], ['2026-08-09'], 'Sunday must be flagged (real requirement 3, zero assigned) regardless of its position in the input array');
});

test('HELP_MANAGER_SHIFT_TABLE JA and EN both describe "!" as a real staffing shortage, not correction requests', () => {
  assert.ok(HELP_MANAGER_SHIFT_TABLE.ja.body.includes('人員が不足'), 'JA help copy must describe a real staffing shortage');
  assert.ok(!HELP_MANAGER_SHIFT_TABLE.ja.body.includes('確認が必要'), 'JA help copy must not claim "!" means confirmation-needed/correction requests');
  assert.ok(HELP_MANAGER_SHIFT_TABLE.en.body.toLowerCase().includes('understaffed'), 'EN help copy must describe a real staffing shortage');
});
