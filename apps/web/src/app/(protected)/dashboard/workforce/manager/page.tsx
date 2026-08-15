import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { listEmployeeLineLinks } from '@/lib/workforce/employee-line-links';
import { listWorkforceEmployeeInvitations } from '@/lib/workforce/invitations';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import { getWeekPeriod, getWeekOffsetWindow } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { ManagerDashboardClient } from './manager-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Sanity cap on how far a manager can navigate the weekly view, not a business rule. */
const MAX_WEEK_OFFSET = 8;

function parseWeekOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return 0;
  return Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, n));
}

/**
 * Cafe Workforce manager page (Slice 2A) -- the first real (non-demo)
 * production-path manager UI for staff/shift-preference/schedule review,
 * auto-distribution, and publishing. Reachable only when the tenant's
 * `workforce` module is enabled (app-level entitlement check, not the
 * security boundary -- RLS on the underlying `api.workforce_*` views remains
 * the real tenant-isolation mechanism regardless of this check).
 */
export default async function WorkforceManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ weekOffset?: string }>;
}) {
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

      const locationsResult = await listTenantLocations(supabase);
      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      const location = tenantLocations.find((l) => l.isActive) ?? tenantLocations[0];

      if (!location) {
        return (
          <main style={pageStyle(1180)}>
            <header>
              <h1 style={{ margin: 0 }}>Workforce manager</h1>
              <Link
                href="/dashboard/workforce"
                style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
              >
                Back to Workforce
              </Link>
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>No location is configured for this workspace yet.</p>
            </section>
          </main>
        );
      }

      // Authorization boundary for the Manager operational surface: a plain
      // Staff (employee-role) tenant member passes `requireTenantContext`
      // above (they are a valid member) and the module-enabled check, but
      // must never reach the Manager-only data fetch below. `workforce.staff.manage`
      // is the existing permission that already governs every other
      // Manager-only capability in this module -- see `hasManagerAccess`.
      // Denial happens here, before any Manager-only Supabase read, so no
      // protected row ever reaches the RSC payload for an unauthorized caller.
      const managerAccess = await hasManagerAccess(supabase, activeTenant.tenantId, location.locationId);
      if (!managerAccess) return <UnauthorizedState />;

      const { weekOffset: rawWeekOffset } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
      const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
      const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

      // Shift-exchange requests can reference a shift outside the currently
      // viewed week (the manager may be looking at a different weekOffset
      // than the one the request's shift falls in), so the shift lookup for
      // the exchange panel reads the same bounded -8..+8 week window the
      // page's own navigator allows, not just the current week -- mirrors
      // `_client-preview`'s `previewGetShiftExchangeManagerData` window.
      const exchangeWindow = getWeekOffsetWindow(new Date().toISOString(), location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
      const exchangeFromIso = localDateTimeToUtcIso(exchangeWindow.periodStart, '00:00', location.timezone);
      const exchangeToIsoExclusive = localDateTimeToUtcIso(addIsoDays(exchangeWindow.periodEnd, 1), '00:00', location.timezone);

      const [
        staffResult,
        lineLinksResult,
        shiftTypesResult,
        requestsResult,
        assignmentsResult,
        correctionRequestsResult,
        attendanceResult,
        invitationsResult,
        shiftExchangesResult,
        exchangeAssignmentsResult,
      ] = await Promise.all([
        listWorkforceStaffForManager(supabase, activeTenant.tenantId),
        listEmployeeLineLinks(supabase, activeTenant.tenantId),
        listWorkforceShiftTypes(supabase, activeTenant.tenantId),
        listShiftRequestsForManager(supabase, activeTenant.tenantId, { kind: 'preference' }),
        listShiftAssignments(supabase, activeTenant.tenantId, { fromIso, toIsoExclusive }),
        listShiftRequestsForManager(supabase, activeTenant.tenantId, { kind: 'correction' }),
        listAttendanceForManager(supabase, activeTenant.tenantId),
        listWorkforceEmployeeInvitations(supabase, activeTenant.tenantId),
        listShiftExchanges(supabase, activeTenant.tenantId, location.locationId),
        listShiftAssignments(supabase, activeTenant.tenantId, { fromIso: exchangeFromIso, toIsoExclusive: exchangeToIsoExclusive }),
      ]);

      return (
        <main style={pageStyle(1180)}>
          <header>
            <h1 style={{ margin: 0 }}>Workforce manager</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              {activeTenant.tenantName} - {location.locationName}
            </p>
            <Link
              href="/dashboard/workforce"
              style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
            >
              Back to Workforce
            </Link>
          </header>

          <ManagerDashboardClient
            locationId={location.locationId}
            timeZone={location.timezone}
            periodStart={periodStart}
            periodEnd={periodEnd}
            weekOffset={weekOffset}
            staff={staffResult.status === 'success' ? staffResult.data : null}
            lineLinks={lineLinksResult.status === 'success' ? lineLinksResult.data : null}
            shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
            requests={requestsResult.status === 'success' ? requestsResult.data : null}
            assignments={assignmentsResult.status === 'success' ? assignmentsResult.data : null}
            correctionRequests={correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null}
            attendance={attendanceResult.status === 'success' ? attendanceResult.data : null}
            invitations={invitationsResult.status === 'success' ? invitationsResult.data : null}
            shiftExchanges={shiftExchangesResult.status === 'success' ? shiftExchangesResult.data : null}
            exchangeAssignments={exchangeAssignmentsResult.status === 'success' ? exchangeAssignmentsResult.data : null}
          />
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
