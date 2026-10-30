import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRpc, ok, rows, spec, type DashboardResults } from '@/lib/db/dashboard-rpc';
import { MANAGER_DASHBOARD_PART_SPECS } from '@/lib/manager/dashboard';
import { mapInventoryItemStatusReadError, mapInventoryItemStatusRows, type ApiInventoryItemStatusRow } from '@/lib/inventory/items';
import { mapMyShiftRequestRows, mapMyShiftRequestsReadError, type ApiWorkforceShiftRequestRow } from '@/lib/workforce/shift-requests';
import { mapMyAttendanceReadError, mapMyAttendanceRows, type ApiWorkforceAttendanceRow } from '@/lib/workforce/attendance';
import {
  mapManagerStaffMessageRows,
  mapMyStaffMessagesReadError,
  type ApiWorkforceStaffMessageRow,
} from '@/lib/workforce/staff-messages';
import { mapStaffRosterReadError, mapWorkforceStaffRosterRows, type ApiWorkforceStaffRosterRow } from '@/lib/workforce/employees';
import { groupItemResponsesByInstance, mapItemResponsesReadError, type ApiOperationsItemResponseRow } from '@/lib/operations/tasks';

/**
 * The Staff page's read-only data batch from ONE `api.staff_dashboard` RPC
 * (0145, DEBT-135) instead of ~20 PostgREST requests. Shared parts are read
 * by the RPC through `api.manager_dashboard` and mapped by the same specs as
 * on the Manager page; staff-only parts replace (pgTAP 0084):
 *   myPreferenceRequests     listMyShiftRequests({ kind: 'preference' })
 *   myCorrectionRequests     listMyShiftRequests({ kind: 'correction' })
 *   myAttendance             listMyAttendance
 *   myStaffMessages          listMyStaffMessages(employeeId)
 *   staffRoster              listWorkforceStaffRoster
 *   operationsResponses      listItemResponsesForInstances(instance ids of today's tasks at this location),
 *                            grouped by instanceId (the page adds `[]` for instances without responses)
 *   inventoryItems           listInventoryItemStatus(location) -- active items only (the Staff view's
 *                            default); the RPC reads active + inactive, capped at 1000 rows, as on Manager
 */
const STAFF_DASHBOARD_PART_SPECS = {
  shiftTypes: MANAGER_DASHBOARD_PART_SPECS.shiftTypes,
  assignments: MANAGER_DASHBOARD_PART_SPECS.assignments,
  shiftExchanges: MANAGER_DASHBOARD_PART_SPECS.shiftExchanges,
  inventoryItems: spec(mapInventoryItemStatusReadError, (p) =>
    ok(mapInventoryItemStatusRows(rows<ApiInventoryItemStatusRow>(p).filter((row) => row.is_active))),
  ),
  purchasesNeeded: MANAGER_DASHBOARD_PART_SPECS.purchasesNeeded,
  purchaseHistory: MANAGER_DASHBOARD_PART_SPECS.purchaseHistory,
  purchasesAwaiting: MANAGER_DASHBOARD_PART_SPECS.purchasesAwaiting,
  recipeCategories: MANAGER_DASHBOARD_PART_SPECS.recipeCategories,
  recipes: MANAGER_DASHBOARD_PART_SPECS.recipes,
  recipeTitleTranslations: MANAGER_DASHBOARD_PART_SPECS.recipeTitleTranslations,
  operationsTodayTasks: MANAGER_DASHBOARD_PART_SPECS.operationsTodayTasks,
  operationsItems: MANAGER_DASHBOARD_PART_SPECS.operationsItems,
  issuesOpen: MANAGER_DASHBOARD_PART_SPECS.issuesOpen,
  myPreferenceRequests: spec(mapMyShiftRequestsReadError, (p) => ok(mapMyShiftRequestRows(rows<ApiWorkforceShiftRequestRow>(p)))),
  myCorrectionRequests: spec(mapMyShiftRequestsReadError, (p) => ok(mapMyShiftRequestRows(rows<ApiWorkforceShiftRequestRow>(p)))),
  myAttendance: spec(mapMyAttendanceReadError, (p) => ok(mapMyAttendanceRows(rows<ApiWorkforceAttendanceRow>(p)))),
  myStaffMessages: spec(mapMyStaffMessagesReadError, (p) => ok(mapManagerStaffMessageRows(rows<ApiWorkforceStaffMessageRow>(p)))),
  // listWorkforceStaffRoster checks the PII env before reading; keep that outcome.
  staffRoster: spec(
    mapStaffRosterReadError,
    (p, ctx) => ok(mapWorkforceStaffRosterRows(rows<ApiWorkforceStaffRosterRow>(p), ctx.encryptionKey)),
    { needsPii: true },
  ),
  operationsResponses: spec(mapItemResponsesReadError, (p) => ok(groupItemResponsesByInstance(rows<ApiOperationsItemResponseRow>(p), []))),
};

type PartSpecs = typeof STAFF_DASHBOARD_PART_SPECS;
export type StaffDashboardPart = keyof PartSpecs;
export type StaffDashboardResults = DashboardResults<PartSpecs>;

export const STAFF_DASHBOARD_PARTS = Object.keys(STAFF_DASHBOARD_PART_SPECS) as StaffDashboardPart[];

/** Inputs of `api.staff_dashboard`; a requested part's inputs are required (else the RPC raises 22023). */
export interface StaffDashboardParams {
  parts: readonly StaffDashboardPart[];
  /** assignments: `[fromIso, toIsoExclusive)` on `starts_at`. */
  fromIso?: string;
  toIsoExclusive?: string;
  /** operationsTodayTasks: the location-local date (YYYY-MM-DD). operationsResponses requires operationsTodayTasks. */
  today?: string;
  /** myStaffMessages: the caller's own employee id. */
  employeeId?: string;
}

/** Loads the requested parts with one RPC; same fail-closed rules as `loadManagerDashboard`. */
export async function loadStaffDashboard(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  params: StaffDashboardParams,
): Promise<StaffDashboardResults> {
  return loadDashboardRpc(supabase, 'staff_dashboard', 'staff dashboard', STAFF_DASHBOARD_PART_SPECS, tenantId, locationId, { ...params });
}
