import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { hasInventoryPermission, listInventoryItemStatus } from '@/lib/inventory/items';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';
import { InventoryDashboardClient } from './inventory-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inventory', robots: { index: false, follow: false } };

/**
 * Inventory / Daily Stock Check -- first capability of the reusable,
 * standalone `inventory` top-level module (ADR 0010). Reachable only when
 * the tenant's `inventory` module is enabled (app-level entitlement check,
 * not the security boundary -- RLS on the underlying `api.inventory_*` views
 * remains the real tenant/location-isolation mechanism regardless of this
 * check). One shared page for both Manager and Staff: catalog management
 * controls only render when `canManage` is true (a UX affordance -- RLS is
 * what actually blocks the write either way).
 *
 * MVP is intentionally single-location: the caller's own tenant-membership
 * location (or the tenant's first active location as a fallback) is used,
 * matching the same pattern as the Workforce staff dashboard page. A
 * location switcher is out of this slice's scope.
 */
export default async function InventoryPage() {
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
          <main style={pageStyle(880)}>
            <header>
              <h1 style={{ margin: 0 }}>Inventory</h1>
              <Link href="/dashboard" style={{ ...backLink, marginTop: 12 }}>
                Back to dashboard
              </Link>
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>No location is configured for this workspace yet.</p>
            </section>
          </main>
        );
      }

      // Manager-role visitors (same gate as `/manager` itself) are sent into
      // the Manager dashboard's Inventory popup (WP A5a) instead of this
      // standalone page -- consolidates their entry point without touching
      // Staff's experience: `/inventory` remains this exact page,
      // unchanged, for anyone `hasManagerAccess` returns false for. A bare
      // deep link/bookmark/QR code still works either way.
      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);
      if (managerAccess) redirect('/manager?popup=inventory');

      const [itemsResult, canManage] = await Promise.all([
        listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId),
        hasInventoryPermission(supabase, activeTenant.tenantId, 'inventory.item.manage', location.locationId),
      ]);

      // "Who last counted this" is only ever resolved to a real display name
      // for managers, reusing the exact same manager-only decrypted staff
      // directory the Workforce staff-management screen uses
      // (`listWorkforceStaffForManager`, gated by `workforce.staff.read`/
      // `workforce.staff.manage` RLS) -- never a new PII exposure surface.
      // Staff never see another employee's name here, matching the existing
      // Cafe Package visibility policy (staff hold neither permission, and
      // `api.workforce_my_staff_profile` doesn't expose a name even for
      // themselves) -- for staff this map is simply left empty and the UI
      // falls back to a generic "Unknown staff" label.
      const staffNameById = new Map<string, string>();
      if (canManage) {
        const staffResult = await listWorkforceStaffForManager(supabase, activeTenant.tenantId);
        if (staffResult.status === 'success') {
          for (const entry of staffResult.data) staffNameById.set(entry.staffId, entry.name);
        }
      }

      return (
        <main style={pageStyle(880)}>
          {itemsResult.status === 'success' ? (
            <InventoryDashboardClient
              tenantName={activeTenant.tenantName}
              locationName={location.locationName}
              locationId={location.locationId}
              locationTimezone={location.timezone}
              items={itemsResult.data}
              canManage={canManage}
              staffNameById={Object.fromEntries(staffNameById)}
            />
          ) : (
            <>
              <header>
                <h1 style={{ margin: 0 }}>Inventory</h1>
                <Link href="/dashboard" style={{ ...backLink, marginTop: 12 }}>
                  Back to dashboard
                </Link>
              </header>
              <section style={card}>
                <p style={{ margin: 0, ...mutedText }}>Inventory is temporarily unavailable.</p>
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
