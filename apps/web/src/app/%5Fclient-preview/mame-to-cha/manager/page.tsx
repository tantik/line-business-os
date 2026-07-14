import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { resolveManagerLocation } from '@/lib/preview/location';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { listEmployeeLineLinks } from '@/lib/workforce/employee-line-links';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  PreviewErrorState,
  PreviewLocationBlockedState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { PreviewManagerView } from '@/lib/preview/manager-view';
import { PreviewReadOnlyNotice } from '@/lib/preview/states';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const MAX_WEEK_OFFSET = 8;
const MANAGER_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/manager`;

function parseWeekOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return 0;
  return Math.max(-MAX_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, n));
}

/**
 * Mame To Cha preview manager view (Phase 1N-4C Slice B1) - read-only reuse
 * of the existing Workforce manager data loaders, rendered through the
 * action-free `PreviewManagerView` display component (see
 * `lib/preview/manager-view.tsx`). This page and its dependency graph import
 * no Server Action and no dashboard interactive component - the dashboard's
 * `ManagerDashboardClient` (which does own the mutation forms/actions) is
 * never imported here, so no mutation action can be registered as a callable
 * worker for this route (verified by `scripts/verify-preview-no-server-actions.mjs`).
 */
export default async function MameToChaPreviewManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ weekOffset?: string }>;
}) {
  await requirePreviewUser(MANAGER_PUBLIC_PATH);

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState />;

  const locationsResult = await listTenantLocations(supabase);
  const tenantLocations =
    locationsResult.status === 'success'
      ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
      : [];
  const locationResult = resolveManagerLocation(tenantLocations);
  if (locationResult.kind !== 'ok') return <PreviewLocationBlockedState reason={locationResult.kind} />;
  const location = locationResult.location;

  const { weekOffset: rawWeekOffset } = await searchParams;
  const weekOffset = parseWeekOffset(rawWeekOffset);
  const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

  const [
    staffResult,
    lineLinksResult,
    shiftTypesResult,
    requestsResult,
    assignmentsResult,
    correctionRequestsResult,
    attendanceResult,
  ] = await Promise.all([
    listWorkforceStaffForManager(supabase, activeTenant.tenantId),
    listEmployeeLineLinks(supabase, activeTenant.tenantId),
    listWorkforceShiftTypes(supabase, activeTenant.tenantId),
    listShiftRequestsForManager(supabase, activeTenant.tenantId, { kind: 'preference' }),
    listShiftAssignments(supabase, activeTenant.tenantId, { fromIso, toIsoExclusive }),
    listShiftRequestsForManager(supabase, activeTenant.tenantId, { kind: 'correction' }),
    listAttendanceForManager(supabase, activeTenant.tenantId),
  ]);

  return (
    <main style={pageStyle(1180)}>
      <header>
        <h1 style={{ margin: 0 }}>Mame To Cha プレビュー - マネージャー</h1>
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

      <PreviewManagerView
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
        basePath={PREVIEW_BASE_PATH}
      />
    </main>
  );
}
