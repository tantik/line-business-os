/**
 * Shared, framework-agnostic parsing primitives for Inventory Server Action
 * input validation. Deliberately self-contained (not imported from
 * `@/lib/workforce/validation`) -- Inventory is a standalone, reusable
 * top-level module (ADR 0010) and should not carry a hard dependency on the
 * Workforce module's internal files, even for generic string/uuid parsing.
 *
 * Every parser is fail-closed: malformed/missing/over-length input returns
 * `null`, never throws, never guesses.
 */

const MAX_UUID_RAW_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVENTORY_UNITS = ['kg', 'g', 'L', 'mL', 'pcs'] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

const NAME_MAX_LENGTH = 120;
/** Sane upper bound on a quantity value -- guards against absurd client input, not a business limit. */
const MAX_QUANTITY = 1_000_000;

function asString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

export function parseUuid(raw: unknown): string | null {
  const value = asString(raw);
  if (value === null || value.length > MAX_UUID_RAW_LENGTH) return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/** Non-empty (after trim), length-capped free text. */
export function parseTrimmedString(raw: unknown, maxLength: number): string | null {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

export function parseItemName(raw: unknown): string | null {
  return parseTrimmedString(raw, NAME_MAX_LENGTH);
}

export function parseInventoryUnit(raw: unknown): InventoryUnit | null {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  return (INVENTORY_UNITS as readonly string[]).includes(trimmed) ? (trimmed as InventoryUnit) : null;
}

/**
 * A non-negative, finite quantity with at most 3 decimal places (matching
 * `numeric(12,3)` in the DB). Rejects NaN/Infinity, negative values,
 * absurdly large values, and anything with more precision than the column
 * can store -- the server never trusts a client-computed shortage, and it
 * never silently rounds a quantity either.
 */
export function parseQuantity(raw: unknown): number | null {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else {
    const value = asString(raw);
    if (value === null) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || !/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
    n = Number(trimmed);
  }
  if (!Number.isFinite(n) || n < 0 || n > MAX_QUANTITY) return null;
  // Guard against float noise producing a 4th decimal place (e.g. 0.1 + 0.2).
  return Math.round(n * 1000) / 1000;
}

/** HTML checkbox / `FormData` boolean convention: present + one of these values means `true`; anything else (including absent) means `false`. */
export function parseBooleanFlag(raw: unknown): boolean {
  const value = asString(raw);
  if (value === null) return false;
  return ['true', 'on', '1', 'yes'].includes(value.trim().toLowerCase());
}

/** Non-negative integer sort order within a sane bound. */
export function parseSortOrder(raw: unknown, max = 100_000): number | null {
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
