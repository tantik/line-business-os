import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Operations', robots: { index: false, follow: false } };

/**
 * Operations -- thin fallback route (popup-conversion restructuring,
 * mirroring `/purchases/page.tsx`'s exact redirect shape): a Manager is
 * redirected into `/manager?popup=operations` (`OperationsManagerPopup`,
 * `_ui/`) and a resolvable Staff member into `/staff?popup=operations`
 * (`OperationsStaffPopup`, `_ui/`) -- both dashboards fetch the same
 * Operations data this page previously fetched and rendered directly.
 *
 * Unlike Purchases, Operations has no third "neither Manager nor Staff"
 * *content* experience -- the whole feature is either Manager Configuration
 * or Staff task execution, gated on `hasManagerAccess`/a resolvable
 * workforce staff profile respectively. A caller who is genuinely neither
 * (no staff profile at all, or a staff profile whose location is
 * unavailable) only ever saw the same short informational message this page
 * already rendered before the popup conversion -- kept here unchanged
 * rather than invented as new real content.
 */
export default async function OperationsPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const [modulesResult, locationsResult] = await Promise.all([
        listTenantModules(supabase),
        listTenantLocations(supabase),
      ]);
      const operationsEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) => module.tenantId === activeTenant.tenantId && module.module === 'operations' && module.isEnabled,
        );

      if (!operationsEnabled) return <ModuleUnavailableState />;

      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      const location =
        tenantLocations.find((l) => l.locationId === activeTenant.locationId) ??
        tenantLocations.find((l) => l.isActive) ??
        tenantLocations[0];

      if (!location) {
        return (
          <main style={pageStyle(720)}>
            <header>
              <h1 style={{ margin: 0 }}>Operations</h1>
              <Link href="/manager" style={{ ...backLink, marginTop: 12 }}>
                Back to Manager
              </Link>
            </header>
            <section style={{ ...card, marginTop: 16 }}>
              <p style={{ margin: 0, ...mutedText }}>No location is configured for this workspace yet.</p>
            </section>
          </main>
        );
      }

      // Same consolidation as `/purchases/page.tsx`: a Manager or Staff
      // visitor is sent into their own dashboard's Operations popup instead
      // of this standalone page. A bare deep link/bookmark/QR code from
      // anyone else falls through to the informational states below.
      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);
      if (managerAccess) redirect('/manager?popup=operations');

      const staffProfileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
      const staffProfile = staffProfileResult.status === 'success' ? staffProfileResult.data : null;
      const staffLocation = staffProfile ? tenantLocations.find((l) => l.locationId === staffProfile.locationId && l.isActive) : null;

      if (staffProfile && staffLocation) redirect('/staff?popup=operations');

      if (!staffProfile) {
        return (
          <main style={pageStyle(720)}>
            <header>
              <h1 style={{ margin: 0 }}>Operations</h1>
              <Link href="/staff" style={{ ...backLink, marginTop: 12 }}>
                Back to Staff
              </Link>
            </header>
            <section style={{ ...card, marginTop: 16 }}>
              <p style={{ margin: 0, ...mutedText }}>
                You do not have a staff profile for this tenant yet. Ask your manager to add you.
              </p>
            </section>
          </main>
        );
      }

      return (
        <main style={pageStyle(720)}>
          <header>
            <h1 style={{ margin: 0 }}>Operations</h1>
            <Link href="/staff" style={{ ...backLink, marginTop: 12 }}>
              Back to Staff
            </Link>
          </header>
          <section style={{ ...card, marginTop: 16 }}>
            <p style={{ margin: 0, ...mutedText }}>Your assigned location is not available. Ask your manager for help.</p>
          </section>
        </main>
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
