import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatedEarningsSummary, workedHoursForMonth } from './estimated-earnings.js';
import type { WorkforceAttendance } from './attendance.js';

function row(overrides: Partial<WorkforceAttendance> = {}): WorkforceAttendance {
  return {
    attendanceId: 'a', tenantId: 't', locationId: 'l', employeeId: 'e', shiftId: null,
    workDate: '2026-07-01', clockIn: '2026-07-01T00:00:00Z', clockOut: '2026-07-01T09:00:00Z',
    actualBreakMinutes: 60, status: 'present', transportationCost: null, dailyMessage: null,
    createdAt: '', updatedAt: '', ...overrides,
  };
}

test('worked hours use completed attendance in the selected month and subtract breaks', () => {
  assert.equal(workedHoursForMonth([row(), row({ workDate: '2026-06-30' }), row({ clockOut: null })], '2026-07'), 8);
});

test('estimated earnings are advisory hours times hourly wage in whole yen', () => {
  assert.deepEqual(estimatedEarningsSummary([row()], '2026-07', 1250), {
    workedHours: 8, hourlyWageYen: 1250, estimatedEarningsYen: 10000,
  });
});

test('missing wage preserves worked hours but does not invent earnings', () => {
  assert.equal(estimatedEarningsSummary([row()], '2026-07', null).estimatedEarningsYen, null);
});

test('earnings use exact worked minutes, not the 0.1h-rounded display hours (2026-10-07 live QA: 4h50m at 1,200 showed 5,760)', () => {
  // 07:00-12:00 minus 15 min break = 4h45m, plus 5 min = 4h50m total.
  const rows = [
    row({ workDate: '2026-10-06', clockIn: '2026-10-06T07:00:00Z', clockOut: '2026-10-06T12:00:00Z', actualBreakMinutes: 15 }),
    row({ workDate: '2026-10-07', clockIn: '2026-10-07T15:02:00Z', clockOut: '2026-10-07T15:07:00Z', actualBreakMinutes: 0 }),
  ];
  assert.deepEqual(estimatedEarningsSummary(rows, '2026-10', 1200), { workedHours: 4.8, hourlyWageYen: 1200, estimatedEarningsYen: 5800 });
});
