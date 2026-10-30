import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { readPiiEnv } from '@/lib/workforce/pii-env';
import {
  mapStaffListReadError,
  mapWorkforceStaffForManagerRows,
  type ApiWorkforceStaffManageRow,
} from '@/lib/workforce/employees';
import {
  mapEmployeeLineLinkRows,
  mapEmployeeLineLinksReadError,
  type ApiWorkforceEmployeeLineLinkRow,
} from '@/lib/workforce/employee-line-links';
import { mapShiftTypesReadError, mapWorkforceShiftTypeRows, type ApiWorkforceShiftTypeRow } from '@/lib/workforce/shift-types';
import {
  mapManagerShiftRequestRows,
  mapManagerShiftRequestsReadError,
  type ApiWorkforceShiftRequestRow,
} from '@/lib/workforce/shift-requests';
import {
  mapShiftAssignmentRows,
  mapShiftAssignmentsReadError,
  type ApiWorkforceShiftAssignmentRow,
} from '@/lib/workforce/shift-assignments';
import { mapManagerAttendanceReadError, mapManagerAttendanceRows, type ApiWorkforceAttendanceRow } from '@/lib/workforce/attendance';
import {
  mapWorkforceEmployeeInvitationRows,
  mapWorkforceEmployeeInvitationsReadError,
  type ApiWorkforceEmployeeInvitationRow,
} from '@/lib/workforce/invitations';
import { mapShiftExchangeRows, mapShiftExchangesReadError, type ExchangeRow } from '@/lib/workforce/shift-exchanges';
import {
  mapManagerStaffMessageRows,
  mapManagerStaffMessagesReadError,
  type ApiWorkforceStaffMessageRow,
} from '@/lib/workforce/staff-messages';
import { mapInventoryItemStatusReadError, mapInventoryItemStatusRows, type ApiInventoryItemStatusRow } from '@/lib/inventory/items';
import { mapPurchasesNeededReadError, mapPurchasesNeededRows, type ApiPurchasesNeededRow } from '@/lib/purchases/items';
import { mapPurchaseHistoryReadError, mapPurchaseHistoryRows, type ApiPurchaseHistoryRow } from '@/lib/purchases/history';
import {
  mapPurchasesAwaitingDeliveryReadError,
  mapPurchasesAwaitingDeliveryRows,
  type ApiPurchasesAwaitingDeliveryRow,
} from '@/lib/purchases/awaiting-delivery';
import {
  mapWorkforceRecipeCategoriesReadError,
  mapWorkforceRecipeCategoryRows,
  type ApiWorkforceRecipeCategoryRow,
} from '@/lib/workforce/recipe-categories';
import { mapWorkforceRecipeRows, mapWorkforceRecipesReadError, type ApiWorkforceRecipeRow } from '@/lib/workforce/recipes';
import {
  mapAutoScheduleRunRows,
  mapScheduleSettingsError,
  mapWorkforceScheduleSettingsRows,
  type ApiAutoScheduleRunRow,
  type ApiWorkforceScheduleSettingsRow,
} from '@/lib/workforce/schedule-settings';
import { mapContentTranslationRows, mapContentTranslationsReadError, type ApiContentTranslationRow } from '@/lib/content/translations';
import {
  mapMyWorkforceStaffProfileReadError,
  mapMyWorkforceStaffProfileRows,
  type ApiWorkforceMyStaffProfileRow,
} from '@/lib/workforce/staff-profile';
import {
  mapOperationsTemplateItemRows,
  mapOperationsTemplateItemsReadError,
  mapOperationsTemplateRows,
  mapOperationsTemplatesReadError,
  type ApiOperationsTemplateItemRow,
  type ApiOperationsTemplateRow,
} from '@/lib/operations/templates';
import { mapOperationsScheduleRows, mapOperationsSchedulesReadError, type ApiOperationsScheduleRow } from '@/lib/operations/schedules';
import { mapExpectedTaskRows, mapExpectedTasksReadError, type ApiOperationsExpectedTaskRow } from '@/lib/operations/tasks';
import {
  mapOpenOperationsExceptionRows,
  mapOpenOperationsExceptionsReadError,
  type ApiOperationsOpenExceptionRow,
} from '@/lib/operations/exceptions';
import { mapIssueHistoryReadError, mapIssueRows, mapOpenIssuesReadError, type ApiIssueRow } from '@/lib/issues/issues';

