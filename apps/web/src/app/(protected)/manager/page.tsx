import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { toTenantSwitchOptions } from '@/lib/tenant/switch-options';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { loadPageContext } from '@/lib/tenant/page-context';
import { popupIfModuleEnabled, tenantNavigation } from '@/lib/tenant/module-nav';
import { resolvePackageConfig } from '@/lib/packages/config';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { correctionAttendanceIdsToShow, managerAttendanceLoadRange } from '@/lib/workforce/attendance-month';
import { createInventoryMediaUrlMap } from '@/lib/inventory/items';
import { flagMissedCriticalExceptions } from '@/lib/operations/exceptions';
import { withReporterNames } from '@/lib/issues/issues';
import { loadManagerDashboard, type ManagerDashboardPart } from '@/lib/manager/dashboard';
import { loadMyAccess } from '@/lib/auth/my-access';
import { WEEKLY_REVIEW_PERMISSION } from '@/lib/weekly-review/access';
import { MANAGER_ACCESS_PERMISSION } from '@/lib/workforce/manager-access';
import { ROLE_MANAGE_PERMISSION } from '@/lib/workforce/manager-role';
import { getWeekPeriod, getWeekOffsetWindow } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso, todayIsoInTimeZone } from '@/lib/workforce/timezone';
import { createRecipeMediaUrlMap, groupRecipesByCategory, RECIPE_MANAGE_PERMISSION } from '@/lib/workforce/recipes';
import { buildRecipeTranslationField, type RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';
import { ManagerDashboardClient } from './manager-dashboard-client';

/**
 * Extracts a human-readable message from a failed `TenantAccessResult`, or
 * `null` on success -- mirrors `/operations/page.tsx`'s own `readErrorMessage`
 * (kept local to this page rather than shared, same light duplication this
 * file already has for `parseWeekOffset`). Used so a genuine Operations read
 * failure (e.g. an undeployed view, an RLS/permission error) can be shown
 * distinctly from a legitimate empty result once threaded into the
 * Operations popup's `TemplateDetailModal`.
 */
function readErrorMessage(result: { status: string; message?: string }): string | null {
  if (result.status === 'success') return null;
  return result.message ?? 'Unexpected error.';
}

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'マネージャー', robots: { index: false, follow: false } };

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
  searchParams: Promise<{ weekOffset?: string; popup?: string; focusCell?: string }>;
}) {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      // Weekly Schedule Founder Review Round 2 (2026-08-22), week-navigation
      // performance: `listTenantNavigation` and `listTenantLocations` don't
      // depend on each other (module-enablement flags vs. the tenant's
      // locations) -- they were two sequential round trips before this page
      // even started its main data batch below, on every single request
      // including a plain Prev/Next-week click. One of several fixes in this
      // pass; see this file's own note further down for why the deeper fix
      // (not re-running the *whole* page's unrelated data on a week change)
      // is out of scope for this pass.
      // DEBT-135: navigation, locations and packages now come from the same
      // request-scoped page context `requireTenantContext` already loaded
      // (one `api.my_page_context` RPC) -- no further round trip here.
      const pageContext = await loadPageContext();
      const navigationResult = pageContext.navigation;
      const locationsResult = pageContext.locations;
      const packageCodes = pageContext.packageCodes(activeTenant.tenantId);
      // Enabled modules of the active tenant, in package order (0132, task
      // P4). The flags below gate only this dashboard's entry points and
      // their reads; RLS / RPCs (`core.has_module_access`) remain the real
      // authorization boundary regardless of them.
      const navigation = tenantNavigation(
        navigationResult.status === 'success' ? navigationResult.data : [],
        activeTenant.tenantId,
      );

      if (!navigation.enabled.has('workforce')) return <ModuleUnavailableState />;

      const inventoryEnabled = navigation.enabled.has('inventory');
      const purchasesEnabled = navigation.enabled.has('purchases');
      const recipesEnabled = navigation.enabled.has('recipes');
      const operationsEnabled = navigation.enabled.has('operations');
      const issuesEnabled = navigation.enabled.has('issues');

      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      // LOC-1 (docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md): fails
      // closed on 0 or more than 1 active location, matching the
      // earlier preview Manager reference surface exactly --
      // never silently falls back to an arbitrary (possibly inactive)
      // location the way this page previously did.
      const activeTenantLocations = tenantLocations.filter((l) => l.isActive);
      const location = activeTenantLocations.length === 1 ? activeTenantLocations[0] : undefined;

      if (!location) {
        return (
          <main style={pageStyle(1180)}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0 }}>Workforce manager</h1>
                <Link href="/dashboard/workforce" style={{ ...backLink, marginTop: 12 }}>
                  Back to Workforce
                </Link>
              </div>
              <SignOutButton />
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>
                {activeTenantLocations.length === 0
                  ? 'No location is configured for this workspace yet.'
                  : 'This workspace has more than one active location. Multi-location management is not supported on this page yet.'}
              </p>
            </section>
          </main>
        );
      }

      // Every permission check this page needs, in ONE `api.my_access` RPC
      // (0142, DEBT-124) instead of five round trips; same answers as the
      // single-check RPCs (pgTAP 0081). Fails closed to all-false.
      const access = await loadMyAccess(supabase, activeTenant.tenantId, location.locationId, {
        location: [MANAGER_ACCESS_PERMISSION, WEEKLY_REVIEW_PERMISSION],
        tenant: [ROLE_MANAGE_PERMISSION],
        anyLocation: [RECIPE_MANAGE_PERMISSION],
      });

      // Authorization boundary for the Manager operational surface: a plain
      // Staff (employee-role) tenant member passes `requireTenantContext`
      // above (they are a valid member) and the module-enabled check, but
      // must never reach the Manager-only data fetch below. `workforce.staff.manage`
      // is the existing permission that already governs every other
      // Manager-only capability in this module -- see `hasManagerAccess`.
      // Denial happens here, before any Manager-only Supabase read, so no
      // protected row ever reaches the RSC payload for an unauthorized caller.
      const managerAccess = access.location(MANAGER_ACCESS_PERMISSION);
      if (!managerAccess) return <UnauthorizedState />;

      // Owner Weekly Review (Cafe v2.2 WP3, migration 0119) -- gates only
      // this dashboard's own entry-point card; `api.weekly_review_summary`
      // re-checks the same `core.weekly_review.view` permission itself.
      const weeklyReviewEnabled = access.location(WEEKLY_REVIEW_PERMISSION);
      // Recipes popup edit controls (tenant-wide or any location). UI gate
      // only -- the recipe write RPCs re-check.
      const recipeCanManage = access.anyLocation(RECIPE_MANAGE_PERMISSION);
      // 4B-4a (0138): only an Owner/Admin (core.role.manage, tenant-wide)
      // is offered 「店長にする / 店長から外す」. UI gate only --
      // api.set_employee_manager_role re-checks the same permission.
      const canAppointManagers = access.tenant(ROLE_MANAGE_PERMISSION);
      // 4B-4b (0140): only the Owner (tenant_owner role) is offered
      // 「管理者にする / 管理者から外す」. UI gate only --
      // api.set_employee_admin_role re-checks the same role.
      const canAppointAdmins = access.isTenantOwner;

      const { weekOffset: rawWeekOffset, popup: rawPopup, focusCell: rawFocusCell } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      const initialPopup =
        rawPopup === 'inventory'
          ? 'inventory'
          : rawPopup === 'recipes'
            ? 'recipes'
            : rawPopup === 'purchases'
              ? 'purchases'
              : rawPopup === 'operations'
                ? 'operations'
                : rawPopup === 'issues'
                  ? 'issues'
                  : rawPopup === 'weekly-review'
                    ? 'weekly-review'
                    : null;
      // `?focusCell=employeeId:workDate`, set by Attention's "View shift"
      // action (manager-dashboard-client.tsx's `handleViewShift`) -- both
      // parts are opaque identifiers to this page (a UUID and an ISO date,
      // neither containing `:`), so splitting on the last `:` is safe. Any
      // malformed value (missing `:`, empty half) is simply ignored -- this
      // is a UX convenience deep-link, not a security boundary, so silently
      // not auto-focusing is the correct failure mode, not an error page.
      const focusCellSeparatorIndex = rawFocusCell?.lastIndexOf(':') ?? -1;
      const initialFocusCell =
        rawFocusCell && focusCellSeparatorIndex > 0 && focusCellSeparatorIndex < rawFocusCell.length - 1
          ? { employeeId: rawFocusCell.slice(0, focusCellSeparatorIndex), workDate: rawFocusCell.slice(focusCellSeparatorIndex + 1) }
          : null;
      const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
      const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
      const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

      // Shift-exchange requests can reference a shift outside the currently
      // viewed week (the manager may be looking at a different weekOffset
      // than the one the request's shift falls in), so the shift lookup for
      // the exchange panel reads the same bounded -8..+8 week window the
      // page's own navigator allows, not just the current week -- mirrors
      // the earlier preview surface's shift-exchange manager window.
      const exchangeWindow = getWeekOffsetWindow(new Date().toISOString(), location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
      const exchangeFromIso = localDateTimeToUtcIso(exchangeWindow.periodStart, '00:00', location.timezone);
      const exchangeToIsoExclusive = localDateTimeToUtcIso(addIsoDays(exchangeWindow.periodEnd, 1), '00:00', location.timezone);

      // Same-day boundary for the Operations "Today" overview, taken in the
      // location's own timezone (not UTC): between 00:00 and 09:00 JST the UTC
      // calendar date is still yesterday, which listed yesterday's tasks as
      // "today" and flagged every one of them overdue.
      const managerToday = todayIsoInTimeZone(location.timezone);
      // Scale fix (QA4): attendance is read for the previous + current month
      // only, never the tenant's whole history -- every consumer of the
      // `attendance` prop is listed on `managerAttendanceLoadRange`. Other
      // months reach the Staff monthly report popup on demand
      // (`loadStaffMonthAttendance`); rows referenced by correction requests
      // outside this window are read by id below.
      const attendanceRange = managerAttendanceLoadRange(managerToday);

      // G1 (0116): read-time materialisation of persistent `critical_missed`
      // exceptions. A critical scheduled check whose window closed with no
      // completion becomes a durable action_required Attention item the next
      // time a Manager evaluates Operations. Idempotent; best-effort -- a
      // failure here must never break the dashboard (the transient
      // `isOverdueCritical` projection flag still covers the state), and it
      // must run BEFORE the dashboard read below (its `operationsOpenExceptions`
      // part) so the feed
      // reflects it on this same load.
      if (operationsEnabled) {
        await flagMissedCriticalExceptions(supabase, activeTenant.tenantId);
      }

      // DEBT-135: every read-only list this dashboard needs comes from ONE
      // `api.manager_dashboard` RPC (0144) instead of ~32 PostgREST requests.
      // Each part is the same read the named lib function made (same view,
      // filters, order and row cap -- pgTAP 0083) mapped by that function's
      // own mappers, so each `*Result` below is the value the lib function
      // would have returned (`loadManagerDashboard` lists them). Module-gated
      // parts are only requested when the module is enabled, and stay `null`
      // otherwise, as before.
      const managerParts: ManagerDashboardPart[] = [
        'staff',
        'lineLinks',
        'shiftTypes',
        'preferenceRequests',
        'assignments',
        'correctionRequests',
        'attendance',
        'invitations',
        'shiftExchanges',
        'exchangeAssignments',
        // Staff<->Manager Mail (0090) -- every non-deleted employee thread's
        // messages, tenant-scoped (RLS `wf_staff_messages_manage_select`
        // narrows this to the caller's manage-permission location). Also the
        // exact data the Mail popup renders below (no separate fetch).
        'staffMessages',
        // Recipes list for the Manager Recipes popup (WP A5b) -- same reads
        // `/recipes/page.tsx` itself makes; recipe detail (ingredients/
        // steps/notes/translations) is fetched lazily, client-side, only
        // once the caller actually opens a specific recipe. The title
        // translations are only *used* below when the recipe list succeeded.
        'recipeCategories',
        'recipes',
        'recipeTitleTranslations',
        // Settings section (WP A8) -- per-weekday staffing requirements + max
        // monthly hours, and the scheduled monthly auto-create run log
        // (DEBT-074): latest rows for this location; the automation block
        // shows up to 3 after dropping problems superseded by a generated run.
        'scheduleSettings',
        'autoScheduleRuns',
        // The caller's own employee profile, for the header account menu's
        // name/position -- same read Staff's page uses. `staffResult` already
        // carries every employee's decrypted `name` (Manager-level roster
        // read), so its `staffId` is matched against `staffResult.data` below.
        'myProfile',
      ];
      // Read-only Inventory catalog for the Attention shortage count and the
      // Inventory popup, `includeInactive: true` (the popup's "Deactivated"
      // tab must find and reactivate a deactivated item; the Staff page's
      // daily count view stays active-only).
      if (inventoryEnabled) managerParts.push('inventoryItems');
      // Purchases' read surface (shopping list, History tab 0120,
      // 「入荷待ち」 awaiting delivery 0137) -- the exact data the Purchases
      // popup renders. Gated on the `purchases` module (0131).
      if (purchasesEnabled) managerParts.push('purchasesNeeded', 'purchaseHistory', 'purchasesAwaiting');
      // Operations popup's entire read surface (Cafe v2.2 WP1).
      if (operationsEnabled) {
        managerParts.push('operationsTemplates', 'operationsItems', 'operationsSchedules', 'operationsTodayTasks', 'operationsOpenExceptions');
      }
      // Issues & Handover popup's entire read surface (Cafe v2.2 WP2).
      if (issuesEnabled) managerParts.push('issuesOpen', 'issuesAll');

      const dashboard = await loadManagerDashboard(supabase, activeTenant.tenantId, location.locationId, {
        parts: managerParts,
        preferenceFromDate: exchangeWindow.periodStart,
        fromIso,
        toIsoExclusive,
        exchangeFromIso,
        exchangeToIsoExclusive,
        attendanceFromDate: attendanceRange.fromDate,
        attendanceToDate: attendanceRange.toDate,
        today: managerToday,
      });
      const staffResult = dashboard.staff;
      const lineLinksResult = dashboard.lineLinks;
      const shiftTypesResult = dashboard.shiftTypes;
      const requestsResult = dashboard.preferenceRequests;
      const assignmentsResult = dashboard.assignments;
      const correctionRequestsResult = dashboard.correctionRequests;
      const attendanceResult = dashboard.attendance;
      const invitationsResult = dashboard.invitations;
      const shiftExchangesResult = dashboard.shiftExchanges;
      const exchangeAssignmentsResult = dashboard.exchangeAssignments;
      const staffMessagesResult = dashboard.staffMessages;
      const inventoryItemsResult = inventoryEnabled ? dashboard.inventoryItems : null;
      const purchasesItemsResult = purchasesEnabled ? dashboard.purchasesNeeded : null;
      const purchaseHistoryResult = purchasesEnabled ? dashboard.purchaseHistory : null;
      const purchasesAwaitingResult = purchasesEnabled ? dashboard.purchasesAwaiting : null;
      const recipeCategoriesResult = dashboard.recipeCategories;
      const recipesResult = dashboard.recipes;
      const scheduleSettingsResult = dashboard.scheduleSettings;
      const recipeTitleTranslationsResult = dashboard.recipeTitleTranslations;
      const myProfileResult = dashboard.myProfile;
      const operationsTemplatesResult = operationsEnabled ? dashboard.operationsTemplates : null;
      const operationsItemsResult = operationsEnabled ? dashboard.operationsItems : null;
      const operationsSchedulesResult = operationsEnabled ? dashboard.operationsSchedules : null;
      const operationsTodayTasksResult = operationsEnabled ? dashboard.operationsTodayTasks : null;
      const operationsOpenExceptionsResult = operationsEnabled ? dashboard.operationsOpenExceptions : null;
      const issuesOpenResult = issuesEnabled ? dashboard.issuesOpen : null;
      const issuesAllResult = issuesEnabled ? dashboard.issuesAll : null;
      const autoScheduleRunsResult = dashboard.autoScheduleRuns;

      // The corrections popup shows each request's current attendance row
      // (looked up by id). A pending request -- or one of the 50 most
      // recently decided ones -- may point at a row older than
      // `attendanceRange`; read just those rows by id (one bounded call,
      // skipped when nothing is missing). Older decided history falls back to
      // the requested change text, as it already did for a missing row.
      let attendance = attendanceResult.status === 'success' ? attendanceResult.data : null;
      if (attendance && correctionRequestsResult.status === 'success') {
        const loadedIds = new Set(attendance.map((a) => a.attendanceId));
        const missingIds = correctionAttendanceIdsToShow(correctionRequestsResult.data).filter((id) => !loadedIds.has(id));
        if (missingIds.length > 0) {
          const extra = await listAttendanceForManager(supabase, activeTenant.tenantId, { attendanceIds: missingIds });
          if (extra.status === 'success') attendance = [...attendance, ...extra.data];
        }
      }

      const recipeGroups =
        recipeCategoriesResult.status === 'success' && recipesResult.status === 'success'
          ? groupRecipesByCategory(recipeCategoriesResult.data, recipesResult.data)
          : null;
      // Title-only translation lookup, same as `/recipes/page.tsx` -- bounded
      // to one field across every recipe rather than loading each recipe's
      // full content just to show a list row. (`recipeTitleTranslationsResult`
      // is fetched in the dashboard batch above -- only
      // *used* here when `recipesResult` succeeded, same gating as before.)
      const recipeTitleTranslations =
        recipesResult.status === 'success' && recipeTitleTranslationsResult.status === 'success' ? recipeTitleTranslationsResult.data : [];
      const recipeTitleFieldByRecipeId: Record<string, RecipeTranslationField> =
        recipesResult.status === 'success'
          ? Object.fromEntries(
              recipesResult.data.map((recipe) => [
                recipe.recipeId,
                buildRecipeTranslationField(
                  'workforce_recipe',
                  recipe.recipeId,
                  'title',
                  recipe.originalLanguage,
                  (recipe.originalLanguage === 'ja' ? recipe.titleJa : recipe.titleEn) ?? '',
                  recipe.originalLanguage === 'ja' ? recipe.titleEn : recipe.titleJa,
                  recipeTitleTranslations,
                ),
              ]),
            )
          : {};
      const recipeMediaUrlByRecipeId =
        recipesResult.status === 'success' ? await createRecipeMediaUrlMap(supabase, recipesResult.data) : {};

      const inventoryMediaUrlByItemId =
        inventoryItemsResult && inventoryItemsResult.status === 'success'
          ? await createInventoryMediaUrlMap(supabase, inventoryItemsResult.data)
          : {};

      // `operations.task.read`/exceptions may be tenant-wide for some roles
      // -- narrow to this Manager's own location here, same convention
      // `/operations/page.tsx`'s own Manager branch used.
      const operationsTodayTasks =
        operationsTodayTasksResult && operationsTodayTasksResult.status === 'success'
          ? operationsTodayTasksResult.data.filter((task) => task.locationId === location.locationId)
          : null;
      const operationsOpenExceptions =
        operationsOpenExceptionsResult && operationsOpenExceptionsResult.status === 'success'
          ? operationsOpenExceptionsResult.data.filter((exception) => exception.locationId === location.locationId)
          : null;

      // `issues.report`/`issues.manage` may be tenant-wide for some roles --
      // narrow to this Manager's own location here, same convention as the
      // Operations reads above. Reporter names come from the already-decrypted
      // Manager roster (`staffResult`), matched on `reporter_employee_id` (0128).
      const reporterNameByEmployeeId = new Map(
        staffResult.status === 'success' ? staffResult.data.map((s) => [s.staffId, s.name] as const) : [],
      );
      const issuesOpen =
        issuesOpenResult && issuesOpenResult.status === 'success'
          ? withReporterNames(
              issuesOpenResult.data.filter((issue) => issue.locationId === location.locationId),
              reporterNameByEmployeeId,
            )
          : null;
      const issuesAll =
        issuesAllResult && issuesAllResult.status === 'success'
          ? withReporterNames(
              issuesAllResult.data.filter((issue) => issue.locationId === location.locationId),
              reporterNameByEmployeeId,
            )
          : null;

      // Header account menu's identity -- `myProfileResult` carries the
      // caller's own `staffId`/`positionLabel` but never a plain-text name
      // (encryption boundary); the decrypted name is looked up from the
      // already-fetched Manager-level roster (`staffResult`) instead of a
      // second read, mirroring the Staff page's own roster-lookup pattern.
      const myProfile = myProfileResult.status === 'success' ? myProfileResult.data : null;
      const myDisplayName =
        myProfile && staffResult.status === 'success'
          ? (staffResult.data.find((s) => s.staffId === myProfile.staffId)?.name ?? null)
          : null;

      return (
        // id + tabIndex=-1: programmatic focus target after the Owner checklist is closed (not in the Tab order).
        <main id="manager-main" tabIndex={-1} style={{ ...pageStyle(1180), outline: 'none' }}>
          <ManagerDashboardClient
            key={activeTenant.tenantId}
            tenantId={activeTenant.tenantId}
            tenantName={activeTenant.tenantName}
            locationName={location.locationName}
            locationId={location.locationId}
            displayName={myDisplayName}
            positionLabel={myProfile?.positionLabel ?? null}
            tenantOptions={toTenantSwitchOptions(result.data.memberships)}
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
            attendance={attendance}
            attendanceRange={attendanceRange}
            invitations={invitationsResult.status === 'success' ? invitationsResult.data : null}
            shiftExchanges={shiftExchangesResult.status === 'success' ? shiftExchangesResult.data : null}
            exchangeAssignments={exchangeAssignmentsResult.status === 'success' ? exchangeAssignmentsResult.data : null}
            staffMessages={staffMessagesResult.status === 'success' ? staffMessagesResult.data : null}
            inventoryEnabled={inventoryEnabled}
            purchasesEnabled={purchasesEnabled}
            recipesEnabled={recipesEnabled}
            moduleOrder={navigation.order}
            packageCodes={packageCodes}
            allergensEnabled={resolvePackageConfig(packageCodes).allergens}
            operationsEnabled={operationsEnabled}
            inventoryItems={inventoryItemsResult && inventoryItemsResult.status === 'success' ? inventoryItemsResult.data : null}
            inventoryMediaUrlByItemId={inventoryMediaUrlByItemId}
            purchasesItems={purchasesItemsResult && purchasesItemsResult.status === 'success' ? purchasesItemsResult.data : null}
            purchaseHistory={purchaseHistoryResult && purchaseHistoryResult.status === 'success' ? purchaseHistoryResult.data : null}
            purchasesAwaiting={purchasesAwaitingResult && purchasesAwaitingResult.status === 'success' ? purchasesAwaitingResult.data : null}
            operationsTemplates={operationsTemplatesResult && operationsTemplatesResult.status === 'success' ? operationsTemplatesResult.data : null}
            operationsItems={operationsItemsResult && operationsItemsResult.status === 'success' ? operationsItemsResult.data : null}
            operationsItemsError={operationsItemsResult ? readErrorMessage(operationsItemsResult) : null}
            operationsSchedules={operationsSchedulesResult && operationsSchedulesResult.status === 'success' ? operationsSchedulesResult.data : null}
            operationsSchedulesError={operationsSchedulesResult ? readErrorMessage(operationsSchedulesResult) : null}
            operationsTodayTasks={operationsTodayTasks}
            operationsOpenExceptions={operationsOpenExceptions}
            issuesEnabled={issuesEnabled}
            issuesOpen={issuesOpen}
            issuesAll={issuesAll}
            weeklyReviewEnabled={weeklyReviewEnabled}
            initialPopup={popupIfModuleEnabled(initialPopup, navigation.enabled)}
            initialFocusCell={initialFocusCell}
            recipeGroups={recipeGroups}
            recipeTitleFieldByRecipeId={recipeTitleFieldByRecipeId}
            recipeMediaUrlByRecipeId={recipeMediaUrlByRecipeId}
            recipeCanManage={recipeCanManage}
            canAppointManagers={canAppointManagers}
            canAppointAdmins={canAppointAdmins}
            selfStaffId={myProfile?.staffId ?? null}
            scheduleSettings={scheduleSettingsResult.status === 'success' ? scheduleSettingsResult.data : null}
            autoScheduleRuns={autoScheduleRunsResult.status === 'success' ? autoScheduleRunsResult.data : null}
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
