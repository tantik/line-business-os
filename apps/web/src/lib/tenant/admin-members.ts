import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { MembershipStatus, TenantAccessResult, TenantKind } from './types';

/** Flat row shape returned by `api.my_tenant_admin_members`. */
interface ApiTenantAdminMemberRow {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_kind: TenantKind;
  location_id: string | null;
  membership_status: MembershipStatus;
}

export interface TenantAdminMember {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantKind: TenantKind;
  locationId: string | null;
  membershipStatus: MembershipStatus;
}

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read tenant admin members.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function compareTenantAdminMembers(a: TenantAdminMember, b: TenantAdminMember): number {
  const byTenant = a.tenantId.localeCompare(b.tenantId);
  if (byTenant !== 0) return byTenant;

  const byLocation = (a.locationId ?? '').localeCompare(b.locationId ?? '');
  if (byLocation !== 0) return byLocation;

  return a.membershipStatus.localeCompare(b.membershipStatus);
}

/**
 * Read manager/admin-scoped tenant membership rows through the app-facing API
 * facade. The view enforces active caller membership plus core.member.invite in
 * SQL; this helper accepts no tenant id and adds no client-side tenant filter.
 */
export async function listTenantAdminMembers(
  supabase: SupabaseClient,
): Promise<TenantAccessResult<TenantAdminMember[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_tenant_admin_members')
      .select('tenant_id, tenant_slug, tenant_name, tenant_kind, location_id, membership_status');

    if (error) return mapPostgrestError(error);

    const rows = (data ?? []) as ApiTenantAdminMemberRow[];
    const members = rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      tenantKind: row.tenant_kind,
      locationId: row.location_id,
      membershipStatus: row.membership_status,
    }));

    members.sort(compareTenantAdminMembers);
    return { status: 'success', data: members };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading tenant admin members.',
    };
  }
}
