import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listMyShiftRequests } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listMyAttendance } from '@/lib/workforce/attendance';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { StaffDashboardClient } from './staff-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Sanity cap on how far a staff member can navigate the weekly view, not a business rule. */
const MAX_WEEK_OFFSET = 8;

function parseWeekOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return 0;
  return Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, n));
}

function BackLink() {
  return (
    <Link
      href="/dashboard/workforce"
      style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
    >
      Back to Workforce
    </Link>
  );
}

/**
 * Cafe Workforce staff page (Slice 3A) -- the first real (non-demo)
 * production-path staff-facing UI: own profile, shift-preference
 * submission, own published schedule, work reports, and correction
 * requests. Reachable only when the tenant's `workforce` module is enabled
 * (app-level entitlement check, not the security boundary -- RLS on the
 * underlying `api.workforce_*` views remains the real tenant-isolation
 * mechanism regardless of this check).
 */
export default async function WorkforceStaffPage({
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

      // Resolved before anything else: a caller with no `workforce.employees`
      // row has nothing else on this page to show, and no location/period is
      // needed to say so.
      const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
      if (profileResult.status === 'unauthorized') return <UnauthorizedState />;
      if (profileResult.status === 'config_error') return <MissingConfigState />;
      if (profileResult.status !== 'success') return <ErrorState />;

      if (!profileResult.data) {
        return (
          <main style={pageStyle(720)}>
            <header>
              <h1 style={{ margin: 0 }}>Workforce staff</h1>
              <BackLink />
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>
                You do not have a staff profile for this tenant yet. Ask your manager to add you.
              </p>
            </section>
          </main>
        );
      }
      const profile = profileResult.data;

      const locationsResult = await listTenantLocations(supabase);
      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      const location =
        tenantLocations.find((l) => l.locationId === profile.locationId) ??
        tenantLocations.find((l) => l.isActive) ??
        tenantLocations[0];

      if (!location) {
        return (
          <main style={pageStyle(720)}>
            <header>
              <h1 style={{ margin: 0 }}>Workforce staff</h1>
              <BackLink />
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>No location is configured for this workspace yet.</p>
            </section>
          </main>
        );
      }

      const { weekOffset: rawWeekOffset } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
      const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
      const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

      const [shiftTypesResult, requestsResult, assignmentsResult, attendanceResult, correctionRequestsResult] =
        await Promise.all([
          listWorkforceShiftTypes(supabase, activeTenant.tenantId),
          listMyShiftRequests(supabase, activeTenant.tenantId, { kind: 'preference' }),
          listShiftAssignments(supabase, activeTenant.tenantId, { fromIso, toIsoExclusive }),
          listMyAttendance(supabase, activeTenant.tenantId),
          listMyShiftRequests(supabase, activeTenant.tenantId, { kind: 'correction' }),
        ]);

      // `listShiftAssignments` is shared with the manager view and returns
      // every employee's rows at this location -- narrow to the caller's own
      // published shifts here, server-side, before anything is sent to the
      // browser. RLS already limits staff to published rows tenant-wide; this
      // is the employee-id narrowing on top of that, done before the network
      // boundary rather than after it.
      const myPublishedAssignments =
        assignmentsResult.status === 'success'
          ? assignmentsResult.data.filter((a) => a.published && a.employeeId === profile.staffId)
          : null;

      return (
        <main style={pageStyle(1000)}>
          <header>
            <h1 style={{ margin: 0 }}>Workforce staff</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              {activeTenant.tenantName} - {location.locationName}
            </p>
            <BackLink />
          </header>

          <StaffDashboardClient
            timeZone={location.timezone}
            periodStart={periodStart}
            periodEnd={periodEnd}
            weekOffset={weekOffset}
            profile={profile}
            shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
            requests={requestsResult.status === 'success' ? requestsResult.data : null}
            assignments={myPublishedAssignments}
            attendance={attendanceResult.status === 'success' ? attendanceResult.data : null}
            correctionRequests={correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null}
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
