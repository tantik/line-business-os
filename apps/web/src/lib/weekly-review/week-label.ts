import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Pure Monday-Sunday week-range label formatter for the Owner Weekly Review
 * popup (Cafe v2.2 WP3). Follows the same `〜`/`–` range-formatting
 * convention already established by `formatTaskDueWindow`
 * (`apps/web/src/app/(protected)/operations/operations-i18n.ts`): JA always
 * writes both full dates (`9月7日〜9月13日`), EN collapses to a single month
 * name when the week does not cross a calendar-month boundary (`Sep 7–13`),
 * and spells out both months when it does (`Sep 28–Oct 4`). No
 * Supabase/Next.js dependency -- unit-testable with plain ISO date strings,
 * mirroring `workforce/period.ts`'s own convention.
 */
export function formatWeekRangeLabel(lang: Lang, periodStart: string, periodEnd: string): string {
  const [, startMonth, startDay] = periodStart.split('-').map(Number);
  const [, endMonth, endDay] = periodEnd.split('-').map(Number);

  if (lang === 'ja') {
    return `${startMonth}月${startDay}日〜${endMonth}月${endDay}日`;
  }

  const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonthName = EN_MONTHS[(startMonth ?? 1) - 1];
  const endMonthName = EN_MONTHS[(endMonth ?? 1) - 1];
  if (startMonth === endMonth) {
    return `${startMonthName} ${startDay}–${endDay}`;
  }
  return `${startMonthName} ${startDay}–${endMonthName} ${endDay}`;
}
