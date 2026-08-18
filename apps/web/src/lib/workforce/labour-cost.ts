import type { WorkforceAttendance } from './attendance';
import { elapsedWorkedMinutes } from './estimated-earnings';

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
