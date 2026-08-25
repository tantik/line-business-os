import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Regression guard for the Founder QA Scenario `CUSTOM_<timestamp>` leak
 * (docs/ai/CAFE_MANAGER_FOUNDER_QA_SCENARIO_HANDOFF_2026-08-23.md §3): the
 * submitted-preferences table and the selected-day shift detail both used to
 * render a shift type's raw `code` (an internal id, `CUSTOM_<timestamp>` for
 * any type ever created through the create-shift-type form) instead of its
 * display label. Same convention as `manager-dashboard-client.test.ts`'s
 * equivalent guard on the Manager side.
 */
const SOURCE = readFileSync(new URL('./staff-dashboard-client.tsx', import.meta.url), 'utf8');

test('staff dashboard never renders a shift type\'s raw `code` as a display label (regression guard for the CUSTOM_<timestamp> leak)', () => {
  assert.doesNotMatch(SOURCE, /\?\.code \?\?/, 'no shift-type lookup may fall back to raw `.code`');
});

/**
 * Staff Shift Schedule v2 (2026-08-25 Founder ТЗ) regression guards. Same
 * source-text convention as the guard above -- this repo's test runner has
 * no DOM/React harness.
 */

test('the modal never falls back to the literal English word "Custom" for an unresolved shift type -- it resolves through shiftLabelFor/customShiftTimeRangeLabel', () => {
  assert.doesNotMatch(SOURCE, /: 'Custom'/, 'no literal "Custom" fallback string may remain');
  assert.match(SOURCE, /shiftLabelFor\(entry: WorkforceShiftAssignment\)/, 'must resolve every shift label through the shared shiftLabelFor helper');
  assert.match(SOURCE, /customShiftTimeRangeLabel\[lang\]\(start, end\)/, 'the last-resort fallback must be the i18n-safe time-range label, not a raw word');
});

test('the All/Only-me toggle has been removed from the real Staff dashboard', () => {
  assert.doesNotMatch(SOURCE, /setOnlyMe/, 'the onlyMe state setter must not exist');
  assert.doesNotMatch(SOURCE, /onlyCurrentStaff=\{onlyMe\}/, 'ShiftTable must not be driven by a removed onlyMe toggle');
  assert.doesNotMatch(SOURCE, /t\('all'\)/, 'the "All" toggle button must not render');
  assert.doesNotMatch(SOURCE, /t\('onlyMe'\)/, 'the "Only me" toggle button must not render');
});

test('ShiftTable is switched into compact mode via a viewport-width hook, not hardcoded true/false', () => {
  assert.match(SOURCE, /useIsCompactSchedule/, 'must use the compact-viewport hook');
  assert.match(SOURCE, /compact=\{isCompactSchedule\}/, 'ShiftTable must receive the live compact flag');
});

test('the modal branches Future-shift (Shift request) vs past/today (Shift Details) on isFutureOwnShift, never unconditionally treating any own assignment as a future request', () => {
  assert.match(SOURCE, /isFutureOwnShift = Boolean\(/, 'must compute an explicit future-own-shift flag');
  assert.match(SOURCE, /isFutureOwnShift && selectedAssignment/, 'the exchange/change/cancel request branch must require isFutureOwnShift');
});

test('the Shift Details branch renders planned, clock-in, break, and clock-out as independent rows -- missing actual values must never be substituted with the planned time', () => {
  assert.match(SOURCE, /t\('plannedShiftLabel'\), selectedAssignment \?/, 'planned-shift row must come from the assignment, not attendance');
  assert.match(SOURCE, /t\('clockInLabel'\), selectedAttendance\?\.clockIn \?/, 'clock-in row must come from attendance.clockIn only');
  assert.match(SOURCE, /t\('clockOutLabel'\), selectedAttendance\?\.clockOut \?/, 'clock-out row must come from attendance.clockOut only');
});

test('Transport in the Shift Details branch only renders when attendance.transportationCost for that exact date is present', () => {
  assert.match(SOURCE, /selectedAttendance\?\.transportationCost != null/, 'transport row must be conditional on the exact date\'s attendance transportationCost');
});

test('a "Request a correction" entry point opens CorrectionRequestForm, and an existing correction for that date shows its status instead', () => {
  assert.match(SOURCE, /t\('requestCorrectionButton'\)/, 'must render the correction request button');
  assert.match(SOURCE, /<CorrectionRequestForm/, 'must render the real CorrectionRequestForm, not a duplicate');
  assert.match(SOURCE, /selectedDateCorrection \?/, 'must branch on whether a correction request already exists for the opened date');
  assert.match(SOURCE, /correctionStatusLabel\(selectedDateCorrection\.status, lang\)/, 'must show the existing correction\'s real status');
});

test('the earnings block calls the real estimatedEarningsSummary with the caller\'s own attendance and hourly wage, and omits the estimate when hourlyWageYen is null', () => {
  assert.match(SOURCE, /estimatedEarningsSummary\(attendance \?\? \[\], todayIso\.slice\(0, 7\), profile\.hourlyWageYen\)/, 'must call the shared, untouched earnings function with real data');
  assert.match(SOURCE, /earnings\.hourlyWageYen !== null && earnings\.estimatedEarningsYen !== null/, 'must gate the estimate line on a real, non-null wage rather than fabricating one');
});
