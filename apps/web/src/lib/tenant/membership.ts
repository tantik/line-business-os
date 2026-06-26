import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type {
  MembershipStatus,
  TenantAccessResult,
  TenantKind,
  TenantMembership,
} from './types';
import { compareTenantMemberships } from './select';

/**
 * Read the current user's ACTIVE tenant memberships through the RLS-scoped
 * authenticated client. Never uses the service-role key; tenant isolation is
 * enforced by the database (RLS).
 *
 * Framework-agnostic (no Next.js imports) and unit-testable with a stubbed
 * client. Returns a typed result for each outcome instead of throwing.
 *
 * NOTE (ADR 0006 -> ADR 0008): Phase 1E-3 moves this read off raw `core` and onto
 * the app-facing `api` facade. The app now selects from the security-invoker view
 * `api.my_tenant_memberships`, which is ALREADY self-scoped server-side to
 * `core.current_user_id()` and `status = 'active'` (the view's own WHERE clause)
 * AND still enforced by the underlying core RLS (`memberships_select_self`,
 * `tenants_select`). Raw `core` is no longer exposed to the Data API. A
 * missing/over-restricted grant still maps to `unauthorized` (fail-closed). This
 * helper is foundation plumbing, not a product feature.
 */

/** Flat row shape returned by `api.my_tenant_memberships`. */
interface ApiMembershipRow {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_kind: TenantKind;
  location_id: string | null;
  status: MembershipStatus;
}

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read tenant membership.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

export async function listTenantMemberships(
  supabase: SupabaseClient,
  // `userId` is retained for interface stability even though it is no longer sent
  // to PostgREST: `api.my_tenant_memberships` is already self-scoped to the
  // current authenticated user (and active memberships) in the view + core RLS.
  userId: string,
): Promise<TenantAccessResult<TenantMembership[]>> {
  void userId;
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_tenant_memberships')
      .select('tenant_id, tenant_slug, tenant_name, tenant_kind, location_id, status');

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as ApiMembershipRow[];
    const memberships: TenantMembership[] = rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      tenantKind: row.tenant_kind,
      locationId: row.location_id,
      status: row.status,
    }));

    if (memberships.length === 0) return { status: 'no_membership' };
    // Return a deterministic order (shared comparator) so the default active
    // tenant and any future membership list are stable, not DB-order dependent.
    memberships.sort(compareTenantMemberships);
    return { status: 'success', data: memberships };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading memberships.',
    };
  }
}
