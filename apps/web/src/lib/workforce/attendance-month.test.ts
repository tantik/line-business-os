import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionAttendanceIdsToShow,
  DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT,
  formatMonthLabel,
  isMonthCoveredByLoadRange,
  isSelectableReportMonth,
  isValidMonthPrefix,
  managerAttendanceLoadRange,
  monthDateRange,
  monthsBetween,
  shiftMonthPrefix,
} from './attendance-month.js';

test('shiftMonthPrefix crosses year boundaries both ways', () => {
  assert.equal(shiftMonthPrefix('2026-01', -1), '2025-12');
  assert.equal(shiftMonthPrefix('2026-12', 1), '2027-01');
  assert.equal(shiftMonthPrefix('2026-10', -12), '2025-10');
});

test('monthsBetween counts whole months', () => {
  assert.equal(monthsBetween('2025-10', '2026-10'), 12);
  assert.equal(monthsBetween('2026-10', '2026-09'), -1);
});

test('monthDateRange returns inclusive first/last day, incl. leap February', () => {
  assert.deepEqual(monthDateRange('2026-09'), { fromDate: '2026-09-01', toDate: '2026-09-30' });
  assert.deepEqual(monthDateRange('2028-02'), { fromDate: '2028-02-01', toDate: '2028-02-29' });
  assert.deepEqual(monthDateRange('2026-12'), { fromDate: '2026-12-01', toDate: '2026-12-31' });
});

test('isSelectableReportMonth: current month back to 12 months, never future or malformed', () => {
  assert.equal(isSelectableReportMonth('2026-10', '2026-10'), true);
  assert.equal(isSelectableReportMonth('2025-10', '2026-10'), true);
  assert.equal(isSelectableReportMonth('2025-09', '2026-10'), false);
  assert.equal(isSelectableReportMonth('2026-11', '2026-10'), false);
  assert.equal(isSelectableReportMonth('2026-13', '2026-10'), false);
  assert.equal(isSelectableReportMonth('2026-1', '2026-10'), false);
  assert.equal(isValidMonthPrefix('2026-00'), false);
});

test('managerAttendanceLoadRange = previous month start .. current month end', () => {
  assert.deepEqual(managerAttendanceLoadRange('2026-10-20'), { fromDate: '2026-09-01', toDate: '2026-10-31' });
  assert.deepEqual(managerAttendanceLoadRange('2026-01-01'), { fromDate: '2025-12-01', toDate: '2026-01-31' });
});

test('isMonthCoveredByLoadRange: current and previous month preloaded, older months are not', () => {
  const range = managerAttendanceLoadRange('2026-10-20');
  assert.equal(isMonthCoveredByLoadRange('2026-10', range), true);
  assert.equal(isMonthCoveredByLoadRange('2026-09', range), true);
  assert.equal(isMonthCoveredByLoadRange('2026-08', range), false);
});

test('formatMonthLabel: 「2026年9月」 / "September 2026"', () => {
  assert.equal(formatMonthLabel('2026-09', 'ja'), '2026年9月');
  assert.equal(formatMonthLabel('2026-09', 'en'), 'September 2026');
});

test('correctionAttendanceIdsToShow: all pending + most recent decided (bounded), no nulls, no duplicates', () => {
  const decided = Array.from({ length: DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT + 5 }, (_, i) => ({
    attendanceId: `d-${i}`,
    status: 'approved',
    updatedAt: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
  }));
  const ids = correctionAttendanceIdsToShow([
    { attendanceId: 'p-1', status: 'pending', updatedAt: '2025-01-01T00:00:00Z' },
    { attendanceId: null, status: 'pending', updatedAt: '2025-01-01T00:00:00Z' },
    { attendanceId: 'p-1', status: 'pending', updatedAt: '2025-01-02T00:00:00Z' },
    ...decided,
  ]);
  assert.ok(ids.includes('p-1'));
  assert.equal(ids.filter((id) => id === 'p-1').length, 1);
  assert.equal(ids.length, 1 + DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT);
  // The newest decided row is kept, the oldest dropped.
  assert.ok(ids.includes(`d-${DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT + 4}`));
  assert.ok(!ids.includes('d-0'));
});
