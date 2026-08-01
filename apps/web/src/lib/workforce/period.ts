import { addIsoDays, utcIsoToLocalDateTime } from './timezone';

/**
 * Pure Monday-Sunday week-period helper for the Cafe Workforce manager view
 * (Slice 2A). No Supabase/Next.js -- unit-testable with plain values,
 * mirroring the other workforce lib modules. `weekday` follows the native
 * `Date#getUTCDay()` convention used throughout this package (0 = Sunday .. 6
 * = Saturday), matching `auto-distribute.ts`'s `weekdayOfIsoDate`.
 */

function mondayOf(workDate: string): string {
  const weekday = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addIsoDays(workDate, -daysSinceMonday);
}

/**
 * Returns the Monday-Sunday period for the week containing `nowIso` (an ISO
 * instant, e.g. `new Date().toISOString()`), resolved in `timeZone`, shifted
 * by `weekOffset` whole weeks (0 = current week, 1 = next week, -1 =
 * previous week).
 */
export function getWeekPeriod(
  nowIso: string,
  timeZone: string,
  weekOffset = 0,
): { periodStart: string; periodEnd: string } {
  const today = utcIsoToLocalDateTime(nowIso, timeZone).workDate;
  const periodStart = addIsoDays(mondayOf(today), weekOffset * 7);
  return { periodStart, periodEnd: addIsoDays(periodStart, 6) };
}

/**
 * Returns the inclusive calendar-date window covered by a bounded week
 * navigator. This lets a client-side carousel preload exactly the weeks it
 * can display without reading the tenant's complete assignment history.
 */
export function getWeekOffsetWindow(
  nowIso: string,
  timeZone: string,
  minWeekOffset: number,
  maxWeekOffset: number,
): { periodStart: string; periodEnd: string } {
  if (!Number.isInteger(minWeekOffset) || !Number.isInteger(maxWeekOffset) || minWeekOffset > maxWeekOffset) {
    throw new RangeError('Invalid week offset window.');
  }
  return {
    periodStart: getWeekPeriod(nowIso, timeZone, minWeekOffset).periodStart,
    periodEnd: getWeekPeriod(nowIso, timeZone, maxWeekOffset).periodEnd,
  };
}
