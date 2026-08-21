import { addIsoDays, utcIsoToLocalDateTime } from './timezone';

/**
 * Pure Monday-Sunday week-period helper for the Cafe Workforce manager view
 * (Slice 2A). No Supabase/Next.js -- unit-testable with plain values,
 * mirroring the other workforce lib modules. `weekday` follows the native
 * `Date#getUTCDay()` convention used throughout this package (0 = Sunday .. 6
 * = Saturday), matching `auto-distribute.ts`'s `weekdayOfIsoDate`.
 */

export function mondayOf(workDate: string): string {
  const weekday = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addIsoDays(workDate, -daysSinceMonday);
}

/**
 * How many whole weeks (`weekOffset`, same convention as `getWeekPeriod`)
 * separate the week containing `targetWorkDate` from the week containing
 * `todayWorkDate` -- lets a Manager Attention "View shift" action compute the
 * `?weekOffset=` a schedule conflict actually lives in, instead of the
 * Manager having to manually page through weeks to find it.
 */
export function weekOffsetForWorkDate(todayWorkDate: string, targetWorkDate: string): number {
  const todayMonday = mondayOf(todayWorkDate);
  const targetMonday = mondayOf(targetWorkDate);
  const diffDays = (Date.parse(`${targetMonday}T00:00:00.000Z`) - Date.parse(`${todayMonday}T00:00:00.000Z`)) / (24 * 60 * 60 * 1000);
  return Math.round(diffDays / 7);
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
