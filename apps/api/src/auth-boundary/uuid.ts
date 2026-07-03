/**
 * Pure, framework-agnostic UUID param validation for the auth-boundary spike.
 *
 * `tenant_id`/`location_id` arrive as caller-supplied query params and must
 * never be trusted as authorization on their own (see
 * docs/phase-1j-1e-api-facade-permission-resolution-design.md,
 * "Tenant/location verification rules") - this only validates their SHAPE so
 * a malformed value fails fast with 400 before reaching the database. The
 * actual authorization check happens in api.has_permission.
 */

/** Canonical UUID is 36 chars; reject anything absurdly longer before regex work. */
const MAX_RAW_LENGTH = 64;

/** Canonical UUID shape (8-4-4-4-12 hex). Anchored and case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a raw query param into a canonical, lowercase UUID string, or
 * `null` if it is missing, empty, over-length, or not UUID-shaped.
 */
export function parseUuidParam(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw.length > MAX_RAW_LENGTH) return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!UUID_RE.test(trimmed)) return null;

  return trimmed.toLowerCase();
}
