import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
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
 * platform-operator accounts, or a tenant with `workforce` disabled), and
 * fails closed (same as `/manager`'s own LOC-1 check) rather than guessing a
 * location when a tenant has zero or more than one active location.
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

  const locationsResult = await listTenantLocations(supabase);
  const activeLocations =
    locationsResult.status === 'success' ? locationsResult.data.filter((l) => l.tenantId === tenantId && l.isActive) : [];

  const soleActiveLocation = activeLocations.length === 1 ? activeLocations[0] : undefined;
  if (soleActiveLocation) {
    const managerAccess = await hasManagerAccess(supabase, tenantId, soleActiveLocation.locationId);
    if (managerAccess) return '/manager';
  }

  const profileResult = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (profileResult.status === 'success' && profileResult.data) return '/staff';

  return DASHBOARD_PATH;
}
