import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listPurchasesNeeded } from '@/lib/purchases/items';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
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
import { PurchasesDashboardClient } from './purchases-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Purchases', robots: { index: false, follow: false } };

/**
 * Purchases -- a projection/workflow layer over Inventory (0089): the
 * shopping list of items currently at or below their reorder point, with
 * "Bought" as a lightweight acknowledgement that never mutates Inventory's
 * own quantities. Reachable only when the tenant's `inventory` module is
 * enabled (Founder decision, this session: Purchases rides that flag rather
 * than getting its own `core.module_code` value, since it has no data
 * without Inventory) -- app-level entitlement check only, not the security
 * boundary; RLS on `api.purchases_needed`/`purchases.purchase_actions`
 * remains the real tenant/location-isolation mechanism regardless. One
 * shared page for both Manager and Staff, mirroring `/inventory/page.tsx`'s
 * exact redirect-into-the-dashboard-popup pattern.
 */
export default async function PurchasesPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const inventoryEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) => module.tenantId === activeTenant.tenantId && module.module === 'inventory' && module.isEnabled,
        );

      if (!inventoryEnabled) return <ModuleUnavailableState />;

      const locationsResult = await listTenantLocations(supabase);
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
              <h1 style={{ margin: 0 }}>Purchases</h1>
              <Link href="/dashboard" style={{ ...backLink, marginTop: 12 }}>
                Back to dashboard
              </Link>
            </header>
            <section style={{ ...card, marginTop: 16 }}>
              <p style={{ margin: 0, ...mutedText }}>No location is configured for this workspace yet.</p>
            </section>
          </main>
        );
      }

      // Same consolidation as `/inventory/page.tsx`: a Manager or Staff
      // visitor is sent into their own dashboard's Purchases popup instead
      // of this standalone page. A bare deep link/bookmark/QR code still
      // works either way (this page renders directly for anyone with
      // neither role).
      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);
      if (managerAccess) redirect('/manager?popup=purchases');

      const staffProfileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
      if (staffProfileResult.status === 'success' && staffProfileResult.data) redirect('/staff?popup=purchases');

      const itemsResult = await listPurchasesNeeded(supabase, activeTenant.tenantId, location.locationId);

      // "Bought by" only ever resolves to a real display name for managers,
      // reusing the same manager-only decrypted staff directory Inventory's
      // own page uses -- staff never see another employee's name here.
      const staffNameById = new Map<string, string>();
      if (managerAccess) {
        const staffResult = await listWorkforceStaffForManager(supabase, activeTenant.tenantId);
        if (staffResult.status === 'success') {
          for (const entry of staffResult.data) staffNameById.set(entry.staffId, entry.name);
        }
      }

      return (
        <main style={pageStyle(720)}>
          {itemsResult.status === 'success' ? (
            <PurchasesDashboardClient
              tenantName={activeTenant.tenantName}
              locationName={location.locationName}
              locationId={location.locationId}
              locationTimezone={location.timezone}
              items={itemsResult.data}
              staffNameById={Object.fromEntries(staffNameById)}
            />
          ) : (
            <>
              <header>
                <h1 style={{ margin: 0 }}>Purchases</h1>
                <Link href="/dashboard" style={{ ...backLink, marginTop: 12 }}>
                  Back to dashboard
                </Link>
              </header>
              <section style={{ ...card, marginTop: 16 }}>
                <p style={{ margin: 0, ...mutedText }}>Purchases is temporarily unavailable.</p>
              </section>
            </>
          )}
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
