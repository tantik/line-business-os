import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/context';
import { SignOutButton } from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { listWorkforceStaffRoster } from '@/lib/workforce/employees';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listMyShiftRequests } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { listMyAttendance } from '@/lib/workforce/attendance';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { listWorkforceRecipeCategories } from '@/lib/workforce/recipe-categories';
import { createRecipeMediaUrlMap, groupRecipesByCategory, hasRecipeManagerAccess, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForField } from '@/lib/content/translations';
import { buildRecipeTranslationField, type RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { getWeekOffsetWindow, getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
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

export const metadata: Metadata = { title: 'Staff', robots: { index: false, follow: false } };

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

      // `inventory` is a separate top-level module (ADR 0010) from `workforce`
      // -- re-uses the already-fetched `modulesResult` rather than a second
      // `listTenantModules` call. Gates only whether the Inventory
      // entry-point card below renders; the real Inventory page/RLS remain
      // the authorization boundary regardless of this flag.
      const inventoryEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) => module.tenantId === activeTenant.tenantId && module.module === 'inventory' && module.isEnabled,
        );

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
                <h1 style={{ margin: 0 }}>Workforce staff</h1>
                <BackLink />
              </div>
              <SignOutButton />
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
      // LOC-1 (docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md): fails
      // closed on the employee's own location being missing or inactive,
      // matching the `_client-preview/mame-to-cha` reference surface -- never
      // silently substitutes a different active location, which would show
      // this Staff member schedule/shift-type data for a location they
      // aren't actually assigned to (same-tenant only, not a tenant-isolation
      // break, but still the wrong data).
      const location = tenantLocations.find((l) => l.locationId === profile.locationId && l.isActive);

      if (!location) {
        return (
          <main style={pageStyle(720)}>
            <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <h1 style={{ margin: 0 }}>Workforce staff</h1>
                <BackLink />
              </div>
              <SignOutButton />
            </header>
            <section style={card}>
              <p style={{ margin: 0, ...mutedText }}>
                {tenantLocations.length === 0
                  ? 'No location is configured for this workspace yet.'
                  : 'Your assigned location is not available. Ask your manager for help.'}
              </p>
            </section>
          </main>
        );
      }

      const { weekOffset: rawWeekOffset, popup: rawPopup } = await searchParams;
      const weekOffset = parseWeekOffset(rawWeekOffset);
      // `?popup=recipes` deep-link parity with Manager's equivalent
      // (`manager/page.tsx`) -- the Recipes entry-point button below opens
      // the same popup client-side too, this just lets a bookmark/shared
      // link land straight on it already open.
      const initialPopup = rawPopup === 'recipes' ? 'recipes' : null;
      const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);

      // Full ±MAX_WEEK_OFFSET assignment window (not just the displayed
      // week), tenant/location-wide (every employee, not just the caller) --
      // mirrors `_client-preview`'s `mame-to-cha/page.tsx` initial load, so
      // the coworker-roster/self-pin view below has a stable, week-independent
      // roster instead of one that changes shape as the caller navigates
      // weeks. Other employees' shift rows are read here only to build this
      // roster/schedule grid; RLS on `api.workforce_shift_assignments` still
      // enforces that a plain Staff reader only ever sees `published` rows,
      // never a manager's draft.
      const assignmentWindow = getWeekOffsetWindow(new Date().toISOString(), location.timezone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
      const assignmentFromIso = localDateTimeToUtcIso(assignmentWindow.periodStart, '00:00', location.timezone);
      const assignmentToIsoExclusive = localDateTimeToUtcIso(addIsoDays(assignmentWindow.periodEnd, 1), '00:00', location.timezone);

      const [
        shiftTypesResult,
        requestsResult,
        assignmentsResult,
        attendanceResult,
        correctionRequestsResult,
        exchangesResult,
        inventoryItemsResult,
        rosterResult,
        recipeCategoriesResult,
        recipesResult,
        recipeCanManage,
        recipeTitleTranslationsResult,
      ] = await Promise.all([
        listWorkforceShiftTypes(supabase, activeTenant.tenantId),
        listMyShiftRequests(supabase, activeTenant.tenantId, { kind: 'preference' }),
        listShiftAssignments(supabase, activeTenant.tenantId, {
          fromIso: assignmentFromIso,
          toIsoExclusive: assignmentToIsoExclusive,
        }),
        listMyAttendance(supabase, activeTenant.tenantId),
        listMyShiftRequests(supabase, activeTenant.tenantId, { kind: 'correction' }),
        listShiftExchanges(supabase, activeTenant.tenantId, location.locationId),
        // Read-only, for the shortage-aware entry-point card below -- the
        // actual Inventory catalog/count-entry UI is not duplicated here; it
        // stays on its own canonical `/dashboard/inventory` page (shared
        // Staff+Manager, RLS-scoped), which this card links to.
        inventoryEnabled
          ? listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId)
          : Promise.resolve(null),
        // Real display names for the caller's own profile header and the
        // coworker schedule grid (Cafe v2.1 QA audit P2-7, `api.workforce_staff_roster`,
        // 0061) -- RLS narrows this to the caller's own row plus active
        // coworkers in the caller's own tenant/location schedule scope.
        listWorkforceStaffRoster(supabase, activeTenant.tenantId),
        // Recipes list for the Staff Recipes popup (Founder direction,
        // 2026-08-24: matches Manager's popup, same reads `/recipes/page.tsx`
        // and `manager/page.tsx` both already make) -- recipe detail is
        // fetched lazily, client-side, only once a specific recipe opens.
        listWorkforceRecipeCategories(supabase, activeTenant.tenantId),
        listWorkforceRecipes(supabase, activeTenant.tenantId),
        hasRecipeManagerAccess(supabase, activeTenant.tenantId),
        listContentTranslationsForField(supabase, activeTenant.tenantId, 'workforce_recipe', 'title'),
      ]);

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

      return (
        <main style={pageStyle(1000)}>
          <StaffDashboardClient
            tenantName={activeTenant.tenantName}
            locationName={location.locationName}
            timeZone={location.timezone}
            periodStart={periodStart}
            periodEnd={periodEnd}
            weekOffset={weekOffset}
            profile={profile}
            displayName={staffNameById[profile.staffId] ?? null}
            staffNameById={staffNameById}
            shiftTypes={shiftTypesResult.status === 'success' ? shiftTypesResult.data : null}
            requests={requestsResult.status === 'success' ? requestsResult.data : null}
            assignments={locationAssignments}
            attendance={attendanceResult.status === 'success' ? attendanceResult.data : null}
            correctionRequests={correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null}
            exchanges={exchangesResult.status === 'success' ? exchangesResult.data : null}
            inventoryEnabled={inventoryEnabled}
            inventoryItems={inventoryItemsResult && inventoryItemsResult.status === 'success' ? inventoryItemsResult.data : null}
            recipeGroups={recipeGroups}
            recipeTitleFieldByRecipeId={recipeTitleFieldByRecipeId}
            recipeMediaUrlByRecipeId={recipeMediaUrlByRecipeId}
            recipeCanManage={recipeCanManage}
            initialPopup={initialPopup}
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
