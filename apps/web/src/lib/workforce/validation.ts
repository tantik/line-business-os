/**
 * Shared, framework-agnostic parsing primitives for every workforce Server
 * Action's input validation. No Supabase, no Next.js, no side effects -- kept
 * out of any `'use server'` module so it stays synchronous and unit-testable
 * with plain values/`FormData`, mirroring `auth/credentials.ts` and
 * `tenant/selection.ts`'s existing convention.
 *
 * Every parser is fail-closed: malformed/missing/over-length input returns
 * `null` (or `undefined` for "field not present, leave existing value
 * alone" vs. `null` "explicitly cleared", where a caller needs that
 * distinction), never throws, never guesses.
 */

/** A canonical UUID is 36 chars; reject anything absurdly longer before regex work. */
const MAX_UUID_RAW_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function asString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

/** Canonical UUID shape (8-4-4-4-12 hex), trimmed + lowercased. A syntactically valid UUID is NOT proof of access -- RLS still decides that. */
export function parseUuid(raw: unknown): string | null {
  const value = asString(raw);
  if (value === null || value.length > MAX_UUID_RAW_LENGTH) return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** `YYYY-MM-DD`, and must round-trip through `Date.UTC` (rejects e.g. `2026-02-30`). */
export function parseIsoDate(raw: unknown): string | null {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;

  const parts = trimmed.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  if (asUtc.getUTCFullYear() !== year || asUtc.getUTCMonth() !== month - 1 || asUtc.getUTCDate() !== day) return null;
  return trimmed;
}

/** `HH:MM`, 24h, zero-padded. */
export function parseLocalTime(raw: unknown): string | null {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  return LOCAL_TIME_RE.test(trimmed) ? trimmed : null;
}

/** Non-empty (after trim), length-capped free text. */
export function parseTrimmedString(raw: unknown, maxLength: number): string | null {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Optional length-capped free text, distinguishing "field absent" (`undefined`
 * -- leave the existing value alone on an edit) from "field present but
 * blank" (`null` -- explicitly clear it). Over-length input is rejected
 * (`false`), not silently truncated.
 */
export function parseOptionalTrimmedString(raw: unknown, maxLength: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const value = asString(raw);
  if (value === null) return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return { ok: false };
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

/** HTML checkbox / `FormData` boolean convention: present + one of these values means `true`; anything else (including absent) means `false`. */
export function parseBooleanFlag(raw: unknown): boolean {
  const value = asString(raw);
  if (value === null) return false;
  return ['true', 'on', '1', 'yes'].includes(value.trim().toLowerCase());
}

/** Non-negative integer within a sane bound (guards against absurd client input, not a business limit). */
export function parseNonNegativeInt(raw: unknown, max = 100_000): number | null {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0 || raw > max) return null;
    return raw;
  }
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n <= max ? n : null;
}