/**
 * The Manager page's read-only data batch from ONE `api.manager_dashboard`
 * RPC (0144, DEBT-135) instead of ~32 PostgREST requests. Each part is the
 * same read the named lib function makes (same view, filters, order, cap --
 * pgTAP 0083) and is mapped by that function's own row mapper and error
 * mapper, so every part ends up as exactly the `TenantAccessResult` the lib
 * function would have returned:
 *   staff                    listWorkforceStaffForManager
 *   lineLinks                listEmployeeLineLinks
 *   shiftTypes               listWorkforceShiftTypes
 *   preferenceRequests       listShiftRequestsForManager({ kind: 'preference', fromDate })
 *   assignments              listShiftAssignments({ fromIso, toIsoExclusive })
 *   correctionRequests       listShiftRequestsForManager({ kind: 'correction' })
 *   attendance               listAttendanceForManager({ fromDate, toDate })
 *   invitations              listWorkforceEmployeeInvitations
 *   shiftExchanges           listShiftExchanges(location)
 *   exchangeAssignments      listShiftAssignments(exchange window)
 *   staffMessages            listStaffMessagesForManager
 *   inventoryItems           listInventoryItemStatus(location, { includeInactive: true })
 *   purchasesNeeded          listPurchasesNeeded(location)
 *   purchaseHistory          listPurchaseHistory(location)
 *   purchasesAwaiting        listPurchasesAwaitingDelivery(location)
 *   recipeCategories         listWorkforceRecipeCategories
 *   recipes                  listWorkforceRecipes
 *   scheduleSettings         getWorkforceScheduleSettings(location)
 *   recipeTitleTranslations  listContentTranslationsForField('workforce_recipe', 'title')
 *   myProfile                getMyWorkforceStaffProfile
 *   operationsTemplates      listOperationsTemplates
 *   operationsItems          listOperationsTemplateItems
 *   operationsSchedules      listOperationsSchedules
 *   operationsTodayTasks     listExpectedTasks(today)
 *   operationsOpenExceptions listOpenOperationsExceptions
 *   issuesOpen               listOpenIssues
 *   issuesAll                listAllIssues
 *   autoScheduleRuns         listRecentAutoScheduleRuns(location)
 * Module gating stays with the caller: only `params.parts` are read; any
 * other part comes back as an `unexpected_error` ("not requested").
 */

interface PartPayload {
  rows: unknown[];
  protectedHistoryIds?: unknown;
}

interface MapContext {
  tenantId: string;
  encryptionKey: string;
}

interface PartSpec<T> {
  error: (error: PostgrestError) => TenantAccessResult<never>;
  map: (payload: PartPayload, ctx: MapContext) => TenantAccessResult<T>;
}

function rows<T>(payload: PartPayload): T[] {
  return payload.rows as T[];
}

function ok<T>(data: T): TenantAccessResult<T> {
  return { status: 'success', data };
}

function spec<T>(error: PartSpec<T>['error'], map: PartSpec<T>['map']): PartSpec<T> {
  return { error, map };
}

