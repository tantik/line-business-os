import { utcIsoToLocalDateTime } from './timezone';

/** Minimal attendance shape the presence marker needs. */
export interface PresenceAttendanceInput {
  employeeId: string;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
}

/**
 * QA4 F11-A: today's presence of one staff member, for the Manager week
 * grid's today column. `working` = clocked in and not out; `left` = clocked
 * out (shown even without a recorded clock-in, e.g. after a correction).
 * `null` = no attendance today (no marker). Times are `HH:MM` in the
 * location's time zone, the same format every other time on the Manager page
 * uses (`utcIsoToLocalDateTime`).
 */
export type AttendancePresence = { state: 'working'; sinceLocal: string } | { state: 'left'; atLocal: string; sinceLocal: string | null };

export function attendancePresence(
  attendance: readonly PresenceAttendanceInput[],
  employeeId: string,
  todayIso: string,
  timeZone: string,
): AttendancePresence | null {
  const row = attendance.find((a) => a.employeeId === employeeId && a.workDate === todayIso && (a.clockIn || a.clockOut));
  if (!row) return null;
  const sinceLocal = row.clockIn ? utcIsoToLocalDateTime(row.clockIn, timeZone).localTime : null;
  if (row.clockOut) return { state: 'left', atLocal: utcIsoToLocalDateTime(row.clockOut, timeZone).localTime, sinceLocal };
  return { state: 'working', sinceLocal: sinceLocal ?? '' };
}

/** Minimal shift shape for `lateMinutesToday`. */
export interface PresenceShiftInput {
  employeeId: string | null;
  startsAt: string;
  published: boolean;
}

/**
 * QA4 F12: minutes late today, by the same rule as the Weekly Review (0136):
 * the earliest clock-in against the start of that staff member's FIRST
 * published shift whose local date is `todayIso`; late from 1 full minute
 * (`floor`). `null` = not late, no clock-in, or no published shift today.
 */
export function lateMinutesToday(
  attendance: readonly PresenceAttendanceInput[],
  shifts: readonly PresenceShiftInput[],
  employeeId: string,
  todayIso: string,
  timeZone: string,
): number | null {
  const clockIns = attendance
    .filter((a) => a.employeeId === employeeId && a.workDate === todayIso && a.clockIn)
    .map((a) => Date.parse(a.clockIn as string));
  if (clockIns.length === 0) return null;
  const starts = shifts
    .filter((s) => s.employeeId === employeeId && s.published && utcIsoToLocalDateTime(s.startsAt, timeZone).workDate === todayIso)
    .map((s) => Date.parse(s.startsAt));
  if (starts.length === 0) return null;
  const minutes = Math.floor((Math.min(...clockIns) - Math.min(...starts)) / 60000);
  return minutes >= 1 ? minutes : null;
}
