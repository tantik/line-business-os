import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type {
  MembershipStatus,
  TenantAccessResult,
  TenantKind,
  TenantMembership,
} from './types';

/**
 * Read the current user's ACTIVE tenant memberships through the RLS-scoped
 * authenticated client. Never uses the service-role key; tenant isolation is
 * enforced by the database (RLS), and we additionally constrain to the given
 * `userId` so co-members within shared tenants are not returned.
 *
 * Framework-agnostic (no Next.js imports) and unit-testable with a stubbed
 * client. Returns a typed result for each outcome instead of throwing.
 *
 * NOTE (ADR 0005): the scaffold intentionally adds no `anon`/`authenticated`
 * table GRANTs yet, so a real authenticated read currently returns a
 * permission error (mapped to `unauthorized`). Enabling direct browser reads is
 * a separate, review-gated change (narrow GRANT + RLS tests). This helper is
 * the foundation that such a change will light up — it is not a product feature.
 */
interface TenantRow {
  id: string;
  slug: string;
  name: string;
  kind: TenantKind;
}

interface MembershipRow {
  location_id: string | null;
  status: MembershipStatus;
  tenant: TenantRow | TenantRow[] | null;
}

function firstTenant(tenant: MembershipRow['tenant']): TenantRow | null {
  if (!tenant) return null;
  return Array.isArray(tenant) ? (tenant[0] ?? null) : tenant;
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
  userId: string,
): Promise<TenantAccessResult<TenantMembership[]>> {
  try {
    const { data, error } = await supabase
      .schema('core')
      .from('tenant_memberships')
      .select('location_id, status, tenant:tenants!inner(id, slug, name, kind)')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as MembershipRow[];
    const memberships: TenantMembership[] = [];
    for (const row of rows) {
      const tenant = firstTenant(row.tenant);
      if (!tenant) continue;
      memberships.push({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        tenantKind: tenant.kind,
        locationId: row.location_id,
        status: row.status,
      });
    }

    if (memberships.length === 0) return { status: 'no_membership' };
    return { status: 'success', data: memberships };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading memberships.',
    };
  }
}
