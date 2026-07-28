import Link from 'next/link';
import { CafeStaffHeader } from '@/components/demo/cafe/CafeStaffPresentation';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { resolveStaffLocation } from '@/lib/preview/location';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listMyShiftRequests } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listMyAttendance } from '@/lib/workforce/attendance';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  PreviewErrorState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
  PreviewNoProfileState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { demoColors, linkAccent, mobilePageStyle } from '@/lib/demo/cafe/theme';
import { PreviewStaffView } from '@/lib/preview/staff-view';
import { PreviewClockPanel } from '@/lib/preview/preview-clock-panel';
import { PreviewStaffActions } from '@/lib/preview/preview-staff-actions';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import {
  diagnoseStaffProfileFailure,
  logStaffProfileFailure,
} from '@/lib/preview/staff-profile-diagnostic';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const MAX_WEEK_OFFSET = 8;
const STAFF_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/staff`;

function parseWeekOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return 0;
  return Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, n));
}

/**
 * Mame To Cha preview staff view (Phase 1N-4C Slice B1 read shell + Slice B2b
 * staff preview writes) - reuses the existing Workforce staff data loaders,
 * rendered through the action-free `PreviewStaffView` display component (see
 * `lib/preview/staff-view.tsx`) plus the three B2b preview-specific client
 * islands (`PreviewShiftPreferenceForm`/`PreviewWorkReportForm`/
 * `PreviewCorrectionRequestForm`). This page and its dependency graph import
 * no dashboard Server Action and no dashboard interactive component - the
 * dashboard's `StaffDashboardClient` (which owns the dashboard mutation
 * forms/actions) is never imported here, and the only Server Actions
 * reachable from this route are the three allowlisted `previewSubmitXxx`
 * staff actions (verified by `scripts/verify-preview-server-actions.mjs`).
 * Location resolution here is intentionally strict (`resolveStaffLocation`,
 * architecture plan Section F2): it never falls back to the tenant's
 * active/first location on mismatch the way the lenient dashboard staff page
 * does - a mismatch always fails closed to a neutral "no profile" state. The
 * B2b Server Actions independently re-resolve this same strict binding
 * server-side via `resolvePreviewStaffContext()` - the read-side `profile`/
 * `location` computed here are never passed to a Server Action as authority.
 */
export default async function MameToChaPreviewStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ weekOffset?: string }>;
}) {
  await requirePreviewUser(STAFF_PUBLIC_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState variant="light" />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState variant="light" />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState variant="light" />;

  const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
  const profileDiagnostic = diagnoseStaffProfileFailure(profileResult);
  if (profileDiagnostic) {
    logStaffProfileFailure(profileDiagnostic);
    return <PreviewNoProfileState variant="light" />;
  }
  if (profileResult.status !== 'success' || !profileResult.data) return <PreviewNoProfileState variant="light" />;
  const profile = profileResult.data;

  const locationsResult = await listTenantLocations(supabase);
  const tenantLocations =
    locationsResult.status === 'success'
      ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
      : [];
  const location = resolveStaffLocation(profile, tenantLocations);
  if (!location) {
    const locationDiagnostic = diagnoseStaffProfileFailure(profileResult, tenantLocations);
    if (locationDiagnostic) logStaffProfileFailure(locationDiagnostic);
    return <PreviewNoProfileState variant="light" />;
  }

  const { weekOffset: rawWeekOffset } = await searchParams;
  const weekOffset = parseWeekOffset(rawWeekOffset);
  const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

  const [shiftTypesResult, requestsResult, assignmentsResult, attendanceResult] =
    await Promise.all([
      listWorkforceShiftTypes(supabase, activeTenant.tenantId),
      listMyShiftRequests(supabase, activeTenant.tenantId, { kind: 'preference' }),
      listShiftAssignments(supabase, activeTenant.tenantId, { fromIso, toIsoExclusive }),
      listMyAttendance(supabase, activeTenant.tenantId),
    ]);

  const publishedAssignments =
    assignmentsResult.status === 'success'
      ? assignmentsResult.data.filter((a) => a.published && a.locationId === location.locationId)
      : null;
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayAttendance =
    attendanceResult.status === 'success'
      ? attendanceResult.data.find((entry) => entry.workDate === todayIso) ?? null
      : null;
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);
  const defaultPreferenceDate = new Date(Date.UTC(todayYear!, todayMonth!, 1)).toISOString().slice(0, 10);

  return (
    <main style={mobilePageStyle(760)}>
      <CafeStaffHeader
        mark={
          <span
            aria-hidden="true"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 42,
              height: 42,
              flexShrink: 0,
              borderRadius: 12,
              background: demoColors.accent,
              color: '#FFFFFF',
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            M
          </span>
        }
        title={activeTenant.tenantName}
        subtitle={location.locationName}
        actions={
          <>
            <Link href={PREVIEW_BASE_PATH} style={{ ...linkAccent, flexShrink: 0, fontSize: 13, fontWeight: 700 }}>
              トップへ戻る
            </Link>
            <PreviewLanguageToggle />
          </>
        }
      />

      <PreviewClockPanel todayAttendance={todayAttendance} timeZone={location.timezone} />

      <PreviewStaffView
        timeZone={location.timezone}
        periodStart={periodStart}
        periodEnd={periodEnd}
        weekOffset={weekOffset}
        profile={profile}
        shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
        assignments={publishedAssignments}
        attendance={attendanceResult.status === 'success' ? attendanceResult.data : null}
        basePath={PREVIEW_BASE_PATH}
      />

      <PreviewStaffActions
        shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
        attendanceOptions={attendanceResult.status === 'success' ? attendanceResult.data : null}
        todayAttendance={todayAttendance}
        preferenceSubmitted={
          requestsResult.status === 'success' &&
          requestsResult.data.some((request) => request.workDate >= todayIso)
        }
        defaultPreferenceDate={defaultPreferenceDate}
        defaultReportDate={todayIso}
      />
    </main>
  );
}
