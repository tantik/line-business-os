import type { WorkforceAttendance } from './attendance';

export interface EstimatedEarningsSummary {
  workedHours: number;
  hourlyWageYen: number | null;
  estimatedEarningsYen: number | null;
}

/**
 * Minutes actually worked between two ISO instants, net of break time.
 * Shared by `workedHoursForMonth` below (always a completed `clockIn`/
 * `clockOut` pair) and `labour-cost.ts`'s `estimatedLabourCostSoFar` (an
 * open shift passes "now" as `endIso` instead of a real `clockOut`) --
 * factored out per the mission plan's explicit "factor shared
 * minutes-elapsed logic out of estimated-earnings.ts rather than
 * duplicating it" instruction (WP A7).
 */
export function elapsedWorkedMinutes(clockInIso: string, endIso: string, actualBreakMinutes: number): number {
  const elapsedMinutes = (new Date(endIso).getTime() - new Date(clockInIso).getTime()) / 60000;
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return 0;
  return Math.max(elapsedMinutes - Math.max(actualBreakMinutes, 0), 0);
}

function workedMinutesForMonth(attendance: WorkforceAttendance[], monthPrefix: string): number {
  return attendance.reduce((total, row) => {
    if (!row.workDate.startsWith(monthPrefix) || !row.clockIn || !row.clockOut) return total;
    return total + elapsedWorkedMinutes(row.clockIn, row.clockOut, row.actualBreakMinutes);
  }, 0);
}

/** Display hours, rounded to 0.1h. Never multiply this by a wage -- see `estimatedEarningsSummary`. */
export function workedHoursForMonth(attendance: WorkforceAttendance[], monthPrefix: string): number {
  return Math.round((workedMinutesForMonth(attendance, monthPrefix) / 60) * 10) / 10;
}

/**
 * Yen is computed from exact worked minutes, not from the 0.1h-rounded
 * display hours (2026-10-07 full QA: 4h50m at ¥1,200 showed ¥5,760 -- 4.8h x
 * 1,200 -- instead of ¥5,800; the error reaches 0.05h x wage per month).
 */
export function estimatedEarningsSummary(
  attendance: WorkforceAttendance[],
  monthPrefix: string,
  hourlyWageYen: number | null,
): EstimatedEarningsSummary {
  const minutes = workedMinutesForMonth(attendance, monthPrefix);
  return {
    workedHours: Math.round((minutes / 60) * 10) / 10,
    hourlyWageYen,
    estimatedEarningsYen: hourlyWageYen === null ? null : Math.round((minutes / 60) * hourlyWageYen),
  };
}
