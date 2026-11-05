import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantModules } from '@/lib/tenant/modules';
import { listMyLocations } from '@/lib/tenant/locations';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';

/** Technical shell, not a workspace -- only reached when neither role below applies. */
export const DASHBOARD_PATH = '/dashboard';

/**
 * Where a signed-in member of `tenantId` should land: their role's primary
 * workspace, not the generic `/dashboard` shell every caller was previously
 * sent to regardless of role (Cafe v2.1 QA audit P2-1, 2026-08-17).
 *
 * Manager takes priority over Staff for a caller who is both (mirrors
 * `/manager`'s own `workforce.staff.manage` gate) -- Manager can already see
 * everything `/staff` offers plus more, so it is the more useful landing
 * spot. Falls back to `/dashboard` for a caller with neither role (Founder/
 * platform-operator accounts, or a tenant with `workforce` disabled).
 *
 * Deliberately re-reads live state on every call instead of trusting a
 * claim/cookie -- this only runs once per sign-in, so the extra reads are
 * cheap, and a stale role claim would misroute a demoted/promoted user.
 */
export async function resolvePostLoginPath(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const modulesResult = await listTenantModules(supabase);
  const workforceEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === tenantId && m.module === 'workforce' && m.isEnabled);
  if (!workforceEnabled) return DASHBOARD_PATH;

  // DEBT-139 L2 / DEBT-120 (d): Manager of ANY active store of this cafe ->
  // /manager (which then opens the active store). `api.my_locations` marks
  // `all` / `manage` exactly where the caller holds workforce.staff.manage;
  // the live RPC below re-confirms it at that store (fail closed).
  // Read with THIS client: it runs right after sign-in in the same request,
  // where only the passed client carries the fresh session.
  const myLocations = await listMyLocations(supabase);
  const managed =
    myLocations.status === 'success'
      ? myLocations.data.find((l) => l.tenantId === tenantId && l.isActive && (l.access === 'all' || l.access === 'manage'))
      : undefined;
  if (managed && (await hasManagerAccess(supabase, tenantId, managed.locationId))) return '/manager';

  const profileResult = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (profileResult.status === 'success' && profileResult.data) return '/staff';

  return DASHBOARD_PATH;
}
