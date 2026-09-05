import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listOperationsTemplateItems, listOperationsTemplates } from '@/lib/operations/templates';
import { listOperationsSchedules } from '@/lib/operations/schedules';
import { listExpectedTasks, listItemResponses, type OperationsItemResponse } from '@/lib/operations/tasks';
import { listOpenOperationsExceptions } from '@/lib/operations/exceptions';
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
import { OperationsManagerClient } from './operations-manager-client';
import { StaffOperationsClient } from './staff-operations-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Operations', robots: { index: false, follow: false } };

/**
 * Extracts a human-readable message from a failed `TenantAccessResult`, or
 * `null` on success. Used so a genuine read failure (e.g. an undeployed view,
 * an RLS/permission error) can be shown to the Manager distinctly from a
 * legitimate empty result -- the two used to collapse into the same
 * `null`/`[]` shape downstream (`schedules`/`items` in particular fed
 * `template-detail-modal.tsx`'s "No schedule yet"/"No items yet" text even
 * when the underlying read had actually errored, per live QA 2026-09-05).
 * `no_membership`/`not_authenticated` carry no `message` of their own (and
 * are not realistically reachable here -- `requireTenantContext` already
 * resolved to `success` above -- but are handled for exhaustiveness).
 */
function readErrorMessage(result: { status: string; message?: string }): string | null {
  if (result.status === 'success') return null;
  return result.message ?? 'Unexpected error.';
}

/**
 * Operations -- Manager Configuration (Templates/Items/Scheduling, first two
 * UI slices) and Staff task execution (third UI slice; see
 * `docs/product/cafe-package-v2-2-wp1-operations-scope-2026-08-28.md` §4-§5).
 * Reachable only when the tenant's `operations` module is enabled
 * (app-level entitlement check, not the security boundary -- RLS on
 * `api.operations_*` remains the real tenant/location-isolation mechanism
 * regardless). A Manager (`workforce.staff.manage`, the same coarse gate
 * `/purchases` and `/manager` use) sees the Configuration UI, completely
 * unchanged from earlier slices; any other tenant member with a workforce
 * staff profile sees today's expected tasks at their own location instead.
 * The Manager Configuration UI also includes a read-only "Today" overview
 * (today's expected tasks at the Manager's own location) and an "Attention"
 * feed (open Operations exceptions, resolvable from here) -- fourth UI
 * slice. Photo evidence and a Staff history view remain out of scope.
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

      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);

      if (managerAccess) {
        const managerToday = new Date().toISOString().slice(0, 10);
        const [templatesResult, itemsResult, schedulesResult, managerTasksResult, openExceptionsResult] = await Promise.all([
          listOperationsTemplates(supabase, activeTenant.tenantId),
          listOperationsTemplateItems(supabase, activeTenant.tenantId),
          listOperationsSchedules(supabase, activeTenant.tenantId),
          listExpectedTasks(supabase, activeTenant.tenantId, managerToday),
          listOpenOperationsExceptions(supabase, activeTenant.tenantId),
        ]);
        // `operations.task.read` may be tenant-wide for some roles -- narrow
        // to this Manager's own location here, same convention as the Staff
        // branch below.
        const managerTodayTasks =
          managerTasksResult.status === 'success'
            ? managerTasksResult.data.filter((task) => task.locationId === location.locationId)
            : null;
        const managerOpenExceptions =
          openExceptionsResult.status === 'success'
            ? openExceptionsResult.data.filter((exception) => exception.locationId === location.locationId)
            : null;

        return (
          <OperationsManagerClient
            tenantName={activeTenant.tenantName}
            locationName={location.locationName}
            locationId={location.locationId}
            templates={templatesResult.status === 'success' ? templatesResult.data : null}
            items={itemsResult.status === 'success' ? itemsResult.data : null}
            itemsError={readErrorMessage(itemsResult)}
            schedules={schedulesResult.status === 'success' ? schedulesResult.data : null}
            schedulesError={readErrorMessage(schedulesResult)}
            todayTasks={managerTodayTasks}
            openExceptions={managerOpenExceptions}
          />
        );
      }

      // Not a Manager: resolve the caller's own workforce staff profile the
      // same way `/staff` and `/purchases` do, rather than building a
      // location picker -- a Staff member only ever sees their own
      // location's tasks here.
      const staffProfileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
      const staffProfile = staffProfileResult.status === 'success' ? staffProfileResult.data : null;
      const staffLocation = staffProfile ? tenantLocations.find((l) => l.locationId === staffProfile.locationId && l.isActive) : null;

      if (!staffProfile || !staffLocation) {
        // Neither a Manager nor a resolvable Staff profile/location -- same
        // "no staff profile" edge case `/staff` itself renders, kept local
        // to this page rather than redirecting into another page's UI.
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
                {!staffProfile
                  ? 'You do not have a staff profile for this tenant yet. Ask your manager to add you.'
                  : 'Your assigned location is not available. Ask your manager for help.'}
              </p>
            </section>
          </main>
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const [expectedTasksResult, staffItemsResult] = await Promise.all([
        listExpectedTasks(supabase, activeTenant.tenantId, today),
        listOperationsTemplateItems(supabase, activeTenant.tenantId),
      ]);
      // `operations.task.read` may be tenant-wide for some roles -- narrow to
      // this Staff member's own location here, client-facing-safe regardless
      // (RLS is the real tenant/location boundary either way).
      const staffTasks =
        expectedTasksResult.status === 'success'
          ? expectedTasksResult.data.filter((task) => task.locationId === staffLocation.locationId)
          : null;

      // Every already-materialised task's recorded responses, fetched once
      // up-front (server-side, no browser Supabase client in this codebase)
      // and keyed by `instanceId` -- the checklist modal below reads this
      // map instead of fetching lazily; any write action calls
      // `router.refresh()`, which re-runs this whole page and refetches it.
      const instanceIds = (staffTasks ?? []).map((task) => task.instanceId).filter((id): id is string => id !== null);
      const responseEntries = await Promise.all(
        instanceIds.map(async (instanceId): Promise<[string, OperationsItemResponse[]]> => {
          const result = await listItemResponses(supabase, activeTenant.tenantId, instanceId);
          return [instanceId, result.status === 'success' ? result.data : []];
        }),
      );
      const responsesByInstanceId: Record<string, OperationsItemResponse[]> = Object.fromEntries(responseEntries);

      return (
        <StaffOperationsClient
          tenantName={activeTenant.tenantName}
          locationName={staffLocation.locationName}
          tasks={staffTasks}
          items={staffItemsResult.status === 'success' ? staffItemsResult.data : null}
          responsesByInstanceId={responsesByInstanceId}
          businessDate={today}
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
