/** Date/number formatting helpers for the Mirawi Cafe Demo. Demo-only, no i18n library. */

export const WEEKDAY_LABELS_MON_FIRST = ['月', '火', '水', '木', '金', '土', '日'] as const;
export const WEEKDAY_LABELS_EN_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** 0 = 月, 6 = 日 (JS getDay() is 0 = Sun, so shift it). */
export function weekdayIndexMonFirst(date: Date): number {
  const jsDay = date.getDay();
  return (jsDay + 6) % 7;
}

export function weekdayLabel(date: Date, lang: 'ja' | 'en' = 'ja'): string {
  const labels = lang === 'en' ? WEEKDAY_LABELS_EN_MON_FIRST : WEEKDAY_LABELS_MON_FIRST;
  return labels[weekdayIndexMonFirst(date)]!;
}

export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatMonthDayWeekday(date: Date, lang: 'ja' | 'en' = 'ja'): string {
  return `${formatMonthDay(date)}(${weekdayLabel(date, lang)})`;
}

export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

export function isSameDate(a: string, b: string): boolean {
  return a === b;
}

/** "HH:MM" label for a clock-in/out timestamp, matching the seeded demo data's time format. */
export function formatClockLabel(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
