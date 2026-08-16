/**
 * LOCAL/DEV-ONLY SMOKE HELPER (Phase 1J-1H) - pure core.
 *
 * Framework-agnostic (no Next.js imports, no `server-only`) so it is
 * unit-testable without a live Supabase/apps-api instance, mirroring the
 * controller/service split in
 * apps/api/src/auth-boundary/auth-boundary.service.ts. The real caller
 * (`./auth-boundary-smoke.ts`) is the `server-only`-guarded wrapper that wires
 * the actual session/fetch/env providers; nothing here reads environment
 * variables or touches Supabase directly.
 *
 * Never returns a token, email, user id, role internals, permission array,
 * raw API error body, or stack trace - only a status plus the tenant/location
 * ids and permission key the caller already supplied/knows.
 */

/** The single hardcoded permission this spike checks (mirrors apps/api). */
export const AUTH_BOUNDARY_SMOKE_PERMISSION = 'core.audit.read';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical UUID is 36 chars; reject anything absurdly longer before regex work. */
const MAX_RAW_LENGTH = 64;

function isUuidShaped(value: string): boolean {
  if (value.length === 0 || value.length > MAX_RAW_LENGTH) return false;
  return UUID_RE.test(value.trim());
}

export type AuthBoundarySmokeResult =
  | { status: 'config_missing' }
  | { status: 'unauthenticated' }
  | { status: 'bad_request' }
  | { status: 'forbidden' }
  | { status: 'unexpected_error' }
  | { status: 'ok'; permission: string; tenantId: string; locationId: string | null };

export interface AuthBoundarySmokeInput {
  tenantId: string;
  locationId?: string | null;
}

export interface AuthBoundarySmokeDeps {
  /** Resolves the current Supabase access token, or `null` if unauthenticated. */
  getAccessToken: () => Promise<string | null>;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl: typeof fetch;
  /** Server-only apps/api base URL (`LINE_OS_API_INTERNAL_URL`); `undefined` if unset. */
  apiBaseUrl: string | undefined;
}

/**
 * Evaluates one auth-boundary smoke call end to end: validates input shape,
 * resolves the access token, calls apps/api, and maps the response to a safe
 * discriminated result.
 */
export async function evaluateAuthBoundarySmoke(
  input: AuthBoundarySmokeInput,
  deps: AuthBoundarySmokeDeps,
): Promise<AuthBoundarySmokeResult> {
  if (!deps.apiBaseUrl) return { status: 'config_missing' };

  if (!isUuidShaped(input.tenantId)) return { status: 'bad_request' };

  const rawLocationId = input.locationId;
  const hasLocationId = rawLocationId !== null && rawLocationId !== undefined && rawLocationId !== '';
  if (hasLocationId && !isUuidShaped(rawLocationId)) return { status: 'bad_request' };

  const token = await deps.getAccessToken();
  if (!token) return { status: 'unauthenticated' };

  let url: URL;
  try {
    url = new URL('/auth-boundary/test', deps.apiBaseUrl);
  } catch {
    // Malformed LINE_OS_API_INTERNAL_URL - a configuration problem, not a
    // request/network one, so never surface it to the caller as unexpected_error.
    return { status: 'config_missing' };
  }
  url.searchParams.set('tenant_id', input.tenantId);
  if (hasLocationId) url.searchParams.set('location_id', rawLocationId);

  let response: Response;
  try {
    response = await deps.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Network/connection failure to apps/api - never leak the raw error.
    return { status: 'unexpected_error' };
  }

  if (response.status === 401) return { status: 'unauthenticated' };
  if (response.status === 400) return { status: 'bad_request' };
  if (response.status === 403) return { status: 'forbidden' };
  if (response.status !== 200) return { status: 'unexpected_error' };

  const locationId = hasLocationId ? rawLocationId : null;
  return { status: 'ok', permission: AUTH_BOUNDARY_SMOKE_PERMISSION, tenantId: input.tenantId, locationId };
}
