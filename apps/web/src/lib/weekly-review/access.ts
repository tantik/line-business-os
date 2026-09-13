import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side gate for the Owner Weekly Review entry point/popup on the
 * Manager dashboard (Cafe v2.2 WP3). `core.weekly_review.view` (migration
 * 0119) is granted only to the Owner/Admin/Manager system roles -- Employee
 * and Client never hold it. Mirrors `hasManagerAccess`/`hasTenantAdminAccess`
 * exactly: the same `api.has_permission` RPC (0019), location-scoped like
 * every other Manager-surface permission check.
 *
 * A pre-check, not a substitute for RLS/RPC-side authorization:
 * `api.weekly_review_summary` (0119) re-checks this same permission itself.
 * Any RPC error (network, config, unexpected shape) fails closed to `false`,
 * never `true`.
 */
export async function hasWeeklyReviewAccess(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'core.weekly_review.view',
      p_location_id: locationId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
