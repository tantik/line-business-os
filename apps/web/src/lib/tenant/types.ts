/**
 * App-layer tenant access types.
 *
 * Tenant context is ALWAYS derived from the authenticated user's membership
 * (never from request body/query/headers), consistent with
 * `packages/core/src/tenant-context.ts`. The app layer reads it through the
 * RLS-scoped authenticated Supabase client — it does not use the service-role
 * key and does not bypass RLS.
 */

/**
 * Tenant kind, mirrored from `core.tenant_kind` (and `@line-os/db/types`). It is
 * redefined here so the web foundation does not need to depend on the
 * server-oriented `@line-os/db` package just for a string-literal type.
 */
export type TenantKind = 'demo' | 'client_template' | 'client';

/** Active membership status, mirrored from `core.membership_status`. */
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';

/** A tenant the current user belongs to, plus the membership scope. */
export interface TenantMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantKind: TenantKind;
  /** Optional default location scope for location-bound staff. */
  locationId: string | null;
  status: MembershipStatus;
}

/** The resolved active tenant context for the authenticated user. */
export interface ActiveTenantContext {
  userId: string;
  activeTenant: TenantMembership;
  memberships: TenantMembership[];
}

/**
 * Discriminated result for every tenant access helper. Callers switch on
 * `status` to render the matching safe UI state. No helper throws for an
 * expected access outcome.
 */
export type TenantAccessStatus =
  | 'success'
  | 'not_authenticated'
  | 'no_membership'
  | 'unauthorized'
  | 'config_error'
  | 'unexpected_error';

export type TenantAccessResult<T> =
  | { status: 'success'; data: T }
  | { status: 'not_authenticated' }
  | { status: 'no_membership' }
  | { status: 'unauthorized'; message: string }
  | { status: 'config_error'; message: string }
  | { status: 'unexpected_error'; message: string };
