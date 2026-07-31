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
