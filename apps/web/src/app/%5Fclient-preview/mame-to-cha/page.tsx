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
import {
  PreviewErrorState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
  PreviewNoProfileState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { demoColors, mobilePageStyle } from '@/lib/demo/cafe/theme';
import { PreviewStaffView } from '@/lib/preview/staff-view';
import { PreviewClockPanel } from '@/lib/preview/preview-clock-panel';
import { PreviewStaffActions } from '@/lib/preview/preview-staff-actions';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { PreviewLogoutButton } from '@/lib/preview/preview-logout-button';
import {
  diagnoseStaffProfileFailure,
  logStaffProfileFailure,
} from '@/lib/preview/staff-profile-diagnostic';
import { listTenantModules } from '@/lib/tenant/modules';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { PreviewInventoryStaffPanel } from '@/lib/preview/preview-inventory-staff-panel';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { PreviewShiftExchangeStaffPanel } from '@/lib/preview/preview-shift-exchange-staff-panel';
import {
  listInventoryCheckSessionItems,
  listInventoryCheckSessions,
  type InventoryCheckSessionItem,
} from '@/lib/inventory/check-sessions';
import { PreviewInventorySessionPanel } from '@/lib/preview/preview-inventory-session-panel';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const MAX_WEEK_OFFSET = 8;
const STAFF_PUBLIC_PATH = PREVIEW_BASE_PATH;

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
  const [shiftTypesResult, requestsResult, assignmentsResult, attendanceResult, modulesResult, exchangesResult] =
    await Promise.all([
      listWorkforceShiftTypes(supabase, activeTenant.tenantId),
      listMyShiftRequests(supabase, activeTenant.tenantId),
      // Keep the published roster stable while browsing weeks with no shifts.
      // The client component still renders only the requested seven-day period.
      listShiftAssignments(supabase, activeTenant.tenantId),
      listMyAttendance(supabase, activeTenant.tenantId),
      listTenantModules(supabase),
      listShiftExchanges(supabase, activeTenant.tenantId, location.locationId),
    ]);

  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === activeTenant.tenantId && m.module === 'inventory' && m.isEnabled);
  const inventoryItemsResult = inventoryEnabled
    ? await listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId)
    : null;

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
  const inventorySessionsResult = inventoryEnabled
    ? await listInventoryCheckSessions(supabase, activeTenant.tenantId, location.locationId, todayIso)
    : null;
  const inventorySessionItems: Record<string, InventoryCheckSessionItem[]> = {};
  if (inventorySessionsResult?.status === 'success') {
    await Promise.all(
      inventorySessionsResult.data.map(async (session) => {
        const result = await listInventoryCheckSessionItems(supabase, activeTenant.tenantId, session.sessionId);
        inventorySessionItems[session.sessionId] = result.status === 'success' ? result.data : [];
      }),
    );
  }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <PreviewLogoutButton />
          </div>
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
        requests={requestsResult.status === 'success' ? requestsResult.data : null}
        basePath={PREVIEW_BASE_PATH}
      />

      <PreviewStaffActions
        shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
        attendanceOptions={attendanceResult.status === 'success' ? attendanceResult.data : null}
        todayAttendance={todayAttendance}
        preferenceSubmitted={
          requestsResult.status === 'success' &&
          requestsResult.data.some((request) => request.kind === 'preference' && request.workDate >= todayIso)
        }
        defaultPreferenceDate={defaultPreferenceDate}
        defaultReportDate={todayIso}
      />

      {assignmentsResult.status === 'success' && exchangesResult.status === 'success' ? (
        <PreviewShiftExchangeStaffPanel
          employeeId={profile.staffId}
          timeZone={location.timezone}
          assignments={publishedAssignments ?? []}
          exchanges={exchangesResult.data}
        />
      ) : null}

      {inventoryEnabled && inventorySessionsResult?.status === 'success' ? (
        <PreviewInventorySessionPanel
          businessDate={todayIso}
          sessions={inventorySessionsResult.data}
          itemsBySession={inventorySessionItems}
        />
      ) : null}

      {inventoryEnabled && inventoryItemsResult?.status === 'success' ? (
        <PreviewInventoryStaffPanel locationId={location.locationId} items={inventoryItemsResult.data} />
      ) : null}
    </main>
  );
}
