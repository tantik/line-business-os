import type { ShiftAssignment, ShiftTypeDef, WorkReport } from '@/lib/demo/cafe/types';
import type { WorkforceShiftType } from './shift-types';
import type { WorkforceShiftAssignment } from './shift-assignments';
import type { WorkforceAttendance } from './attendance';
import type { WorkforceShiftRequest } from './shift-requests';
import type { WorkforceShiftExchange } from './shift-exchanges';
import { utcIsoToLocalDateTime } from './timezone';

/**
 * Pure, read-only mappers that turn the real Workforce data shapes (already
 * loaded by a server loader) into the coworker-roster / self-pin / self-highlight
 * shift-grid view the `_client-preview` reference surface pioneered
 * (`preview-staff-schedule.tsx`), so the canonical dashboard Staff surface
 * (Cafe v2.1 consolidation) can render the same `ShiftTable`/`ShiftLegend`
 * grid without duplicating the derivation logic. Mirrors the shape of
 * `manager-view-model.ts`'s pure mappers. No fetching, no i18n string
 * baked in here (labels are parameters) - a caller in either surface
 * supplies its own language-correct labels.
 */

export interface StaffScheduleRosterEntry {
  id: string;
  name: string;
  role: 'staff';
}

export interface StaffScheduleLabels {
  /** Row label for the signed-in caller's own row. */
  me: string;
  /**
   * Prefix for a colleague's neutral, PII-free label (e.g. `"Staff"` renders
   * as `"Staff #2"`). Other employees' encrypted names are deliberately not
   * exposed to a Staff caller; the number is stable across renders/weeks
   * because the roster is derived from the full preloaded assignment window,
   * not just the currently displayed week (see `buildStaffScheduleRoster`).
   */
  colleaguePrefix: string;
}

/**
 * Coworker roster with the caller's own row pinned first, derived from the
 * FULL preloaded multi-week assignment window rather than just the
 * currently displayed week. Scoping this to only the displayed week would
 * (a) let the same colleague get a different "Staff #N" number depending on
 * which week happens to be open, and (b) drop a colleague with no shift in
 * the displayed week from the roster entirely - both read as "the schedule
 * shows the wrong person" under manual comparison against a stable,
 * week-independent roster (the exact regression this shape avoids, ported
 * from `preview-staff-schedule.tsx`).
 */
export function buildStaffScheduleRoster(
  windowAssignments: readonly WorkforceShiftAssignment[],
  ownStaffId: string,
  labels: StaffScheduleLabels,
): StaffScheduleRosterEntry[] {
  const employeeIds = Array.from(
    new Set(
      windowAssignments
        .filter((item) => item.published && item.employeeId)
        .map((item) => item.employeeId as string),
    ),
  );
  employeeIds.sort((a, b) => (a === ownStaffId ? -1 : b === ownStaffId ? 1 : a.localeCompare(b)));
  if (!employeeIds.includes(ownStaffId)) employeeIds.unshift(ownStaffId);

  let colleagueNumber = 0;
  return employeeIds.map((id) => ({
    id,
    name: id === ownStaffId ? labels.me : `${labels.colleaguePrefix} ${++colleagueNumber}`,
    role: 'staff' as const,
  }));
}

/** Shift types referenced by the displayed week's published assignments, plus every still-active shift type - so a deactivated shift type that was actually used this week still renders correctly instead of showing "-". */
export function toStaffViewShiftTypes(
  shiftTypes: readonly WorkforceShiftType[],
  windowAssignments: readonly WorkforceShiftAssignment[],
  dates: readonly string[],
  timeZone: string,
): ShiftTypeDef[] {
  const referencedShiftTypeIds = new Set(
    windowAssignments
      .filter((item) => {
        if (!item.published || !item.employeeId || !item.shiftTypeId) return false;
        const workDate = utcIsoToLocalDateTime(item.startsAt, timeZone).workDate;
        return dates.includes(workDate);
      })
      .map((item) => item.shiftTypeId as string),
  );
  return shiftTypes
    .filter((shiftType) => shiftType.isActive || referencedShiftTypeIds.has(shiftType.shiftTypeId))
    .map((shiftType) => ({
      id: shiftType.shiftTypeId,
      label: shiftType.labelJa || shiftType.labelEn || shiftType.code,
      startTime: shiftType.startsAtLocal.slice(0, 5),
      endTime: shiftType.endsAtLocal.slice(0, 5),
      isCustom: shiftType.isCustom,
    }));
}

