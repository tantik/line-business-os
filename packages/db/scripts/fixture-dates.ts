/**
 * Pure date/timezone helpers for fixture tooling (e.g.
 * `oruwa-cafe-fixture-write.ts`). No I/O, no database, no Cloud.
 *
 * Uses the same "format-then-diff" technique the web app's
 * `apps/web/src/lib/workforce/timezone.ts` uses for the same problem (that
 * module cannot be imported from this package -- `apps/web` depends on
 * `@line-os/db`, not the reverse -- so this is a small, independent,
 * equivalently-correct implementation, not a divergent one).
 */

/**
 * Convert a local wall-clock date + time in `timeZone` to a UTC ISO instant.
 * Correct for both fixed-offset zones (e.g. Asia/Tokyo) and DST-observing
 * zones, via the standard "guess as UTC, measure the zone's actual offset at
 * that instant via Intl, then correct" technique.
 */
export function localDateTimeToUtcIso(dateIso: string, timeLocal: string, timeZone: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = timeLocal.split(':').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error('Invalid date or time format.');
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(utcGuess)).map((p) => [p.type, p.value]));

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const offsetMs = asIfUtc - utcGuess;
  return new Date(utcGuess - offsetMs).toISOString();
}
