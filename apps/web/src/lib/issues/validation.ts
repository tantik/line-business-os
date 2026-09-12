/**
 * Small, framework-agnostic parsing primitives for the Issues & Handover
 * module's Server Actions -- no Supabase, no Next.js, no side effects.
 * Mirrors the shape (not the import) of `@/lib/operations/validation.ts`.
 * Kept local to this module rather than importing across a capability
 * boundary (Issues & Handover is a separate, reusable domain capability).
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

/** Optional length-capped free text: absent/blank both map to `null`. Over-length input is rejected (`undefined`), never truncated. */
export function parseOptionalTrimmedString(raw: unknown, maxLength: number): string | null | undefined {
  const value = asString(raw);
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) return undefined;
  return trimmed.length === 0 ? null : trimmed;
}

/** `issues.issues.kind` (0118): `issue` or `handover` only. */
export type IssueKind = 'issue' | 'handover';

export function parseIssueKind(raw: unknown): IssueKind | null {
  const value = asString(raw);
  if (value === 'issue' || value === 'handover') return value;
  return null;
}

/** `issues.issues.category` (0118): closed vocabulary, optional. */
export type IssueCategory = 'equipment' | 'inventory' | 'cleaning' | 'facility' | 'customer' | 'operations' | 'other';
const ISSUE_CATEGORIES: readonly IssueCategory[] = ['equipment', 'inventory', 'cleaning', 'facility', 'customer', 'operations', 'other'];

/** Optional category; blank means "not set" (`null`), an invalid value is rejected (`undefined`). */
export function parseOptionalIssueCategory(raw: unknown): IssueCategory | null | undefined {
  const value = asString(raw);
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim();
  return (ISSUE_CATEGORIES as readonly string[]).includes(trimmed) ? (trimmed as IssueCategory) : undefined;
}

/** `issues.issues.severity` (0118): meaningful only for `kind='issue'`, optional. */
export type IssueSeverity = 'normal' | 'important';

/** Optional severity; blank means "not set" (`null`), an invalid value is rejected (`undefined`). */
export function parseOptionalIssueSeverity(raw: unknown): IssueSeverity | null | undefined {
  const value = asString(raw);
  if (value === null || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (trimmed === 'normal' || trimmed === 'important') return trimmed;
  return undefined;
}
