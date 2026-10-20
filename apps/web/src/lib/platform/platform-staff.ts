import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side gate for the ORUWA admin console (`/admin/tenants`, Stage 4B-3).
 * Calls `api.is_platform_staff()` (0134) through the request-scoped client, so
 * the answer is the CALLER'S OWN `core.users.is_platform_staff` flag read with
 * their JWT -- never a user id from the request, never a privileged key.
 *
 * A pre-check, not the boundary: the admin read (`api.platform_tenant_provisioning_list`,
 * 0135) re-checks the flag in SQL, and the provision-tenant Edge Function
 * re-checks it from the forwarded JWT before any privileged call. Any error,
 * throw or non-`true` value fails closed to `false`.
 */
export async function isPlatformStaff(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('is_platform_staff');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
