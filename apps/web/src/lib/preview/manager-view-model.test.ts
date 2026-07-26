import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toManagerViewAlerts,
  toManagerViewAssignments,
  toManagerViewShiftTypes,
  toManagerViewStaff,
  UNKNOWN_STAFF_NAME_JA,
} from './manager-view-model';
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

test('toManagerViewAlerts labels each pending correction request with the staff name, date, and message, always tone "danger"', () => {
  const requests = [
    { requestId: 'r1', employeeId: 'staff-1', workDate: '2026-07-20', details: { message: '休憩時間の修正をお願いします' } },
    { requestId: 'r2', employeeId: 'staff-2', workDate: '2026-07-21', details: {} },
  ] as unknown as WorkforceShiftRequest[];
  const staffById = new Map([['staff-1', staff({ staffId: 'staff-1', name: 'Hanako' })]]);

  const result = toManagerViewAlerts(requests, staffById);
  assert.equal(result[0]?.label, 'Hanako（2026-07-20）: 休憩時間の修正をお願いします');
  assert.equal(result[0]?.tone, 'danger');
  // Unknown staffId falls back to a safe Japanese label, never the raw id.
  assert.equal(result[1]?.label, `${UNKNOWN_STAFF_NAME_JA}（2026-07-21）: 勤務時間の修正を依頼しています。`);
});

test('toManagerViewAlerts never leaks a raw employee UUID into the client-facing alert label when the staff dataset failed to load (empty staffById)', () => {
  const employeeUuid = 'a3f1c2d4-5678-4abc-9def-0123456789ab';
  const requests = [
    { requestId: 'r1', employeeId: employeeUuid, workDate: '2026-07-20', details: {} },
  ] as unknown as WorkforceShiftRequest[];

  const result = toManagerViewAlerts(requests, new Map());
  assert.ok(!result[0]?.label.includes(employeeUuid), 'alert label must not contain the raw employee UUID');
  assert.ok(result[0]?.label.startsWith(UNKNOWN_STAFF_NAME_JA), 'alert label must use the safe Japanese fallback name');
});
