import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';
import { CafeManagerScreen } from '@/components/demo/cafe/CafeManagerScreen';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { PreviewLogoutButton } from '@/lib/preview/preview-logout-button';
import { listTenantModules } from '@/lib/tenant/modules';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { PreviewInventoryManagerPanel } from '@/lib/preview/preview-inventory-manager-panel';
import { requirePreviewUser } from '@/lib/preview/auth';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForField } from '@/lib/content/translations';
import { withResolvedRecipeListTitles } from '@/lib/preview/manager-recipe-title-translations';
import { getWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { getWeekOffsetWindow, getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import { PreviewNoAccessState } from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { toManagerCorrectionSummaries } from '@/lib/preview/manager-view-model';
import { PreviewManagerView } from '@/lib/preview/manager-view';
import { PreviewStaffRecipeManagement } from '@/lib/preview/preview-staff-recipe-management';
import { PreviewSettingsCard } from '@/lib/preview/preview-settings-card';
import { PreviewCorrectionRequestsPanel } from '@/lib/preview/preview-correction-requests-panel';
import { authorizePreviewManagerPage } from '@/lib/preview/manager-page-authorize';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { PreviewShiftExchangeManagerPanel } from '@/lib/preview/preview-shift-exchange-manager-panel';
import { PreviewManagerToday } from '@/lib/preview/preview-manager-today';
import { listInventoryCheckSessions } from '@/lib/inventory/check-sessions';
import { time, mark } from '@/lib/perf/timing';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

const MAX_WEEK_OFFSET = 8;
const MANAGER_PUBLIC_PATH = `${PREVIEW_BASE_PATH}/manager`;

/**
 * Cafe Package v2 Product Acceptance (Round 3): hide the opening/closing
 * stock-check screen (and its "Today" summary tiles) from the UI -- not
 * needed for this package. Data loading, the component, and its Server
 * Actions are untouched so this can be flipped back on for a package that
 * does want it. Keep in sync with the same flag in `mame-to-cha/page.tsx`.
 */
const SHOW_OPENING_CLOSING_STOCK_CHECKS = false;

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
  const __pageStart = performance.now();
  await time('auth:requirePreviewUser', () => requirePreviewUser(MANAGER_PUBLIC_PATH));

  // Page-level authorization must run before any tenant-wide manager loader
  // or manager action form is rendered. Server Actions repeat their own
  // permission checks, but that does not protect the page's read surface.
  // `authorizePreviewManagerPage` already resolves tenant/module/location to
  // run its permission check - reuse that resolved context below instead of
  // re-resolving tenant/module/location a second time from scratch.
  const authResult = await time('auth:authorizePreviewManagerPage', () => authorizePreviewManagerPage());
  if (authResult.status !== 'ok') return <PreviewNoAccessState variant="light" />;

  const { supabase, tenantId, location } = authResult.context;

  const { weekOffset: rawWeekOffset } = await searchParams;
  const weekOffset = parseWeekOffset(rawWeekOffset);
  const nowIso = new Date().toISOString();
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, location.timezone, weekOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);
  // Shift Exchange approvals only ever reference a shift within the same
  // -8..+8 week client navigation window the Staff/Manager schedule already
  // supports (see MAX_WEEK_OFFSET) -- bounding this the same way the Staff
  // page's assignment read is bounded (Phase 1N-4C latency fix) avoids
  // re-fetching the tenant's entire shift-assignment history on every single
  // page render/Save, which was a direct contributor to "everything feels
  // slow" on this page.
  const exchangeAssignmentWindow = getWeekOffsetWindow(nowIso, location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
  const exchangeAssignmentFromIso = localDateTimeToUtcIso(exchangeAssignmentWindow.periodStart, '00:00', location.timezone);
  const exchangeAssignmentToIsoExclusive = localDateTimeToUtcIso(
    addIsoDays(exchangeAssignmentWindow.periodEnd, 1),
    '00:00',
    location.timezone,
  );
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Resolved first (rather than inside the batch below) only because the two
  // Inventory reads are conditional on it -- every other read here is
  // independent and always runs in the same batch, never staged serially
  // one-await-at-a-time (each extra round trip was a direct contributor to
  // this page's slow load).
  const modulesResult = await time('modules:listTenantModules', () => listTenantModules(supabase));
  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === tenantId && m.module === 'inventory' && m.isEnabled);

  const __batchStart = performance.now();
  const [
    staffResult,
    shiftTypesResult,
    assignmentsResult,
    correctionRequestsResult,
    attendanceResult,
    recipesResult,
    recipeTitleTranslationsResult,
    settingsResult,
    exchangesResult,
    allAssignmentsResult,
    inventoryItemsResult,
    inventorySessionsResult,
  ] = await Promise.all([
    time('batch:listWorkforceStaffForManager', () => listWorkforceStaffForManager(supabase, tenantId)),
    time('batch:listWorkforceShiftTypes', () => listWorkforceShiftTypes(supabase, tenantId)),
    time('batch:listShiftAssignments(week)', () =>
      listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
    ),
    time('batch:listShiftRequestsForManager', () =>
      listShiftRequestsForManager(supabase, tenantId, { kind: 'correction' }),
    ),
    time('batch:listAttendanceForManager', () => listAttendanceForManager(supabase, tenantId)),
    time('batch:listWorkforceRecipes', () => listWorkforceRecipes(supabase, tenantId)),
    time('batch:listRecipeTitleTranslations', () =>
      listContentTranslationsForField(supabase, tenantId, 'workforce_recipe', 'title'),
    ),
    time('batch:getWorkforceScheduleSettings', () =>
      getWorkforceScheduleSettings(supabase, tenantId, location.locationId),
    ),
    time('batch:listShiftExchanges', () => listShiftExchanges(supabase, tenantId, location.locationId)),
    time('batch:listShiftAssignments(+-8wk, for exchanges)', () =>
      listShiftAssignments(supabase, tenantId, {
        fromIso: exchangeAssignmentFromIso,
        toIsoExclusive: exchangeAssignmentToIsoExclusive,
      }),
    ),
    inventoryEnabled
      ? time('batch:listInventoryItemStatus', () =>
          listInventoryItemStatus(supabase, tenantId, location.locationId, { includeInactive: true }),
        )
      : Promise.resolve(null),
    inventoryEnabled
      ? time('batch:listInventoryCheckSessions', () =>
          listInventoryCheckSessions(supabase, tenantId, location.locationId, todayIso),
        )
      : Promise.resolve(null),
  ]);
  mark(`batch:TOTAL (parallel wall time ${(performance.now() - __batchStart).toFixed(1)}ms)`);
  // The staff loader's specific failure reason (missing PII env, RLS denial,
  // or an unexpected Postgres/decrypt error - see `listWorkforceStaffForManager`)
  // must never reach the client, but silently collapsing it to `null` with no
  // trace at all makes a real misconfiguration undiagnosable. Log the status
  // (and, for `unexpected_error`, the underlying Postgres message - never PII,
  // since decrypted names are never included in that message) server-side only.
  if (staffResult.status !== 'success') {
    const message = 'message' in staffResult ? staffResult.message : '';
    console.error(`[preview:mame-to-cha:manager] staff load failed: status=${staffResult.status} message=${message}`);
  }

  const staff = staffResult.status === 'success' ? staffResult.data : null;
  // A removed/deactivated staff member must never appear as a schedulable row
  // or in an assignment selector by default (Staff lifecycle requirement) --
  // `staff` itself stays the full (active + inactive) list for every other
  // consumer below (Staff management's own Active/Inactive/All filter,
  // historical name lookups in Correction Requests/Shift Exchange, which must
  // keep resolving a removed employee's name against past records).
  const activeStaff = staff === null ? null : staff.filter((s) => s.isActive);
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const shiftTypes = shiftTypesResult.status === 'success' ? shiftTypesResult.data : null;
  const assignments = assignmentsResult.status === 'success' ? assignmentsResult.data : null;
  const correctionRequests = correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null;
  const attendance = attendanceResult.status === 'success' ? attendanceResult.data : null;
  const recipes = recipesResult.status === 'success'
    ? withResolvedRecipeListTitles(
        recipesResult.data,
        recipeTitleTranslationsResult.status === 'success' ? recipeTitleTranslationsResult.data : [],
      )
    : null;
  const settings = settingsResult.status === 'success' ? settingsResult.data : null;

  const pendingCorrections = (correctionRequests ?? []).filter((r) => r.status === 'pending');
  const decidedCorrections = (correctionRequests ?? [])
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);
  const managerCorrectionSummaries =
    correctionRequestsResult.status === 'success' ? toManagerCorrectionSummaries(pendingCorrections, staffById) : [];
  const pendingExchanges =
    exchangesResult.status === 'success'
      ? exchangesResult.data.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted')
      : [];
  const activeInventoryItems =
    inventoryItemsResult?.status === 'success' ? inventoryItemsResult.data.filter((item) => item.isActive) : [];
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: location.timezone, hour: '2-digit', hour12: false }).format(new Date()),
  );
  const openingSession =
    inventorySessionsResult?.status === 'success'
      ? inventorySessionsResult.data.find((session) => session.checkType === 'opening')
      : undefined;
  const closingSession =
    inventorySessionsResult?.status === 'success'
      ? inventorySessionsResult.data.find((session) => session.checkType === 'closing')
      : undefined;
  const staffNameById = Object.fromEntries((staff ?? []).map((entry) => [entry.staffId, entry.name]));
  mark(`page:TOTAL server time before render ${(performance.now() - __pageStart).toFixed(1)}ms`);

  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <CafeManagerScreen
        subtitle={`MATCHA-tea — ${location.locationName}`}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <PreviewLogoutButton returnTo={MANAGER_PUBLIC_PATH} />
          </div>
        }
        // `PreviewManagerToday` (below, via `managerCorrectionSummaries`) is
        // the real, language-aware correction-alert surface for this page -
        // `CafeManagerScreen`'s own alerts block stays hidden and unfed here
        // rather than duplicating that same domain transformation into a
        // second, JA-only model.
        alerts={[]}
        showAlerts={false}
      >
        <PreviewManagerToday
          actionSlot={<PreviewCorrectionRequestsPanel
            timeZone={location.timezone}
            pendingRequests={pendingCorrections}
            decidedRequests={decidedCorrections}
            staff={staff}
            attendance={attendance}
          />}
          pendingCorrections={pendingCorrections.length}
          pendingExchanges={pendingExchanges.length}
          shortageItems={activeInventoryItems.filter((item) => item.status === 'shortage').length}
          uncountedItems={activeInventoryItems.filter((item) => item.status === 'unknown').length}
          unpublishedShifts={(assignments ?? []).filter((assignment) => !assignment.published).length}
          openingCheckComplete={
            !SHOW_OPENING_CLOSING_STOCK_CHECKS || !inventoryEnabled || localHour < 10 ? null : openingSession?.status === 'completed'
          }
          closingCheckComplete={
            !SHOW_OPENING_CLOSING_STOCK_CHECKS || !inventoryEnabled || localHour < 18 ? null : closingSession?.status === 'completed'
          }
          correctionSummaries={managerCorrectionSummaries}
          shortageDetails={activeInventoryItems.filter((item) => item.status === 'shortage').slice(0, 4).map((item) => item.name)}
        />

        <PreviewManagerView
          timeZone={location.timezone}
          periodStart={periodStart}
          periodEnd={periodEnd}
          weekOffset={weekOffset}
          staff={activeStaff}
          shiftTypes={shiftTypes}
          assignments={assignments}
          attendance={attendance}
          basePath={PREVIEW_BASE_PATH}
          requiredHeadcountByWeekday={settings?.requiredHeadcountByWeekday ?? [3, 3, 3, 3, 3, 2, 4]}
        />

        <PreviewStaffRecipeManagement
          staff={staff}
          recipes={recipes}
          inventorySlot={
            inventoryEnabled && inventoryItemsResult?.status === 'success' ? (
              <PreviewInventoryManagerPanel
                locationId={location.locationId}
                items={inventoryItemsResult.data}
                staffNameById={staffNameById}
                embedded
              />
            ) : null
          }
        />

        <PreviewSettingsCard shiftTypes={shiftTypes} settings={settings} />

        {exchangesResult.status === 'success' && allAssignmentsResult.status === 'success' ? (
          <PreviewShiftExchangeManagerPanel
            timeZone={location.timezone}
            assignments={allAssignmentsResult.data}
            exchanges={exchangesResult.data}
            staffNameById={staffNameById}
            shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : []}
          />
        ) : null}
      </CafeManagerScreen>
    </BrandProvider>
  );
}
