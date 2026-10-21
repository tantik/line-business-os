/**
 * Month helpers for attendance reads (QA4 F2 / scale fix). Pure, no I/O.
 *
 * Months are `YYYY-MM` prefixes in the location's local calendar (the same
 * convention `workDate` already uses: a local `YYYY-MM-DD` date, no time
 * zone attached), so a month is simply a `work_date` range filter.
 */

const MONTH_PREFIX_PATTERN = /^(\d{4})-(\d{2})$/;

/** How many months back from the current month the Staff monthly report popup can page (Founder decision F2: up to 12 months back). */
export const STAFF_REPORT_MAX_MONTHS_BACK = 12;

export function isValidMonthPrefix(value: string): boolean {
  const match = MONTH_PREFIX_PATTERN.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/** `YYYY-MM` shifted by `delta` months (negative = earlier). */
export function shiftMonthPrefix(monthPrefix: string, delta: number): string {
  const [year, month] = monthPrefix.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Number of whole months from `from` to `to` (`to - from`), e.g. 2026-08 -> 2026-10 = 2. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0));
}

/** First and last local date of a month (inclusive), for a `work_date` range filter. */
export function monthDateRange(monthPrefix: string): { fromDate: string; toDate: string } {
  const [year, month] = monthPrefix.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year ?? 0, month ?? 1, 0)).getUTCDate();
  return { fromDate: `${monthPrefix}-01`, toDate: `${monthPrefix}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Whether `monthPrefix` may be shown in the Staff monthly report popup: from
 * `STAFF_REPORT_MAX_MONTHS_BACK` months before `currentMonthPrefix` up to the
 * current month (no future months -- there is no attendance yet).
 */
export function isSelectableReportMonth(monthPrefix: string, currentMonthPrefix: string): boolean {
  if (!isValidMonthPrefix(monthPrefix)) return false;
  const back = monthsBetween(monthPrefix, currentMonthPrefix);
  return back >= 0 && back <= STAFF_REPORT_MAX_MONTHS_BACK;
}

/**
 * The `work_date` window the Manager page loads attendance for at page load
 * (scale fix, QA4). Every consumer of the page-level `attendance` prop was
 * checked:
 * - week grid presence marker (F11-A): TODAY only;
 * - "Clock-in without a shift" attention (F11-C): today plus still-open
 *   rows of the last few days;
 * - estimated monthly labour cost: the CURRENT month;
 * - Staff monthly report popup: opens on the current month; other months
 *   are fetched on demand per staff member (`loadStaffMonthAttendance`),
 *   the previous month is kept preloaded so the most common "last month"
 *   check needs no extra call;
 * - correction-requests popup: looks rows up by id -- any referenced row
 *   outside this window is fetched by id separately (page.tsx).
 * The week grid itself shows no other attendance, so week paging (-8..+8
 * weeks, client-side over preloaded shifts) does not depend on this window.
 * The window ends on the last day of the current month (not today) so the
 * current-month totals stay exactly what they were with the unbounded read.
 * Result: the previous and the current month -- at most 62 days of rows per
 * tenant instead of the whole history.
 */
export function managerAttendanceLoadRange(todayIso: string): { fromDate: string; toDate: string } {
  const currentMonth = todayIso.slice(0, 7);
  return { fromDate: `${shiftMonthPrefix(currentMonth, -1)}-01`, toDate: monthDateRange(currentMonth).toDate };
}

/** Whether the page-load window (`managerAttendanceLoadRange`) fully covers `monthPrefix`, i.e. no on-demand fetch is needed. */
export function isMonthCoveredByLoadRange(monthPrefix: string, range: { fromDate: string; toDate: string }): boolean {
  const { fromDate, toDate } = monthDateRange(monthPrefix);
  return fromDate >= range.fromDate && toDate <= range.toDate;
}

/** How many of the most recently decided correction requests keep their "current attendance" line even when the row is older than the page-load window. */
export const DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT = 50;

/**
 * Attendance ids the Manager corrections popup needs to show: every pending
 * request's row plus the `DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT` most
 * recently decided ones (bounded, so the by-id read never grows with the
 * tenant's history). Older decided rows fall back to the requested-change
 * text the popup already shows for a missing row.
 */
export function correctionAttendanceIdsToShow(
  requests: readonly { attendanceId: string | null; status: string; updatedAt: string }[],
): string[] {
  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, DECIDED_CORRECTION_ATTENDANCE_LOOKUP_LIMIT);
  const ids = new Set<string>();
  for (const r of [...pending, ...decided]) if (r.attendanceId) ids.add(r.attendanceId);
  return [...ids];
}

/** Visible month label: 「2026年9月」 / "September 2026". */
export function formatMonthLabel(monthPrefix: string, lang: 'ja' | 'en'): string {
  const [year, month] = monthPrefix.split('-').map(Number);
  if (lang === 'ja') return `${year}年${month}月`;
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}
