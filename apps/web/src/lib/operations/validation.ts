/**
 * Small, framework-agnostic parsing primitives for the Operations
 * Configuration slice's Server Actions -- no Supabase, no Next.js, no side
 * effects, mirroring the shape (not the import) of
 * `@/lib/workforce/validation.ts`. Kept local to this module rather than
 * importing across a capability boundary (Operations is a separate,
 * reusable domain capability from Workforce).
 *
 * Every parser is fail-closed: malformed/missing/over-length input returns
 * `null` (or the documented sentinel), never throws.
 */

const MAX_UUID_RAW_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

/** Canonical UUID shape, trimmed + lowercased. Not proof of access -- RLS/RPC checks still decide that. */
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

/** Optional length-capped free text: absent/blank both map to `null` (this slice never needs to distinguish "absent" from "explicitly cleared"). Over-length input is rejected (`undefined`), never truncated. */
export function parseOptionalTrimmedString(raw: unknown, maxLength: number): string | null | undefined {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed.length === 0 ? null : trimmed;
}

/** HTML checkbox / `FormData` boolean convention. */
export function parseBooleanFlag(raw: unknown): boolean {
  const value = asString(raw);
  if (value === null) return false;
  return ['true', 'on', '1', 'yes'].includes(value.trim().toLowerCase());
}

/** A checklist item's fixed response-type vocabulary (`operations.response_type`, 0100). */
export type OperationsResponseType = 'boolean' | 'numeric' | 'text';

export function parseResponseType(raw: unknown): OperationsResponseType | null {
  const value = asString(raw);
  if (value === 'boolean' || value === 'numeric' || value === 'text') return value;
  return null;
}

/** Optional finite numeric value; blank means "not set" (`null`), an invalid/non-finite value is rejected (`undefined`). */
export function parseOptionalNumeric(raw: unknown): number | null | undefined {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Non-negative integer, defaulting to `0` when absent/blank; an invalid value is rejected (`undefined`). */
export function parseSortOrder(raw: unknown): number | undefined {
  const value = asString(raw);
  if (value === null || value.trim().length === 0) return 0;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) && n <= 100_000 ? n : undefined;
}

/** Optional ISO `YYYY-MM-DD` date; blank means "use the RPC's own default", an invalid value is rejected (`undefined`). */
export function parseOptionalIsoDate(raw: unknown): string | null | undefined {
  const value = asString(raw);
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}
