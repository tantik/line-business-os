import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { listEmployeeLineLinks } from '@/lib/workforce/employee-line-links';
import { listWorkforceEmployeeInvitations } from '@/lib/workforce/invitations';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { getWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import { getWeekPeriod, getWeekOffsetWindow } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { createRecipeMediaUrlMap, groupRecipesByCategory, hasRecipeManagerAccess, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForField } from '@/lib/content/translations';
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

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Manager', robots: { index: false, follow: false } };

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
      // performance: `listTenantModules` and `listTenantLocations` don't
      // depend on each other (module-enablement flags vs. the tenant's
      // locations) -- they were two sequential round trips before this page
      // even started its main data batch below, on every single request
      // including a plain Prev/Next-week click. One of several fixes in this
      // pass; see this file's own note further down for why the deeper fix
      // (not re-running the *whole* page's unrelated data on a week change)
      // is out of scope for this pass.
      const [modulesResult, locationsResult] = await Promise.all([listTenantModules(supabase), listTenantLocations(supabase)]);
      const workforceEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) =>
            module.tenantId === activeTenant.tenantId &&
            module.module === 'workforce' &&
            module.isEnabled,
        );

      if (!workforceEnabled) return <ModuleUnavailableState />;

      // `inventory` is a separate top-level module (ADR 0010) from
      // `workforce` -- reuses the already-fetched `modulesResult` rather
      // than a second `listTenantModules` call. Gates only the Manager
      // Attention layer's inventory-shortage line (Mission 2); the real
      // Inventory page/RLS remain the authorization boundary regardless of
      // this flag. Mirrors the identical pattern already used by the
      // canonical Staff page for its own Inventory entry-point card.
      const inventoryEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) => module.tenantId === activeTenant.tenantId && module.module === 'inventory' && module.isEnabled,
        );

      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      // LOC-1 (docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md): fails
      // closed on 0 or more than 1 active location, matching the
      // `_client-preview/mame-to-cha/manager` reference surface exactly --
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

      const { weekOffset: rawWeekOffset, popup: rawPopup, focusCell: rawFocusCell } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      const initialPopup = rawPopup === 'inventory' ? 'inventory' : rawPopup === 'recipes' ? 'recipes' : null;
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
        inventoryItemsResult,
        recipeCategoriesResult,
        recipesResult,
        recipeCanManage,
        scheduleSettingsResult,
        recipeTitleTranslationsResult,
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
        // Read-only, for the Manager Attention layer's shortage count
        // (Mission 2) -- the actual Inventory catalog/count-entry UI is not
        // duplicated here; it stays on its own canonical `/dashboard/inventory`
        // page (shared Staff+Manager, RLS-scoped), which the Attention item
        // links to. Mirrors the identical fetch already on the Staff page.
        // `includeInactive: true` -- this is the Manager's own catalog view
        // (the Inventory popup's "Deactivated" tab), which needs to be able
        // to find and reactivate a deactivated item, not just the daily
        // count view the Staff page's identical fetch stays scoped to
        // (`includeInactive` defaults false there, correctly).
        inventoryEnabled
          ? listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId, { includeInactive: true })
          : Promise.resolve(null),
        // Recipes list for the Manager Recipes popup (WP A5b) -- same reads
        // `/recipes/page.tsx` itself makes; recipe detail (ingredients/
        // steps/notes/translations) is fetched lazily, client-side, only
        // once the caller actually opens a specific recipe.
        listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
        listWorkforceRecipes(supabase, activeTenant.tenantId),
        hasRecipeManagerAccess(supabase, activeTenant.tenantId),
        // Settings section (WP A8) -- per-weekday staffing requirements + max
        // monthly hours. Already had full schema/read/write support
        // (schedule-settings.ts); no migration needed.
        getWorkforceScheduleSettings(supabase, activeTenant.tenantId, location.locationId),
        // Week-navigation performance (Founder Review Round 2, 2026-08-22):
        // this used to be a separate `await` AFTER the batch above, gated on
        // `recipesResult.status === 'success'` -- but it only ever needs
        // `tenantId`/entity-type/field (see `listContentTranslationsForField`),
        // never the resolved recipe list itself, so there was never a real
        // ordering dependency -- just an unnecessary extra sequential round
        // trip on every request. Its result is still only *used* below when
        // `recipesResult` succeeded, same as before.
        listContentTranslationsForField(supabase, activeTenant.tenantId, 'workforce_recipe', 'title'),
      ]);

      const recipeGroups =
        recipeCategoriesResult.status === 'success' && recipesResult.status === 'success'
          ? groupRecipesByCategory(recipeCategoriesResult.data, recipesResult.data)
          : null;
      // Title-only translation lookup, same as `/recipes/page.tsx` -- bounded
      // to one field across every recipe rather than loading each recipe's
      // full content just to show a list row. (`recipeTitleTranslationsResult`
      // is now fetched inside the main Promise.all batch above -- only
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

      return (
        <main style={pageStyle(1180)}>
          <ManagerDashboardClient
            tenantName={activeTenant.tenantName}
            locationName={location.locationName}
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
            inventoryEnabled={inventoryEnabled}
            inventoryItems={inventoryItemsResult && inventoryItemsResult.status === 'success' ? inventoryItemsResult.data : null}
            initialPopup={initialPopup}
            initialFocusCell={initialFocusCell}
            recipeGroups={recipeGroups}
            recipeTitleFieldByRecipeId={recipeTitleFieldByRecipeId}
            recipeMediaUrlByRecipeId={recipeMediaUrlByRecipeId}
            recipeCanManage={recipeCanManage}
            scheduleSettings={scheduleSettingsResult.status === 'success' ? scheduleSettingsResult.data : null}
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
