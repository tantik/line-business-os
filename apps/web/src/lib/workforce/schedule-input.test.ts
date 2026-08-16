import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCreateShiftAssignmentInput,
  parsePublishScheduleInput,
  parseRunAutoDistributionInput,
  parseSubmitShiftPreferenceInput,
  parseUpdateShiftAssignmentInput,
} from './schedule-input.js';

const LOCATION_ID = '11111111-1111-1111-1111-111111111111';
const ASSIGNMENT_ID = '22222222-2222-2222-2222-222222222222';
const EMPLOYEE_ID = '33333333-3333-3333-3333-333333333333';
const SHIFT_TYPE_ID = '44444444-4444-4444-4444-444444444444';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test('parseSubmitShiftPreferenceInput accepts a chosen shift type', () => {
  assert.deepEqual(
    parseSubmitShiftPreferenceInput(formData({ workDate: '2026-08-03', shiftTypeId: SHIFT_TYPE_ID })),
    { workDate: '2026-08-03', shiftTypeId: SHIFT_TYPE_ID, isUnavailable: false },
  );
});
test('parseSubmitShiftPreferenceInput accepts isUnavailable with no shift type', () => {
  const fd = formData({ workDate: '2026-08-03' });
  fd.set('isUnavailable', 'true');
  assert.deepEqual(parseSubmitShiftPreferenceInput(fd), { workDate: '2026-08-03', shiftTypeId: null, isUnavailable: true });
});
test('parseSubmitShiftPreferenceInput rejects a blank submission (no shift type, not unavailable)', () => {
  assert.equal(parseSubmitShiftPreferenceInput(formData({ workDate: '2026-08-03' })), null);
});
test('parseSubmitShiftPreferenceInput rejects a missing/malformed workDate', () => {
  assert.equal(parseSubmitShiftPreferenceInput(formData({ shiftTypeId: SHIFT_TYPE_ID })), null);
});

test('parseUpdateShiftAssignmentInput parses a full valid edit', () => {
  const fd = formData({
    assignmentId: ASSIGNMENT_ID,
    locationId: LOCATION_ID,
    employeeId: EMPLOYEE_ID,
    shiftTypeId: SHIFT_TYPE_ID,
    workDate: '2026-08-03',
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: '15',
    role: 'Barista',
    notes: 'Cover for Kenji',
  });
  fd.set('published', 'true');
  assert.deepEqual(parseUpdateShiftAssignmentInput(fd), {
    assignmentId: ASSIGNMENT_ID,
    locationId: LOCATION_ID,
    employeeId: EMPLOYEE_ID,
    shiftTypeId: SHIFT_TYPE_ID,
    workDate: '2026-08-03',
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: 15,
    role: 'Barista',
    notes: 'Cover for Kenji',
    published: true,
  });
});
test('parseUpdateShiftAssignmentInput allows unassigning (blank employeeId) and defaults breakMinutes to 0', () => {
  const result = parseUpdateShiftAssignmentInput(
    formData({
      assignmentId: ASSIGNMENT_ID,
      locationId: LOCATION_ID,
      workDate: '2026-08-03',
      startsAtLocal: '09:00',
      endsAtLocal: '13:00',
    }),
  );
  assert.equal(result?.employeeId, null);
  assert.equal(result?.breakMinutes, 0);
});
test('parseUpdateShiftAssignmentInput rejects endsAtLocal <= startsAtLocal', () => {
  assert.equal(
    parseUpdateShiftAssignmentInput(
      formData({
        assignmentId: ASSIGNMENT_ID,
        locationId: LOCATION_ID,
        workDate: '2026-08-03',
        startsAtLocal: '13:00',
        endsAtLocal: '09:00',
      }),
    ),
    null,
  );
});

