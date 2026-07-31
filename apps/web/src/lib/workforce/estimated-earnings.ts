import type { WorkforceAttendance } from './attendance';

export interface EstimatedEarningsSummary {
  workedHours: number;
  hourlyWageYen: number | null;
  estimatedEarningsYen: number | null;
}

export function workedHoursForMonth(attendance: WorkforceAttendance[], monthPrefix: string): number {
  const minutes = attendance.reduce((total, row) => {
    if (!row.workDate.startsWith(monthPrefix) || !row.clockIn || !row.clockOut) return total;
    const elapsedMinutes = (new Date(row.clockOut).getTime() - new Date(row.clockIn).getTime()) / 60000;
    if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return total;
    return total + Math.max(elapsedMinutes - Math.max(row.actualBreakMinutes, 0), 0);
  }, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export function estimatedEarningsSummary(
  attendance: WorkforceAttendance[],
  monthPrefix: string,
  hourlyWageYen: number | null,
): EstimatedEarningsSummary {
  const workedHours = workedHoursForMonth(attendance, monthPrefix);
  return {
    workedHours,
    hourlyWageYen,
    estimatedEarningsYen: hourlyWageYen === null ? null : Math.round(workedHours * hourlyWageYen),
  };
}
