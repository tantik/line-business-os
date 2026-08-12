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
import { getWeekOffsetWindow, getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
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
import { PreviewCafeMenu } from '@/lib/preview/preview-cafe-menu';
import {
  diagnoseStaffProfileFailure,
  logStaffProfileFailure,
} from '@/lib/preview/staff-profile-diagnostic';
import { listTenantModules } from '@/lib/tenant/modules';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { PreviewInventoryStaffPanel } from '@/lib/preview/preview-inventory-staff-panel';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import {
  listInventoryCheckSessionItems,
  listInventoryCheckSessions,
  type InventoryCheckSessionItem,
} from '@/lib/inventory/check-sessions';
import { PreviewInventorySessionPanel } from '@/lib/preview/preview-inventory-session-panel';
import Link from 'next/link';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const MAX_WEEK_OFFSET = 8;
const STAFF_PUBLIC_PATH = PREVIEW_BASE_PATH;

/**
 * Cafe Package v2 Product Acceptance (Round 3): hide the opening/closing
 * stock-check screen from the UI -- not needed for this package. Data
 * loading, the component, and its Server Actions are untouched so this can
 * be flipped back on for a package that does want it.
 */
const SHOW_OPENING_CLOSING_STOCK_CHECKS = false;

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

  const nowIso = new Date().toISOString();
  const { weekOffset: rawWeekOffset } = await searchParams;
  const weekOffset = parseWeekOffset(rawWeekOffset);
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, location.timezone, weekOffset);
  const assignmentWindow = getWeekOffsetWindow(nowIso, location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
  const assignmentFromIso = localDateTimeToUtcIso(assignmentWindow.periodStart, '00:00', location.timezone);
  const assignmentToIsoExclusive = localDateTimeToUtcIso(addIsoDays(assignmentWindow.periodEnd, 1), '00:00', location.timezone);
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Resolved first (rather than inside the batch below) only because the two
  // Inventory reads are conditional on it -- every other read here is
  // independent and always runs in the same batch, never staged serially
  // after this.
  const modulesResult = await listTenantModules(supabase);
  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === activeTenant.tenantId && m.module === 'inventory' && m.isEnabled);

  const [
    shiftTypesResult,
    requestsResult,
    assignmentsResult,
    attendanceResult,
    exchangesResult,
    inventoryItemsResult,
    inventorySessionsResult,
  ] = await Promise.all([
    listWorkforceShiftTypes(supabase, activeTenant.tenantId),
    listMyShiftRequests(supabase, activeTenant.tenantId),
    // Preload exactly the 17 weeks the client navigator can display. This
    // keeps its roster stable without reading the tenant's lifetime history.
    listShiftAssignments(supabase, activeTenant.tenantId, {
      fromIso: assignmentFromIso,
      toIsoExclusive: assignmentToIsoExclusive,
    }),
    listMyAttendance(supabase, activeTenant.tenantId),
    listShiftExchanges(supabase, activeTenant.tenantId, location.locationId),
    inventoryEnabled ? listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId) : Promise.resolve(null),
    inventoryEnabled && SHOW_OPENING_CLOSING_STOCK_CHECKS
      ? listInventoryCheckSessions(supabase, activeTenant.tenantId, location.locationId, todayIso)
      : Promise.resolve(null),
  ]);

  const publishedAssignments =
    assignmentsResult.status === 'success'
      ? assignmentsResult.data.filter((a) => a.published && a.locationId === location.locationId)
      : null;
  const todayAttendance =
    attendanceResult.status === 'success'
      ? attendanceResult.data.find((entry) => entry.workDate === todayIso) ?? null
      : null;
  const inventorySessionItems: Record<string, InventoryCheckSessionItem[]> = {};
  if (SHOW_OPENING_CLOSING_STOCK_CHECKS && inventorySessionsResult?.status === 'success') {
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
          <Link href={PREVIEW_BASE_PATH} aria-label="MATCHA-tea" style={{ textDecoration: 'none' }}><span
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
          </span></Link>
        }
        title="MATCHA-tea"
        subtitle={null}
        actions={<PreviewCafeMenu current="staff" />}
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
        exchanges={exchangesResult.status === 'success' ? exchangesResult.data : null}
        basePath={PREVIEW_BASE_PATH}
      />

      <PreviewStaffActions
        shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
        todayAttendance={todayAttendance}
        preferenceSubmitted={
          requestsResult.status === 'success' &&
          requestsResult.data.some((request) => request.kind === 'preference' && request.workDate >= todayIso)
        }
        defaultPreferenceDate={defaultPreferenceDate}
        defaultReportDate={todayIso}
      />

      {SHOW_OPENING_CLOSING_STOCK_CHECKS && inventoryEnabled && inventorySessionsResult?.status === 'success' ? (
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
