import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side gate for the Manager operational surface
 * (`/manager`). `workforce.staff.manage` is the existing
 * permission key that already governs every other Manager-only
 * administrative capability in this module -- the staff directory
 * (`api.workforce_staff_directory`, 0023), LINE link management (0029), and
 * employee invitations (0064) are all gated on it, and only the Owner/Admin/
 * Manager system roles hold it (0008/0020 seed) -- Employee never does. This
 * calls the same `api.has_permission` RPC (0019) the B2a manager write
 * sequence already uses (`resolvePreviewManagerContext`'s
 * `checkManagerPermission`), tenant + location scoped exactly like every
 * other Manager permission check, so Owner/Admin's tenant-wide grant
 * (`location_id is null`) and a location-scoped Manager assignment both
 * resolve correctly and multi-location scoping is unaffected.
 *
 * A pre-check, not a substitute for RLS: the underlying `workforce.*` tables
 * still enforce their own policies regardless of this result. Any RPC error
 * (network, config, unexpected shape) fails closed to `false`, never `true`.
 */
export async function hasManagerAccess(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'workforce.staff.manage',
      p_location_id: locationId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
