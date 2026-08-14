/**
 * Local wall-clock (workDate + local `HH:MM`) <-> UTC instant conversion for
 * a given IANA time zone, using only `Intl.DateTimeFormat` (no dependency).
 *
 * Needed because `workforce.shifts.starts_at`/`ends_at` are `timestamptz`
 * (concrete instants), while `auto-distribute.ts` (Slice 1B) and the
 * shift-type/shift-request tables it reads from work entirely in
 * tenant-local wall-clock terms (`workDate` + `startsAtLocal`/`endsAtLocal`,
 * no time zone attached). The tenant's location time zone
 * (`api.my_tenant_locations.timezone`, already read by
 * `lib/tenant/locations.ts`) is the caller-supplied zone for every
 * conversion here -- this module has no opinion on which zone to use.
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

/**
 * Converts a tenant-local wall-clock date+time to the UTC instant it
 * represents in `timeZone`, returned as an ISO 8601 string suitable for a
 * `timestamptz` column. Single-pass offset resolution (standard technique):
 * correct for every real-world zone except the literal wall-clock instant of
 * a DST transition, which does not apply to this slice's only target zone
 * (Asia/Tokyo, no DST).
 */
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

/** Adds `days` calendar days to an ISO date, UTC-anchored (no time-zone drift). Used to build an exclusive upper date bound (e.g. `periodEnd + 1 day` at local midnight) for a `starts_at < toIsoExclusive` range filter. */
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

/**
 * Today's date as `YYYY-MM-DD` in the given IANA time zone -- display-only,
 * for highlighting the current row/column in a schedule table. Moved here
 * (Cafe v2.1 canonical Staff consolidation) from the dashboard-scoped
 * `dashboard/workforce/_ui/workforce-theme.ts` so both the canonical
 * dashboard Staff surface and the `_client-preview` reference surface share
 * one implementation instead of the preview surface reaching into a
 * dashboard-page-scoped file.
 */
export function todayIsoInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}