const PART_SPECS = {
  staff: spec(mapStaffListReadError, (p, ctx) => {
    const ids = Array.isArray(p.protectedHistoryIds) ? (p.protectedHistoryIds as unknown[]).filter((id): id is string => typeof id === 'string') : [];
    return ok(mapWorkforceStaffForManagerRows(rows<ApiWorkforceStaffManageRow>(p), new Set(ids), ctx.encryptionKey));
  }),
  lineLinks: spec(mapEmployeeLineLinksReadError, (p) => ok(mapEmployeeLineLinkRows(rows<ApiWorkforceEmployeeLineLinkRow>(p)))),
  shiftTypes: spec(mapShiftTypesReadError, (p) => ok(mapWorkforceShiftTypeRows(rows<ApiWorkforceShiftTypeRow>(p)))),
  preferenceRequests: spec(mapManagerShiftRequestsReadError, (p) => ok(mapManagerShiftRequestRows(rows<ApiWorkforceShiftRequestRow>(p)))),
  assignments: spec(mapShiftAssignmentsReadError, (p) => ok(mapShiftAssignmentRows(rows<ApiWorkforceShiftAssignmentRow>(p)))),
  correctionRequests: spec(mapManagerShiftRequestsReadError, (p) => ok(mapManagerShiftRequestRows(rows<ApiWorkforceShiftRequestRow>(p)))),
  attendance: spec(mapManagerAttendanceReadError, (p) => ok(mapManagerAttendanceRows(rows<ApiWorkforceAttendanceRow>(p)))),
  invitations: spec(mapWorkforceEmployeeInvitationsReadError, (p) =>
    ok(mapWorkforceEmployeeInvitationRows(rows<ApiWorkforceEmployeeInvitationRow>(p))),
  ),
  shiftExchanges: spec(mapShiftExchangesReadError, (p) => ok(mapShiftExchangeRows(rows<ExchangeRow>(p)))),
  exchangeAssignments: spec(mapShiftAssignmentsReadError, (p) => ok(mapShiftAssignmentRows(rows<ApiWorkforceShiftAssignmentRow>(p)))),
  staffMessages: spec(mapManagerStaffMessagesReadError, (p) => ok(mapManagerStaffMessageRows(rows<ApiWorkforceStaffMessageRow>(p)))),
  inventoryItems: spec(mapInventoryItemStatusReadError, (p) => ok(mapInventoryItemStatusRows(rows<ApiInventoryItemStatusRow>(p)))),
  purchasesNeeded: spec(mapPurchasesNeededReadError, (p) => ok(mapPurchasesNeededRows(rows<ApiPurchasesNeededRow>(p)))),
  purchaseHistory: spec(mapPurchaseHistoryReadError, (p) => ok(mapPurchaseHistoryRows(rows<ApiPurchaseHistoryRow>(p)))),
  purchasesAwaiting: spec(mapPurchasesAwaitingDeliveryReadError, (p) =>
    ok(mapPurchasesAwaitingDeliveryRows(rows<ApiPurchasesAwaitingDeliveryRow>(p))),
  ),
  recipeCategories: spec(mapWorkforceRecipeCategoriesReadError, (p) => ok(mapWorkforceRecipeCategoryRows(rows<ApiWorkforceRecipeCategoryRow>(p)))),
  recipes: spec(mapWorkforceRecipesReadError, (p) => ok(mapWorkforceRecipeRows(rows<ApiWorkforceRecipeRow>(p)))),
  scheduleSettings: spec(mapScheduleSettingsError, (p) => mapWorkforceScheduleSettingsRows(rows<ApiWorkforceScheduleSettingsRow>(p))),
  recipeTitleTranslations: spec(mapContentTranslationsReadError, (p) => ok(mapContentTranslationRows(rows<ApiContentTranslationRow>(p)))),
  myProfile: spec(mapMyWorkforceStaffProfileReadError, (p) => mapMyWorkforceStaffProfileRows(rows<ApiWorkforceMyStaffProfileRow>(p))),
  operationsTemplates: spec(mapOperationsTemplatesReadError, (p) => ok(mapOperationsTemplateRows(rows<ApiOperationsTemplateRow>(p)))),
  operationsItems: spec(mapOperationsTemplateItemsReadError, (p) => ok(mapOperationsTemplateItemRows(rows<ApiOperationsTemplateItemRow>(p)))),
  operationsSchedules: spec(mapOperationsSchedulesReadError, (p) => ok(mapOperationsScheduleRows(rows<ApiOperationsScheduleRow>(p)))),
  operationsTodayTasks: spec(mapExpectedTasksReadError, (p, ctx) => ok(mapExpectedTaskRows(rows<ApiOperationsExpectedTaskRow>(p), ctx.tenantId))),
  operationsOpenExceptions: spec(mapOpenOperationsExceptionsReadError, (p) =>
    ok(mapOpenOperationsExceptionRows(rows<ApiOperationsOpenExceptionRow>(p))),
  ),
  issuesOpen: spec(mapOpenIssuesReadError, (p) => ok(mapIssueRows(rows<ApiIssueRow>(p)))),
  issuesAll: spec(mapIssueHistoryReadError, (p) => ok(mapIssueRows(rows<ApiIssueRow>(p)))),
  autoScheduleRuns: spec(mapScheduleSettingsError, (p) => ok(mapAutoScheduleRunRows(rows<ApiAutoScheduleRunRow>(p)))),
};

