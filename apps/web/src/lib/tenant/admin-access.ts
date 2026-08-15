import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side gate for the tenant Admin surface (`/dashboard/admin`).
 * `core.member.invite` is the existing permission key that already governs
 * this exact page's one live data read (`api.my_tenant_admin_members`,
 * 0018) in SQL -- see `listTenantAdminMembers`. Only the Owner/Admin system
 * roles hold it (0008 seed); a plain Employee/Staff member never does. This
 * calls the same `api.has_permission` RPC (0019) `hasManagerAccess` already
 * uses for the Manager surface, tenant-wide (no `location_id`): tenant
 * administration is not a per-location concept, matching `core.member.invite`'s
 * own tenant-wide grant shape.
 *
 * A pre-check, not a substitute for RLS: the underlying `api`/`core` objects
 * still enforce their own authorization regardless of this result. Any RPC
 * error (network, config, unexpected shape) fails closed to `false`, never
 * `true`.
 */
export async function hasTenantAdminAccess(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'core.member.invite',
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
