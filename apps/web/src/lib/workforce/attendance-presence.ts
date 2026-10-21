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