/** Published assignments for every roster member, localized to the displayed week's dates - `ShiftTable`'s row-per-staff grid shape. */
export function toStaffViewAssignments(
  windowAssignments: readonly WorkforceShiftAssignment[],
  dates: readonly string[],
  timeZone: string,
): ShiftAssignment[] {
  const displayAssignments: ShiftAssignment[] = [];
  for (const assignment of windowAssignments) {
    if (!assignment.published || !assignment.employeeId) continue;
    const start = utcIsoToLocalDateTime(assignment.startsAt, timeZone);
    if (!dates.includes(start.workDate)) continue;
    displayAssignments.push({
      staffId: assignment.employeeId,
      date: start.workDate,
      shiftTypeId: assignment.shiftTypeId,
    });
  }
  return displayAssignments;
}

function reportTime(value: string, timeZone: string): string {
  return utcIsoToLocalDateTime(value, timeZone).localTime;
}

/** The caller's own completed work reports (has a clock-out), with any matching correction request attached - `ShiftTable`'s "!" attention indicator source. */
export function toStaffViewWorkReports(
  attendance: readonly WorkforceAttendance[],
  requests: readonly WorkforceShiftRequest[],
  ownStaffId: string,
  timeZone: string,
): WorkReport[] {
  const correctionByDate = new Map(
    requests.filter((request) => request.kind === 'correction').map((request) => [request.workDate, request] as const),
  );
  return attendance
    .filter((entry) => Boolean(entry.clockOut))
    .map((entry) => {
      const correction = correctionByDate.get(entry.workDate);
      return {
        staffId: ownStaffId,
        date: entry.workDate,
        plannedLabel: '',
        actualClockIn: entry.clockIn ? reportTime(entry.clockIn, timeZone) : null,
        breakMinutes: entry.actualBreakMinutes ?? 0,
        actualClockOut: entry.clockOut ? reportTime(entry.clockOut, timeZone) : null,
        actualWorkedHours: null,
        transportYen: entry.transportationCost ?? 0,
        message: entry.dailyMessage ?? '',
        hasCorrectionRequest: Boolean(correction),
        correctionRequest: correction
          ? {
              requestedClockIn: typeof correction.details.clockInLocal === 'string' ? correction.details.clockInLocal : undefined,
              requestedClockOut: typeof correction.details.clockOutLocal === 'string' ? correction.details.clockOutLocal : undefined,
              requestedBreakMinutes:
                typeof correction.details.actualBreakMinutes === 'number' ? correction.details.actualBreakMinutes : undefined,
              reason: typeof correction.details.message === 'string' ? correction.details.message : '',
              status: correction.status === 'approved' || correction.status === 'rejected' ? correction.status : 'pending',
            }
          : undefined,
      };
    });
}

/** Cell keys (`${staffId}:${date}`) needing the "!" attention indicator: the caller's own pending correction requests, plus any open/accepted shift exchange on one of the caller's own shifts. */
export function computeStaffAttentionCellKeys(
  requests: readonly WorkforceShiftRequest[],
  exchanges: readonly WorkforceShiftExchange[],
  windowAssignments: readonly WorkforceShiftAssignment[],
  ownStaffId: string,
  timeZone: string,
): Set<string> {
  const attentionCellKeys = new Set<string>();
  for (const request of requests) {
    if (request.status === 'pending' && request.kind === 'correction') {
      attentionCellKeys.add(`${ownStaffId}:${request.workDate}`);
    }
  }
  for (const exchange of exchanges) {
    if (exchange.status !== 'open' && exchange.status !== 'accepted') continue;
    const assignment = windowAssignments.find((item) => item.assignmentId === exchange.shiftId);
    if (assignment) attentionCellKeys.add(`${ownStaffId}:${utcIsoToLocalDateTime(assignment.startsAt, timeZone).workDate}`);
  }
  return attentionCellKeys;
}
