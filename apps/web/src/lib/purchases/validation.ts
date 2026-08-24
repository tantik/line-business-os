/**
 * Shared, framework-agnostic parsing primitives for Purchases Server Action
 * input validation. Deliberately self-contained (not imported from
 * `@/lib/inventory/validation`) -- Purchases is a standalone, reusable
 * top-level module (mirrors ADR 0010's reasoning for Inventory) and should
 * not carry a hard dependency on another module's internal files, even for
 * generic uuid parsing.
 *
 * Fail-closed: malformed/missing input returns `null`, never throws.
 */

const MAX_UUID_RAW_LENGTH = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw : null;
  if (value === null || value.length > MAX_UUID_RAW_LENGTH) return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
