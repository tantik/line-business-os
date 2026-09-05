import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listOperationsTemplateItems, listOperationsTemplates } from '@/lib/operations/templates';
import { listOperationsSchedules } from '@/lib/operations/schedules';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';
import { OperationsManagerClient } from './operations-manager-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Operations', robots: { index: false, follow: false } };

/**
 * Manager Operations Configuration -- Templates & Items only (Cafe v2.2 WP1
 * Operations, first UI slice; see
 * `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` §4).
 * No scheduling UI, no task-execution/Staff UI -- those are separate, later
 * slices, explicitly out of scope here. Reachable only when the tenant's
 * `operations` module is enabled (app-level entitlement check, not the
 * security boundary -- RLS on `api.operations_*` remains the real
 * tenant/location-isolation mechanism regardless) AND the caller is a
 * Manager (`workforce.staff.manage`, the same coarse gate `/purchases` and
 * `/manager` use) -- there is no Staff-facing surface in this slice at all,
 * so a non-manager is redirected to `/staff` rather than shown an empty page.
 */
export default async function OperationsPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const operationsEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) => module.tenantId === activeTenant.tenantId && module.module === 'operations' && module.isEnabled,
        );

      if (!operationsEnabled) return <ModuleUnavailableState />;

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

      // Manager-only for this slice -- there is no Staff-facing Operations UI
      // yet (task execution is a separate, later slice), so a non-manager
      // tenant member is sent to their own dashboard instead of an empty page.
      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);
      if (!managerAccess) redirect('/staff');

      const [templatesResult, itemsResult, schedulesResult] = await Promise.all([
        listOperationsTemplates(supabase, activeTenant.tenantId),
        listOperationsTemplateItems(supabase, activeTenant.tenantId),
        listOperationsSchedules(supabase, activeTenant.tenantId),
      ]);

      return (
        <OperationsManagerClient
          tenantName={activeTenant.tenantName}
          locationName={location.locationName}
          locationId={location.locationId}
          templates={templatesResult.status === 'success' ? templatesResult.data : null}
          items={itemsResult.status === 'success' ? itemsResult.data : null}
          schedules={schedulesResult.status === 'success' ? schedulesResult.data : null}
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
