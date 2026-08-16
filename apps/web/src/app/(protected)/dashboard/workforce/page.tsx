import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { WorkforceLandingClient } from './workforce-landing-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Workforce landing page. Reachable only when the tenant's `workforce`
 * module is enabled -- this is an app-level product entitlement check, not
 * the tenant-isolation boundary; RLS on the underlying `api.workforce_*`
 * views remains the real security mechanism regardless of this check.
 *
 * Data fetching and the `canAccessManager` gate stay server-side in this
 * file; all rendering (including the JA/EN `LangProvider`) lives in
 * `WorkforceLandingClient` so a client component can call `useLang()`.
 */
export default async function WorkforceLandingPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const workforceEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) =>
            module.tenantId === activeTenant.tenantId &&
            module.module === 'workforce' &&
            module.isEnabled,
        );

      if (!workforceEnabled) return <ModuleUnavailableState />;

      // Role-aware nav: only offer the Manager card to a caller who can
      // actually use `/manager` -- mirrors that page's
      // own gate (`hasManagerAccess`, `workforce.staff.manage`) and its own
      // location-resolution fallback exactly, so "the card is shown" and
      // "the route would grant access" never disagree. This is a UX
      // affordance only: the Manager route re-runs this same server-side
      // check independently regardless of what this landing page renders,
      // so hiding the card is never the security boundary by itself.
      const locationsResult = await listTenantLocations(supabase);
      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      const managerLocation = tenantLocations.find((l) => l.isActive) ?? tenantLocations[0];
      const canAccessManager = managerLocation
        ? await hasManagerAccess(supabase, activeTenant.tenantId, managerLocation.locationId)
        : false;

      const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);

      return (
        <WorkforceLandingClient
          tenantName={activeTenant.tenantName}
          canAccessManager={canAccessManager}
          profileResult={profileResult}
        />
      );
    }
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
