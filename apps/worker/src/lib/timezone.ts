/**
 * Local wall-clock (workDate + local `HH:MM`) <-> UTC instant conversion for
 * a given IANA time zone, using only `Intl.DateTimeFormat` (no dependency).
 *
 * This is a small, generic date-math utility -- NOT part of the scheduling
 * engine (that lives in `@line-os/workforce`, shared verbatim with
 * `apps/web`). `apps/web/src/lib/workforce/timezone.ts` has the identical
 * implementation; it isn't imported directly here because it sits behind
 * `apps/web`'s own `@/...` path aliases and Next.js build config, which a
 * plain `tsx`-run worker process doesn't resolve. Keep any bugfix here in
 * sync with that file.
 */

const OFFSET_GUESS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = OFFSET_GUESS_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    OFFSET_GUESS_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** Converts a tenant-local wall-clock date+time to the UTC instant it represents in `timeZone`, as an ISO 8601 string. */
export function localDateTimeToUtcIso(workDate: string, localTime: string, timeZone: string): string {
  const dateParts = workDate.split('-').map(Number);
  const timeParts = localTime.split(':').map(Number);
  const year = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 0;
  const day = dateParts[2] ?? 0;
  const hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  const parts = getFormatter(timeZone).formatToParts(new Date(naiveUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const zonedHour = get('hour') === 24 ? 0 : get('hour');
  const zonedAsUtcMs = Date.UTC(get('year'), get('month') - 1, get('day'), zonedHour, get('minute'), get('second'));

  const offsetMs = zonedAsUtcMs - naiveUtcMs;
  return new Date(naiveUtcMs - offsetMs).toISOString();
}

/** Adds `days` calendar days to an ISO date, UTC-anchored (no time-zone drift). */
export function addIsoDays(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Converts a UTC instant (timestamptz value) back to a tenant-local workDate + `HH:MM`. */
export function utcIsoToLocalDateTime(isoInstant: string, timeZone: string): { workDate: string; localTime: string } {
  const parts = getFormatter(timeZone).formatToParts(new Date(isoInstant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const workDate = `${get('year')}-${get('month')}-${get('day')}`;
  const localTime = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
  return { workDate, localTime };
}

/** Today's date as `YYYY-MM-DD` in the given IANA time zone. */
export function todayIsoInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** First/last day (inclusive) of the calendar month immediately AFTER the month containing `todayWorkDate` -- the scheduled monthly job's fixed target period. */
export function nextMonthPeriod(todayWorkDate: string): { periodStart: string; periodEnd: string; monthPrefix: string } {
  const [year, month] = todayWorkDate.split('-').map(Number) as [number, number];
  const nextMonthFirst = new Date(Date.UTC(year, month, 1)); // JS month is 0-based; `month` here is already next month's index
  const y = nextMonthFirst.getUTCFullYear();
  const m = nextMonthFirst.getUTCMonth(); // 0-based
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  return {
    periodStart: `${monthPrefix}-01`,
    periodEnd: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`,
    monthPrefix,
  };
}