type PartSpecs = typeof PART_SPECS;
export type ManagerDashboardPart = keyof PartSpecs;
export type ManagerDashboardResults = { [K in ManagerDashboardPart]: ReturnType<PartSpecs[K]['map']> };

export const MANAGER_DASHBOARD_PARTS = Object.keys(PART_SPECS) as ManagerDashboardPart[];

/** Inputs of `api.manager_dashboard`; a requested part's inputs are required (else the RPC raises 22023). */
export interface ManagerDashboardParams {
  parts: readonly ManagerDashboardPart[];
  /** preferenceRequests: inclusive lower bound on `work_date` (YYYY-MM-DD). */
  preferenceFromDate?: string;
  /** assignments: `[fromIso, toIsoExclusive)` on `starts_at`. */
  fromIso?: string;
  toIsoExclusive?: string;
  /** exchangeAssignments: `[exchangeFromIso, exchangeToIsoExclusive)` on `starts_at`. */
  exchangeFromIso?: string;
  exchangeToIsoExclusive?: string;
  /** attendance: inclusive `work_date` range (YYYY-MM-DD). */
  attendanceFromDate?: string;
  attendanceToDate?: string;
  /** operationsTodayTasks: the location-local date (YYYY-MM-DD). */
  today?: string;
}

const NOT_REQUESTED = { status: 'unexpected_error', message: 'Not requested in this manager dashboard load.' } as const;
const BAD_SHAPE = 'Unexpected manager dashboard response.';

function toPostgrestError(value: unknown): PostgrestError {
  const e = (value && typeof value === 'object' ? value : {}) as { code?: unknown; message?: unknown };
  return {
    name: 'PostgrestError',
    code: typeof e.code === 'string' ? e.code : '',
    message: typeof e.message === 'string' ? e.message : 'Unexpected error.',
    details: '',
    hint: '',
  } as PostgrestError;
}

function allParts(fill: (part: ManagerDashboardPart) => TenantAccessResult<unknown>): ManagerDashboardResults {
  return Object.fromEntries(MANAGER_DASHBOARD_PARTS.map((part) => [part, fill(part)])) as ManagerDashboardResults;
}

/**
 * Loads the requested parts with one RPC. Fails closed: an RPC error maps to
 * each requested part's own error result (as if its single read had failed
 * with that error); a throw or an unexpected payload becomes `unexpected_error`
 * for every requested part, so each popup shows its existing error state.
 */
export async function loadManagerDashboard(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  params: ManagerDashboardParams,
): Promise<ManagerDashboardResults> {
  const requested = new Set<ManagerDashboardPart>(params.parts);
  const pii = readPiiEnv();
  // listWorkforceStaffForManager checks the PII env before reading; keep that outcome.
  const staffConfigError: TenantAccessResult<never> | null = pii.ok
    ? null
    : { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };
  const ctx: MapContext = { tenantId, encryptionKey: pii.ok ? pii.config.encryptionKey : '' };

  const finish = (fill: (part: ManagerDashboardPart) => TenantAccessResult<unknown>): ManagerDashboardResults =>
    allParts((part) => {
      if (!requested.has(part)) return NOT_REQUESTED;
      if (part === 'staff' && staffConfigError) return staffConfigError;
      return fill(part);
    });

  try {
    const { data, error } = await supabase.schema('api').rpc('manager_dashboard', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_params: { ...params, parts: [...requested] },
    });
    if (error) return finish((part) => PART_SPECS[part].error(error));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return finish(() => ({ status: 'unexpected_error', message: BAD_SHAPE }));
    }
    const bundle = data as Record<string, unknown>;
    return finish((part) => {
      const value = bundle[part] as { rows?: unknown; error?: unknown; protectedHistoryIds?: unknown } | undefined;
      if (value && typeof value === 'object' && 'error' in value) return PART_SPECS[part].error(toPostgrestError(value.error));
      if (!value || typeof value !== 'object' || !Array.isArray(value.rows)) return { status: 'unexpected_error', message: BAD_SHAPE };
      try {
        return PART_SPECS[part].map({ rows: value.rows, protectedHistoryIds: value.protectedHistoryIds }, ctx);
      } catch (err) {
        return { status: 'unexpected_error', message: err instanceof Error ? err.message : BAD_SHAPE };
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error reading the manager dashboard.';
    return finish(() => ({ status: 'unexpected_error', message }));
  }
}
