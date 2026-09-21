import type { WorkforceAttendance } from './attendance';
import { elapsedWorkedMinutes, estimatedEarningsSummary } from './estimated-earnings';

export interface LabourCostStaffEntry {
  staffId: string;
  name: string;
  isActive: boolean;
  hourlyWageYen: number | null;
}

export interface EstimatedLabourCostEntry {
  staffId: string;
  name: string;
  workedHours: number;
  hourlyWageYen: number | null;
  estimatedCostYen: number | null;
}

export interface EstimatedLabourCostSummary {
  perStaff: EstimatedLabourCostEntry[];
  totalCostYen: number | null;
}

export interface MonthlyLabourCostSummary {
  /** Sum of each employee's own hours x own hourly rate; `null` when nobody has a rate (there is no honest number to show, and it must not read as a real ¥0). */
  totalYen: number | null;
  /** Employees (any status) whose rate is set and who therefore contribute. */
  ratedCount: number;
  /** Active employees with no rate set: their hours are NOT priced, so `totalYen` is a lower bound while this is > 0. */
  missingRateCount: number;
}

/**
 * The Manager dashboard's "Estimated labour cost" box: current-calendar-month
 * worked hours (completed `clockIn`/`clockOut` attendance pairs, net of break)
 * times EACH employee's own `hourly_wage_yen`, summed. An operational estimate,
 * not payroll. An employee without a rate is never priced at ¥0: they are
 * counted in `missingRateCount` so the UI can say the total is incomplete.
 */
export function monthlyLabourCostSummary(
  staffList: LabourCostStaffEntry[],
  attendance: WorkforceAttendance[],
  monthPrefix: string,
): MonthlyLabourCostSummary {
  let total = 0;
  let ratedCount = 0;
  for (const s of staffList) {
    if (s.hourlyWageYen === null) continue;
    ratedCount += 1;
    total += estimatedEarningsSummary(
      attendance.filter((row) => row.employeeId === s.staffId),
      monthPrefix,
      s.hourlyWageYen,
    ).estimatedEarningsYen ?? 0;
  }
  const missingRateCount = staffList.filter((s) => s.isActive && s.hourlyWageYen === null).length;
  return { totalYen: ratedCount > 0 ? total : null, ratedCount, missingRateCount };
}

/**
 * "Estimated labour cost" = cost of hours already worked as of `asOfIso`,
 * for the displayed week (`periodStart`..`periodEnd` inclusive) -- NOT the
 * full theoretical week (Founder decision, WP A7: this feature doesn't
 * exist correctly in the live Manager dashboard today, only a wrong
 * schedule-based version in the `/demo/cafe` prototype; this is "build
 * correctly," not "fix a bug"). An in-progress shift (`clockIn` set, no
 * `clockOut` yet) counts up to `asOfIso`, capped there, not projected
 * forward. A shift not yet clocked in contributes zero. Reuses
 * `elapsedWorkedMinutes` (`estimated-earnings.ts`) rather than
 * duplicating the minutes-elapsed calculation.
 */
export function estimatedLabourCostSoFar(
  staffList: LabourCostStaffEntry[],
  attendance: WorkforceAttendance[],
  periodStart: string,
  periodEnd: string,
  asOfIso: string,
): EstimatedLabourCostSummary {
  const perStaff = staffList
    .filter((s) => s.isActive)
    .map((s) => {
      const minutes = attendance
        .filter((a) => a.employeeId === s.staffId && a.workDate >= periodStart && a.workDate <= periodEnd && a.clockIn)
        .reduce((total, a) => total + elapsedWorkedMinutes(a.clockIn as string, a.clockOut ?? asOfIso, a.actualBreakMinutes), 0);
      const workedHours = Math.round((minutes / 60) * 10) / 10;
      const estimatedCostYen = s.hourlyWageYen === null ? null : Math.round(workedHours * s.hourlyWageYen);
      return { staffId: s.staffId, name: s.name, workedHours, hourlyWageYen: s.hourlyWageYen, estimatedCostYen };
    });

  const knownCosts = perStaff.map((e) => e.estimatedCostYen).filter((c): c is number => c !== null);
  const totalCostYen = knownCosts.length > 0 ? knownCosts.reduce((a, b) => a + b, 0) : null;

  return { perStaff, totalCostYen };
}
