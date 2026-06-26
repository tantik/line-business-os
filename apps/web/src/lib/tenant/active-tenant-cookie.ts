/**
 * Active-tenant cookie: pure, framework-agnostic helpers.
 *
 * This module is intentionally free of `next/headers` and `server-only` so it
 * can be unit-tested in isolation and imported from anywhere. It NEVER reads,
 * writes, or deletes cookies - it only defines the cookie name and validates a
 * raw cookie value into a trustworthy candidate tenant id (or `null`).
 *
 * The parsed value is a CANDIDATE/HINT only. Membership is the source of truth:
 * callers must always revalidate the returned id against the authenticated
 * user's live memberships before honoring it (see `selectActiveTenant`'s
 * `candidateTenantId`). A syntactically valid UUID here does NOT imply the user
 * may access that tenant.
 */

/** Cookie name for the user's last-selected active tenant id. */
export const ACTIVE_TENANT_COOKIE = 'lbo_active_tenant_id';

/**
 * Upper bound on accepted raw input length. A canonical UUID is 36 chars; we
 * allow a small margin for surrounding whitespace and reject anything longer to
 * avoid doing regex work on absurdly large attacker-controlled cookie values.
 */
const MAX_RAW_LENGTH = 64;

/**
 * Canonical UUID shape (8-4-4-4-12 hex). Anchored and case-insensitive; the
 * accepted value is normalized to lowercase by the parser.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a raw cookie value into a candidate tenant id, or `null`.
 *
 * Behavior (fail-closed):
 *   - `undefined` / `null` -> `null`
 *   - empty / whitespace-only -> `null`
 *   - over-length input -> `null`
 *   - surrounding whitespace is trimmed
 *   - only canonical UUID-shaped ids are accepted
 *   - accepted ids are normalized to lowercase
 *   - any other (garbage / non-UUID) value -> `null`
 *
 * The result is still only a HINT; revalidate it against live memberships.
 */
export function parseActiveTenantCookieValue(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw.length > MAX_RAW_LENGTH) return null;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!UUID_RE.test(trimmed)) return null;

  return trimmed.toLowerCase();
}

/** Cookie options applied when writing the active-tenant cookie. */
export interface ActiveTenantCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
}

/**
 * Pure factory for the active-tenant cookie write options.
 *
 * Kept here (framework-agnostic, no `next/headers`) so the security-relevant
 * flags are unit-testable without a request context. The cookie is a hint only
 * and carries no sensitive data, but it is still scoped fail-safe:
 *   - `httpOnly` so client JS can never read/forge it,
 *   - `sameSite: 'lax'` to limit cross-site submission,
 *   - `secure` in production (HTTPS-only),
 *   - `path: '/'` so it applies to the whole app.
 */
export function buildActiveTenantCookieOptions(isProduction: boolean): ActiveTenantCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  };
}
