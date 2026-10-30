import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { toTenantSwitchOptions } from '@/lib/tenant/switch-options';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { loadPageContext } from '@/lib/tenant/page-context';
import { popupIfModuleEnabled, tenantNavigation } from '@/lib/tenant/module-nav';
import { resolvePackageConfig } from '@/lib/packages/config';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { createInventoryMediaUrlMap, INVENTORY_MANAGE_PERMISSION } from '@/lib/inventory/items';
import { loadMyAccess } from '@/lib/auth/my-access';
import { loadStaffDashboard, type StaffDashboardPart } from '@/lib/staff/dashboard';
import type { OperationsItemResponse } from '@/lib/operations/tasks';
import { withReporterNames } from '@/lib/issues/issues';
import { createRecipeMediaUrlMap, groupRecipesByCategory, RECIPE_MANAGE_PERMISSION } from '@/lib/workforce/recipes';
import { buildRecipeTranslationField, type RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { getWeekOffsetWindow, getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso, todayIsoInTimeZone } from '@/lib/workforce/timezone';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { backLink, card, mutedText, pageStyle } from '@/lib/ui/theme';
import { StaffDashboardClient } from './staff-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'スタッフ', robots: { index: false, follow: false } };

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
      style={{ ...backLink, marginTop: 12 }}
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
  searchParams: Promise<{ weekOffset?: string; popup?: string }>;
}) {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      // DEBT-135: navigation, packages and locations come from the same
      // request-scoped page context `requireTenantContext` already loaded
      // (one `api.my_page_context` RPC) -- no further round trip here.
      const pageContext = await loadPageContext();
      const navigationResult = pageContext.navigation;
      const packageCodes = pageContext.packageCodes(activeTenant.tenantId);
      // Enabled modules of the active tenant, in package order (0132, task
      // P4), same as `manager/page.tsx`. The flags below gate only this
      // page's entry points and their reads; RLS / RPCs
      // (`core.has_module_access`) remain the real authorization boundary.
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
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0 }}>スタッフ</h1>
                <BackLink />
              </div>
              <SignOutButton />
            </header>
            <section style={card}>
              {/* Rendered before StaffDashboardClient/LangProvider mounts (no lang context yet); LangProvider's own default is 'ja' (lib/demo/cafe/i18n.tsx), so this shows JA first with EN underneath rather than defaulting to English-only. */}
              <p style={{ margin: 0, ...mutedText }}>
                このテナントのスタッフプロフィールがまだ登録されていません。店長に追加を依頼してください。
              </p>
              <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 13 }}>
                You do not have a staff profile for this tenant yet. Ask your manager to add you.
              </p>
            </section>
          </main>
        );
      }
      const profile = profileResult.data;

      const locationsResult = pageContext.locations;
      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      // LOC-1 (docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md): fails
      // closed on the employee's own location being missing or inactive,
      // matching the earlier preview reference surface -- never
      // silently substitutes a different active location, which would show
      // this Staff member schedule/shift-type data for a location they
      // aren't actually assigned to (same-tenant only, not a tenant-isolation
      // break, but still the wrong data).
      const location = tenantLocations.find((l) => l.locationId === profile.locationId && l.isActive);

      if (!location) {
        const jaMessage =
          tenantLocations.length === 0
            ? 'このワークスペースにはまだ店舗が設定されていません。'
            : '割り当てられた店舗を利用できません。店長にご確認ください。';
        const enMessage =
          tenantLocations.length === 0
            ? 'No location is configured for this workspace yet.'
            : 'Your assigned location is not available. Ask your manager for help.';
        return (
          <main style={pageStyle(720)}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0 }}>スタッフ</h1>
                <BackLink />
              </div>
              <SignOutButton />
            </header>
            <section style={card}>
              {/* See the no-profile branch above for why this is bilingual JA-first, not a lang-context lookup. */}
              <p style={{ margin: 0, ...mutedText }}>{jaMessage}</p>
              <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 13 }}>{enMessage}</p>
            </section>
          </main>
        );
      }

      const { weekOffset: rawWeekOffset, popup: rawPopup } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      // `?popup=recipes`/`?popup=inventory` deep-link parity with Manager's
      // equivalent (`manager/page.tsx`) -- the Recipes/Inventory entry-point
      // buttons below open the same popups client-side too, this just lets a
      // bookmark/shared link (or `/inventory`'s own redirect) land straight
      // on the right one already open.
      const initialPopup =
        rawPopup === 'recipes'
          ? 'recipes'
          : rawPopup === 'inventory'
            ? 'inventory'
            : rawPopup === 'purchases'
              ? 'purchases'
              : rawPopup === 'operations'
                ? 'operations'
                : rawPopup === 'issues'
                  ? 'issues'
                  : null;
      // Same-day boundary for the Staff Operations task list, taken in the
      // location's own timezone (not UTC) -- see the Manager page.
      const operationsToday = todayIsoInTimeZone(location.timezone);
      const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);

      // Full ±MAX_WEEK_OFFSET assignment window (not just the displayed
      // week), tenant/location-wide (every employee, not just the caller) --
      // mirrors the earlier preview Staff page's initial load, so
      // the coworker-roster/self-pin view below has a stable, week-independent
      // roster instead of one that changes shape as the caller navigates
      // weeks. Other employees' shift rows are read here only to build this
      // roster/schedule grid; RLS on `api.workforce_shift_assignments` still
      // enforces that a plain Staff reader only ever sees `published` rows,
      // never a manager's draft.
      const assignmentWindow = getWeekOffsetWindow(new Date().toISOString(), location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
      const assignmentFromIso = localDateTimeToUtcIso(assignmentWindow.periodStart, '00:00', location.timezone);
      const assignmentToIsoExclusive = localDateTimeToUtcIso(addIsoDays(assignmentWindow.periodEnd, 1), '00:00', location.timezone);

      // Every read of this page in ONE `api.staff_dashboard` RPC (0145,
      // DEBT-135) -- each part is the same read the named lib function made
      // (see `lib/staff/dashboard.ts`), and the exact data its popup renders
      // (no separate fetch, same pattern as the Manager page):
      //   * myStaffMessages -- Staff<->Manager Mail (0090), the caller's own
      //     single thread (`StaffMailPopup`).
      //   * staffRoster -- real display names for the caller's own profile
      //     header and the coworker schedule grid (Cafe v2.1 QA audit P2-7,
      //     `api.workforce_staff_roster`, 0061); RLS narrows it to the
      //     caller's own row plus active coworkers in their schedule scope.
      //   * recipes -- the Staff Recipes popup list (Founder direction,
      //     2026-08-24: matches Manager's popup); recipe detail is fetched
      //     lazily, client-side, once a specific recipe opens.
      //   * Module-gated parts are requested only when the module is on:
      //     Inventory, Purchases (needed / History tab 0120 / 「入荷待ち」 0137;
      //     0131, depends on `inventory`), Operations (today's tasks, template
      //     items and their recorded responses -- `operations.task.read` may be
      //     tenant-wide for some roles, narrowed to this location below,
      //     mirroring `/operations/page.tsx`'s Staff branch), Issues &
      //     Handover (Cafe v2.2 WP2, Slice C; Staff has no manage rights in
      //     this MVP, so only the open `api.issues_open` feed).
      const dashboardParts: StaffDashboardPart[] = [
        'shiftTypes',
        'myPreferenceRequests',
        'assignments',
        'myAttendance',
        'myCorrectionRequests',
        'shiftExchanges',
        'myStaffMessages',
        'staffRoster',
        'recipeCategories',
        'recipes',
        'recipeTitleTranslations',
      ];
      if (inventoryEnabled) dashboardParts.push('inventoryItems');
      if (purchasesEnabled) dashboardParts.push('purchasesNeeded', 'purchaseHistory', 'purchasesAwaiting');
      if (operationsEnabled) dashboardParts.push('operationsTodayTasks', 'operationsItems', 'operationsResponses');
      if (issuesEnabled) dashboardParts.push('issuesOpen');

      const [dashboard, access] = await Promise.all([
        loadStaffDashboard(supabase, activeTenant.tenantId, location.locationId, {
          parts: dashboardParts,
          fromIso: assignmentFromIso,
          toIsoExclusive: assignmentToIsoExclusive,
          today: operationsToday,
          employeeId: profile.staffId,
        }),
        // This page's permission checks in ONE `api.my_access` RPC (0142,
        // DEBT-124) instead of one round trip each. Fails closed.
        loadMyAccess(supabase, activeTenant.tenantId, location.locationId, {
          location: [INVENTORY_MANAGE_PERMISSION],
          anyLocation: [RECIPE_MANAGE_PERMISSION],
        }),
      ]);
      const shiftTypesResult = dashboard.shiftTypes;
      const requestsResult = dashboard.myPreferenceRequests;
      const assignmentsResult = dashboard.assignments;
      const attendanceResult = dashboard.myAttendance;
      const correctionRequestsResult = dashboard.myCorrectionRequests;
      const exchangesResult = dashboard.shiftExchanges;
      const staffMessagesResult = dashboard.myStaffMessages;
      const inventoryItemsResult = inventoryEnabled ? dashboard.inventoryItems : null;
      const purchasesItemsResult = purchasesEnabled ? dashboard.purchasesNeeded : null;
      const purchaseHistoryResult = purchasesEnabled ? dashboard.purchaseHistory : null;
      const purchasesAwaitingResult = purchasesEnabled ? dashboard.purchasesAwaiting : null;
      const rosterResult = dashboard.staffRoster;
      const recipeCategoriesResult = dashboard.recipeCategories;
      const recipesResult = dashboard.recipes;
      const recipeTitleTranslationsResult = dashboard.recipeTitleTranslations;
      const operationsTasksResult = operationsEnabled ? dashboard.operationsTodayTasks : null;
      const operationsItemsResult = operationsEnabled ? dashboard.operationsItems : null;
      const issuesOpenResult = issuesEnabled ? dashboard.issuesOpen : null;

      // Pure UX affordance (RLS is the real boundary regardless): almost
      // always false for a plain staff account, but resolved from the real
      // permission rather than hardcoded so a staff member who does hold
      // `inventory.item.manage` still sees catalog-management controls.
      const inventoryCanManage = inventoryEnabled && access.location(INVENTORY_MANAGE_PERMISSION);
      const recipeCanManage = access.anyLocation(RECIPE_MANAGE_PERMISSION);

      const staffNameById: Record<string, string> =
        rosterResult.status === 'success'
          ? Object.fromEntries(rosterResult.data.map((entry) => [entry.employeeId, entry.name]))
          : {};

      // `listShiftAssignments` is shared with the manager view and returns
      // every employee's rows at this location -- narrow to this location and
      // to published rows here, server-side, before anything is sent to the
      // browser (the roster/self-pin view needs every published employee row,
      // not just the caller's own, unlike the previous self-only table).
      const locationAssignments =
        assignmentsResult.status === 'success'
          ? assignmentsResult.data.filter((a) => a.published && a.locationId === location.locationId)
          : null;

      // Same derivation as `manager/page.tsx` -- see its comments for why.
      const recipeGroups =
        recipeCategoriesResult.status === 'success' && recipesResult.status === 'success'
          ? groupRecipesByCategory(recipeCategoriesResult.data, recipesResult.data)
          : null;
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

      // "Who last counted this" in the Inventory popup only ever resolves to
      // a real display name when this caller can manage the catalog --
      // mirrors `/inventory/page.tsx`'s own gating exactly, reusing the same
      // manager-only decrypted staff directory rather than a new PII surface.
      const inventoryStaffNameById = new Map<string, string>();
      if (inventoryCanManage) {
        const staffResult = await listWorkforceStaffForManager(supabase, activeTenant.tenantId);
        if (staffResult.status === 'success') {
          for (const entry of staffResult.data) inventoryStaffNameById.set(entry.staffId, entry.name);
        }
      }
      const inventoryMediaUrlByItemId =
        inventoryItemsResult && inventoryItemsResult.status === 'success'
          ? await createInventoryMediaUrlMap(supabase, inventoryItemsResult.data)
          : {};

      // "Bought by" in the Purchases popup follows the exact same
      // manager-only gating as Inventory's "counted by" line above -- reuses
      // the same `inventoryCanManage`-resolved directory rather than a
      // second decrypted-staff-directory read.
      const purchasesStaffNameById = inventoryCanManage ? Object.fromEntries(inventoryStaffNameById) : {};

      // `operations.task.read` may be tenant-wide for some roles -- narrow to
      // this Staff member's own location here, same convention
      // `/operations/page.tsx`'s own Staff branch used.
      const operationsTasks =
        operationsTasksResult && operationsTasksResult.status === 'success'
          ? operationsTasksResult.data.filter((task) => task.locationId === location.locationId)
          : null;

      // Every already-materialised task's recorded responses, read in the
      // same RPC (`operationsResponses`: responses of today's task instances
      // at this location) and keyed by `instanceId`, every instance present.
      // Any write action calls `router.refresh()`, which re-runs this whole
      // page and refetches it.
      const operationsInstanceIds = (operationsTasks ?? [])
        .map((task) => task.instanceId)
        .filter((id): id is string => id !== null);
      const operationsResponsesResult = operationsEnabled ? dashboard.operationsResponses : null;
      const operationsResponsesByInstanceId: Record<string, OperationsItemResponse[]> = Object.fromEntries(
        operationsInstanceIds.map((id) => [
          id,
          operationsResponsesResult?.status === 'success' ? (operationsResponsesResult.data[id] ?? []) : [],
        ]),
      );

      // `issues.report` may be tenant-wide for some roles -- narrow to this
      // Staff member's own location here, same convention as the Operations
      // reads above and `manager/page.tsx`'s own `issuesOpen` filter. LOC-1:
      // Staff always has exactly one resolved `location` by this point (see
      // the fail-closed branch above), never a caller-chosen location.
      // Reporter names come from the same coworker roster the schedule grid
      // already shows (`staffNameById`, 0061), matched on `reporter_employee_id`
      // (0128); anyone outside it keeps the role label.
      const issuesOpen =
        issuesOpenResult && issuesOpenResult.status === 'success'
          ? withReporterNames(
              issuesOpenResult.data.filter((issue) => issue.locationId === location.locationId),
              new Map(Object.entries(staffNameById)),
            )
          : null;

      return (
        <main style={pageStyle(1000)}>
          <StaffDashboardClient
            key={activeTenant.tenantId}
            tenantId={activeTenant.tenantId}
            tenantName={activeTenant.tenantName}
            locationName={location.locationName}
            timeZone={location.timezone}
            periodStart={periodStart}
            periodEnd={periodEnd}
            weekOffset={weekOffset}
            profile={profile}
            displayName={staffNameById[profile.staffId] ?? null}
            tenantOptions={toTenantSwitchOptions(result.data.memberships)}
            staffNameById={staffNameById}
            shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
            requests={requestsResult.status === 'success' ? requestsResult.data : null}
            assignments={locationAssignments}
            attendance={attendanceResult.status === 'success' ? attendanceResult.data : null}
            correctionRequests={correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null}
            exchanges={exchangesResult.status === 'success' ? exchangesResult.data : null}
            staffMessages={staffMessagesResult.status === 'success' ? staffMessagesResult.data : null}
            inventoryEnabled={inventoryEnabled}
            purchasesEnabled={purchasesEnabled}
            recipesEnabled={recipesEnabled}
            moduleOrder={navigation.order}
            packageCodes={packageCodes}
            allergensEnabled={resolvePackageConfig(packageCodes).allergens}
            operationsEnabled={operationsEnabled}
            inventoryItems={inventoryItemsResult && inventoryItemsResult.status === 'success' ? inventoryItemsResult.data : null}
            inventoryCanManage={inventoryCanManage}
            inventoryMediaUrlByItemId={inventoryMediaUrlByItemId}
            inventoryStaffNameById={Object.fromEntries(inventoryStaffNameById)}
            purchasesItems={purchasesItemsResult && purchasesItemsResult.status === 'success' ? purchasesItemsResult.data : null}
            purchaseHistory={purchaseHistoryResult && purchaseHistoryResult.status === 'success' ? purchaseHistoryResult.data : null}
            purchasesAwaiting={purchasesAwaitingResult && purchasesAwaitingResult.status === 'success' ? purchasesAwaitingResult.data : null}
            purchasesStaffNameById={purchasesStaffNameById}
            operationsTasks={operationsTasks}
            operationsItems={operationsItemsResult && operationsItemsResult.status === 'success' ? operationsItemsResult.data : null}
            operationsResponsesByInstanceId={operationsResponsesByInstanceId}
            operationsBusinessDate={operationsToday}
            issuesEnabled={issuesEnabled}
            issuesOpen={issuesOpen}
            recipeGroups={recipeGroups}
            recipeTitleFieldByRecipeId={recipeTitleFieldByRecipeId}
            recipeMediaUrlByRecipeId={recipeMediaUrlByRecipeId}
            recipeCanManage={recipeCanManage}
            initialPopup={popupIfModuleEnabled(initialPopup, navigation.enabled)}
            locationId={location.locationId}
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
