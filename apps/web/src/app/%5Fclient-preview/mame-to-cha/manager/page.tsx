import { BrandProvider, MAME_TO_CHA_BRAND } from '@/lib/demo/brand';
import { CafeManagerScreen } from '@/components/demo/cafe/CafeManagerScreen';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { PreviewBackToTopLink } from '@/lib/preview/preview-back-to-top-link';
import { listTenantModules } from '@/lib/tenant/modules';
import { listInventoryItemStatus } from '@/lib/inventory/items';
import { PreviewInventoryManagerPanel } from '@/lib/preview/preview-inventory-manager-panel';
import { createClient } from '@/lib/supabase/server';
import { requirePreviewUser } from '@/lib/preview/auth';
import { resolvePreviewTenantContext } from '@/lib/preview/tenant';
import { resolvePreviewWorkforceModule } from '@/lib/preview/module-guard';
import { resolveManagerLocation } from '@/lib/preview/location';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listWorkforceStaffForManager } from '@/lib/workforce/employees';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listAttendanceForManager } from '@/lib/workforce/attendance';
import { getWorkforceRecipeDetail, listWorkforceRecipes } from '@/lib/workforce/recipes';
import { listContentTranslationsForEntities } from '@/lib/content/translations';
import {
  buildRecipeTranslationWorkspace,
  flattenRecipeTranslationFields,
  type RecipeTranslationWorkspace,
} from '@/lib/content/recipe-translation-workspace';
import { getWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  PreviewErrorState,
  PreviewLocationBlockedState,
  PreviewModuleUnavailableState,
  PreviewNoAccessState,
} from '@/lib/preview/states';
import { PREVIEW_BASE_PATH } from '@/lib/preview/constants';
import { toManagerViewAlerts } from '@/lib/preview/manager-view-model';
import { PreviewManagerView } from '@/lib/preview/manager-view';
import { PreviewScheduleCardActions } from '@/lib/preview/preview-schedule-card-actions';
import { PreviewStaffRecipeManagement } from '@/lib/preview/preview-staff-recipe-management';
import { PreviewSettingsCard } from '@/lib/preview/preview-settings-card';
import { PreviewCorrectionRequestsPanel } from '@/lib/preview/preview-correction-requests-panel';
import { authorizePreviewManagerPage } from '@/lib/preview/manager-page-authorize';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { PreviewShiftExchangeManagerPanel } from '@/lib/preview/preview-shift-exchange-manager-panel';
import { PreviewManagerToday } from '@/lib/preview/preview-manager-today';
import { listInventoryCheckSessions } from '@/lib/inventory/check-sessions';

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

  // Page-level authorization must run before any tenant-wide manager loader
  // or manager action form is rendered. Server Actions repeat their own
  // permission checks, but that does not protect the page's read surface.
  if (!(await authorizePreviewManagerPage())) return <PreviewNoAccessState variant="light" />;

  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') return <PreviewNoAccessState variant="light" />;

  const { activeTenant } = tenantResult.data;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, activeTenant.tenantId);
  if (moduleResult.status === 'disabled') return <PreviewModuleUnavailableState variant="light" />;
  if (moduleResult.status !== 'enabled') return <PreviewErrorState variant="light" />;

  const locationsResult = await listTenantLocations(supabase);
  const tenantLocations =
    locationsResult.status === 'success'
      ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
      : [];
  const locationResult = resolveManagerLocation(tenantLocations);
  if (locationResult.kind !== 'ok') return <PreviewLocationBlockedState reason={locationResult.kind} variant="light" />;
  const location = locationResult.location;

  const { weekOffset: rawWeekOffset } = await searchParams;
  const weekOffset = parseWeekOffset(rawWeekOffset);
  const { periodStart, periodEnd } = getWeekPeriod(new Date().toISOString(), location.timezone, weekOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

  const [
    staffResult,
    shiftTypesResult,
    assignmentsResult,
    correctionRequestsResult,
    attendanceResult,
    recipesResult,
    settingsResult,
  ] = await Promise.all([
    listWorkforceStaffForManager(supabase, activeTenant.tenantId),
    listWorkforceShiftTypes(supabase, activeTenant.tenantId),
    listShiftAssignments(supabase, activeTenant.tenantId, { fromIso, toIsoExclusive }),
    listShiftRequestsForManager(supabase, activeTenant.tenantId, { kind: 'correction' }),
    listAttendanceForManager(supabase, activeTenant.tenantId),
    listWorkforceRecipes(supabase, activeTenant.tenantId),
    getWorkforceScheduleSettings(supabase, activeTenant.tenantId, location.locationId),
  ]);

  const modulesResult = await listTenantModules(supabase);
  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === activeTenant.tenantId && m.module === 'inventory' && m.isEnabled);
  const inventoryItemsResult = inventoryEnabled
    ? await listInventoryItemStatus(supabase, activeTenant.tenantId, location.locationId, { includeInactive: true })
    : null;
  const exchangesResult = await listShiftExchanges(supabase, activeTenant.tenantId, location.locationId);
  const allAssignmentsResult = await listShiftAssignments(supabase, activeTenant.tenantId);
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const inventorySessionsResult = inventoryEnabled
    ? await listInventoryCheckSessions(supabase, activeTenant.tenantId, location.locationId, todayIso)
    : null;
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
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const shiftTypes = shiftTypesResult.status === 'success' ? shiftTypesResult.data : null;
  const assignments = assignmentsResult.status === 'success' ? assignmentsResult.data : null;
  const correctionRequests = correctionRequestsResult.status === 'success' ? correctionRequestsResult.data : null;
  const attendance = attendanceResult.status === 'success' ? attendanceResult.data : null;
  const recipes = recipesResult.status === 'success' ? recipesResult.data : null;
  const settings = settingsResult.status === 'success' ? settingsResult.data : null;

  // Preloaded per-recipe translation workspace (Japanese original + legacy
  // *_en columns + content.translations rows), server-side, same
  // "everything loaded up front" style as every other section of this page
  // -- the Manager translation panel (a client island) never fetches this
  // itself.
  const translationWorkspaces: Record<string, RecipeTranslationWorkspace> = {};
  if (recipes) {
    await Promise.all(
      recipes.map(async (recipe) => {
        const detailResult = await getWorkforceRecipeDetail(supabase, activeTenant.tenantId, recipe.recipeId);
        if (detailResult.status !== 'success' || !detailResult.data) return;
        const fieldsForLookup = flattenRecipeTranslationFields(
          buildRecipeTranslationWorkspace(detailResult.data, []),
        );
        const translationsResult = await listContentTranslationsForEntities(
          supabase,
          activeTenant.tenantId,
          fieldsForLookup.map((f) => ({ sourceEntityType: f.sourceEntityType, sourceEntityId: f.sourceEntityId })),
        );
        const translations = translationsResult.status === 'success' ? translationsResult.data : [];
        translationWorkspaces[recipe.recipeId] = buildRecipeTranslationWorkspace(detailResult.data, translations);
      }),
    );
  }

  const pendingCorrections = (correctionRequests ?? []).filter((r) => r.status === 'pending');
  const decidedCorrections = (correctionRequests ?? [])
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);
  const managerAlerts = correctionRequestsResult.status === 'success' ? toManagerViewAlerts(pendingCorrections, staffById) : [];
  const pendingExchanges =
    exchangesResult.status === 'success'
      ? exchangesResult.data.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted')
      : [];
  const staleRecipeFields = Object.values(translationWorkspaces)
    .flatMap((workspace) => workspace.sections)
    .flatMap((section) => section.fields)
    .filter((field) => field.isStale || (!field.existing && !field.legacyEnText)).length;
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

  return (
    <BrandProvider brand={MAME_TO_CHA_BRAND}>
      <CafeManagerScreen
        subtitle={location.locationName.startsWith(activeTenant.tenantName) ? location.locationName : `${activeTenant.tenantName} — ${location.locationName}`}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <PreviewBackToTopLink href={PREVIEW_BASE_PATH} />
          </div>
        }
        alerts={managerAlerts}
        alertActions={
          <PreviewCorrectionRequestsPanel
            timeZone={location.timezone}
            pendingRequests={pendingCorrections}
            decidedRequests={decidedCorrections}
            staff={staff}
            attendance={attendance}
          />
        }
      >
        <PreviewManagerToday
          pendingCorrections={pendingCorrections.length}
          pendingExchanges={pendingExchanges.length}
          shortageItems={activeInventoryItems.filter((item) => item.status === 'shortage').length}
          uncountedItems={activeInventoryItems.filter((item) => item.status === 'unknown').length}
          unpublishedShifts={(assignments ?? []).filter((assignment) => !assignment.published).length}
          staleRecipeFields={staleRecipeFields}
          openingCheckComplete={!inventoryEnabled || localHour < 10 ? null : openingSession?.status === 'completed'}
          closingCheckComplete={!inventoryEnabled || localHour < 18 ? null : closingSession?.status === 'completed'}
        />

        <PreviewManagerView
          timeZone={location.timezone}
          periodStart={periodStart}
          periodEnd={periodEnd}
          weekOffset={weekOffset}
          staff={staff}
          shiftTypes={shiftTypes}
          assignments={assignments}
          basePath={PREVIEW_BASE_PATH}
          actionsSlot={
            <PreviewScheduleCardActions
              periodStart={periodStart}
              periodEnd={periodEnd}
              requiredHeadcountByWeekday={settings?.requiredHeadcountByWeekday ?? [3, 3, 3, 3, 3, 2, 4]}
              hasUnpublishedChanges={(assignments ?? []).some((assignment) => !assignment.published)}
            />
          }
        />

        <PreviewStaffRecipeManagement staff={staff} recipes={recipes} translationWorkspaces={translationWorkspaces} />

        <PreviewSettingsCard shiftTypes={shiftTypes} assignments={assignments} settings={settings} />

        {exchangesResult.status === 'success' && allAssignmentsResult.status === 'success' ? (
          <PreviewShiftExchangeManagerPanel
            timeZone={location.timezone}
            assignments={allAssignmentsResult.data}
            exchanges={exchangesResult.data}
            staffNameById={staffNameById}
          />
        ) : null}

        {inventoryEnabled && inventoryItemsResult?.status === 'success' ? (
          <PreviewInventoryManagerPanel
            locationId={location.locationId}
            items={inventoryItemsResult.data}
            staffNameById={staffNameById}
          />
        ) : null}
      </CafeManagerScreen>
    </BrandProvider>
  );
}
