import Link from 'next/link';
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
import { linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { PreviewStaffView } from '@/lib/preview/staff-view';
import { PreviewReadOnlyNotice } from '@/lib/preview/states';

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
 * Mame To Cha preview staff view (Phase 1N-4C Slice B1) - read-only reuse of
 * the existing Workforce staff data loaders, rendered through the
 * action-free `PreviewStaffView` display component (see
 * `lib/preview/staff-view.tsx`). This page and its dependency graph import
 * no Server Action and no dashboard interactive component - the dashboard's
 * `StaffDashboardClient` (which does own the mutation forms/actions) is
 * never imported here, so no mutation action can be registered as a callable
 * worker for this route (verified by `scripts/verify-preview-no-server-actions.mjs`).
 * Location resolution here is intentionally strict (`resolveStaffLocation`,
 * architecture plan Section F2): it never falls back to the tenant's
 * active/first location on mismatch the way the lenient dashboard staff page
 * does - a mismatch always fails closed to a neutral "no profile" state.
 */
export default async function MameToChaPreviewStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ weekOffset?: string }>;
}) {
  await requirePreviewUser(STAFF_PUBLIC_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState />;

  const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);
  if (profileResult.status !== 'success' || !profileResult.data) return <PreviewNoProfileState />;
  const profile = profileResult.data;

  const locationsResult = await listTenantLocations(supabase);
  const tenantLocations =
    locationsResult.status === 'success'
      ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
      : [];
  const location = resolveStaffLocation(profile, tenantLocations);
  if (!location) return <PreviewNoProfileState />;

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

  // Narrow server-side to the caller's own published shifts, same as the
  // dashboard staff page - `listShiftAssignments` is shared and returns every
  // employee's rows at this location.
  const myPublishedAssignments =
    assignmentsResult.status === 'success'
      ? assignmentsResult.data.filter((a) => a.published && a.employeeId === profile.staffId)
      : null;

  return (
    <main style={pageStyle(1000)}>
      <header>
        <h1 style={{ margin: 0 }}>Mame To Cha プレビュー - スタッフ</h1>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          {activeTenant.tenantName} - {location.locationName}
        </p>
        <Link
          href={PREVIEW_BASE_PATH}
          style={{ ...linkAccent, display: 'inline-block', marginTop: 12, fontSize: 14, textDecoration: 'underline' }}
        >
          プレビュートップへ戻る
        </Link>
      </header>

      <PreviewReadOnlyNotice />

      <PreviewStaffView
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
        basePath={PREVIEW_BASE_PATH}
      />
    </main>
  );
}