test('parseCreateShiftAssignmentInput parses a full valid assignment', () => {
  const fd = formData({
    locationId: LOCATION_ID,
    employeeId: EMPLOYEE_ID,
    shiftTypeId: SHIFT_TYPE_ID,
    workDate: '2026-08-03',
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: '15',
    role: 'Barista',
    notes: 'Cover for Kenji',
  });
  assert.deepEqual(parseCreateShiftAssignmentInput(fd), {
    locationId: LOCATION_ID,
    employeeId: EMPLOYEE_ID,
    shiftTypeId: SHIFT_TYPE_ID,
    workDate: '2026-08-03',
    startsAtLocal: '09:00',
    endsAtLocal: '13:00',
    breakMinutes: 15,
    role: 'Barista',
    notes: 'Cover for Kenji',
  });
});
test('parseCreateShiftAssignmentInput defaults breakMinutes to 0 and shiftTypeId to null when absent', () => {
  const result = parseCreateShiftAssignmentInput(
    formData({
      locationId: LOCATION_ID,
      employeeId: EMPLOYEE_ID,
      workDate: '2026-08-03',
      startsAtLocal: '09:00',
      endsAtLocal: '13:00',
    }),
  );
  assert.equal(result?.shiftTypeId, null);
  assert.equal(result?.breakMinutes, 0);
});
test('parseCreateShiftAssignmentInput rejects a missing employeeId (unlike update, there is no unassign path here)', () => {
  assert.equal(
    parseCreateShiftAssignmentInput(
      formData({
        locationId: LOCATION_ID,
        workDate: '2026-08-03',
        startsAtLocal: '09:00',
        endsAtLocal: '13:00',
      }),
    ),
    null,
  );
});
test('parseCreateShiftAssignmentInput rejects endsAtLocal <= startsAtLocal', () => {
  assert.equal(
    parseCreateShiftAssignmentInput(
      formData({
        locationId: LOCATION_ID,
        employeeId: EMPLOYEE_ID,
        workDate: '2026-08-03',
        startsAtLocal: '13:00',
        endsAtLocal: '09:00',
      }),
    ),
    null,
  );
});

test('parsePublishScheduleInput accepts a valid period', () => {
  assert.deepEqual(parsePublishScheduleInput(formData({ locationId: LOCATION_ID, periodStart: '2026-08-01', periodEnd: '2026-08-15' })), {
    locationId: LOCATION_ID,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-15',
  });
});
test('parsePublishScheduleInput rejects periodEnd before periodStart', () => {
  assert.equal(
    parsePublishScheduleInput(formData({ locationId: LOCATION_ID, periodStart: '2026-08-15', periodEnd: '2026-08-01' })),
    null,
  );
});

test('parseRunAutoDistributionInput accepts a valid payload with weekday + workDate rules', () => {
  const result = parseRunAutoDistributionInput({
    locationId: LOCATION_ID,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-07',
    staffingRequirements: [
      { weekday: 1, windowCode: 'am', requiredHeadcount: 2 },
      { workDate: '2026-08-03', windowCode: 'ALL', requiredHeadcount: 1 },
    ],
    maxPeriodHours: 40,
    overwriteExisting: true,
  });
  assert.deepEqual(result, {
    locationId: LOCATION_ID,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-07',
    staffingRequirements: [
      { weekday: 1, workDate: undefined, windowCode: 'AM', requiredHeadcount: 2 },
      { weekday: undefined, workDate: '2026-08-03', windowCode: 'ALL', requiredHeadcount: 1 },
    ],
    maxPeriodHours: 40,
    overwriteExisting: true,
  });
});
test('parseRunAutoDistributionInput defaults overwriteExisting to false and maxPeriodHours to undefined', () => {
  const result = parseRunAutoDistributionInput({
    locationId: LOCATION_ID,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-07',
    staffingRequirements: [],
  });
  assert.equal(result?.overwriteExisting, false);
  assert.equal(result?.maxPeriodHours, undefined);
});
test('parseRunAutoDistributionInput rejects an unknown windowCode', () => {
  assert.equal(
    parseRunAutoDistributionInput({
      locationId: LOCATION_ID,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-07',
      staffingRequirements: [{ weekday: 1, windowCode: 'NOON', requiredHeadcount: 1 }],
    }),
    null,
  );
});
test('parseRunAutoDistributionInput rejects a requirement with neither weekday nor workDate', () => {
  assert.equal(
    parseRunAutoDistributionInput({
      locationId: LOCATION_ID,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-07',
      staffingRequirements: [{ windowCode: 'AM', requiredHeadcount: 1 }],
    }),
    null,
  );
});
test('parseRunAutoDistributionInput rejects non-array staffingRequirements and a non-object payload', () => {
  assert.equal(
    parseRunAutoDistributionInput({ locationId: LOCATION_ID, periodStart: '2026-08-01', periodEnd: '2026-08-07' }),
    null,
  );
  assert.equal(parseRunAutoDistributionInput('nope'), null);
  assert.equal(parseRunAutoDistributionInput(null), null);
});
