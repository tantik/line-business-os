import type { createUserClient } from '@line-os/db/client';
import { parseBearerToken } from './bearer-token.js';
import { parseUuidParam } from './uuid.js';

/**
 * Framework-agnostic core of the `/auth-boundary/test` spike (Phase 1J-1G).
 *
 * Proves the identity/authorization chain apps/api needs for future
 * Workforce/PII routes, using only the caller's own verified, RLS-scoped
 * identity - no service-role client, no reads of the internal core/audit
 * schemas:
 *
 *   1. Parse `Authorization: Bearer <token>`.
 *   2. Verify the token via `createUserClient(token).auth.getUser()`.
 *   3. Validate the caller-supplied tenant_id/location_id SHAPE only (never
 *      trusted as authorization - see docs/phase-1j-1e-...-design.md).
 *   4. Check the hardcoded permission via the `api.has_permission` RPC,
 *      which is the actual authorization decision (verified server-side
 *      against the caller's own role_assignments).
 *
 * Kept free of any Nest/HTTP imports so it is unit-testable with a stubbed
 * client factory, per this repo's existing pattern (e.g.
 * apps/web/src/lib/auth/user.ts, apps/web/src/lib/tenant/admin-members.ts).
 */

/** Client factory shape - matches `createUserClient` from `@line-os/db/client`. */
type CreateUserClient = typeof createUserClient;
type UserClient = ReturnType<CreateUserClient>;

export type AuthBoundaryResult =
  | { status: 'unauthorized' }
  | { status: 'bad_request'; field: 'tenant_id' | 'location_id' }
  | { status: 'forbidden' }
  | { status: 'unexpected_error' }
  | { status: 'ok'; tenantId: string; locationId: string | null };

export interface AuthBoundaryRequestInput {
  authorizationHeader: string | null | undefined;
  tenantIdParam: string | null | undefined;
  locationIdParam: string | null | undefined;
}

/**
 * Evaluates one auth-boundary test request. `permission` is always supplied
 * by the caller (the controller) as a hardcoded literal - this function
 * never reads a permission key from request input.
 */
export async function evaluateAuthBoundaryRequest(
  request: AuthBoundaryRequestInput,
  permission: string,
  createClient: CreateUserClient,
): Promise<AuthBoundaryResult> {
  const token = parseBearerToken(request.authorizationHeader);
  if (!token) return { status: 'unauthorized' };

  try {
    const client: UserClient = createClient(token);

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) return { status: 'unauthorized' };

    const tenantId = parseUuidParam(request.tenantIdParam);
    if (!tenantId) return { status: 'bad_request', field: 'tenant_id' };

    let locationId: string | null = null;
    if (
      request.locationIdParam !== null &&
      request.locationIdParam !== undefined &&
      request.locationIdParam !== ''
    ) {
      locationId = parseUuidParam(request.locationIdParam);
      if (!locationId) return { status: 'bad_request', field: 'location_id' };
    }

    const { data: allowed, error: rpcError } = await client.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: permission,
      p_location_id: locationId,
    });

    if (rpcError) {
      // Logged server-side only; never forwarded to the client (no raw
      // Supabase/Postgres error text in the response body).
      console.error('[auth-boundary] has_permission RPC error:', rpcError.message);
      return { status: 'unexpected_error' };
    }

    if (allowed !== true) return { status: 'forbidden' };

    return { status: 'ok', tenantId, locationId };
  } catch (err) {
    console.error('[auth-boundary] unexpected error:', err instanceof Error ? err.message : err);
    return { status: 'unexpected_error' };
  }
}
