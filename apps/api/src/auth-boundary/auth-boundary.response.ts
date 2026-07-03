import type { AuthBoundaryResult } from './auth-boundary.service.js';

/** Plain, framework-agnostic HTTP shape - no Nest/Express types involved. */
export interface AuthBoundaryHttpResponse {
  status: 200 | 400 | 401 | 403 | 500;
  body: Record<string, unknown>;
}

/**
 * Maps an `AuthBoundaryResult` to the exact safe HTTP status + JSON body.
 *
 * Kept pure and Nest-free so every branch (including the success shape) is
 * unit-testable without a live Supabase instance. This is the single place
 * that decides what leaves the process on this route - it never includes an
 * access/refresh token, email, auth user id, membership id, role internals,
 * permission array, encrypted/hashed value, raw DB row, or raw Supabase
 * error text.
 */
export function mapAuthBoundaryResultToHttpResponse(
  result: AuthBoundaryResult,
  permission: string,
): AuthBoundaryHttpResponse {
  switch (result.status) {
    case 'unauthorized':
      return { status: 401, body: { error: 'unauthorized' } };
    case 'bad_request':
      return { status: 400, body: { error: 'bad_request' } };
    case 'forbidden':
      return { status: 403, body: { error: 'forbidden' } };
    case 'unexpected_error':
      return { status: 500, body: { error: 'unexpected_error' } };
    case 'ok':
      return {
        status: 200,
        body: {
          status: 'ok',
          authenticated: true,
          permissionChecked: true,
          permission,
          tenantId: result.tenantId,
          locationId: result.locationId,
        },
      };
  }
}
