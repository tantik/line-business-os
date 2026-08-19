'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import { queueLineNotification } from '@/lib/notifications/queue-line-notification';
import { getMyWorkforceStaffProfile } from './staff-profile';
import { listWorkforceStaffDirectory } from './employees';
import { listWorkforceShiftTypes } from './shift-types';
import { listShiftRequestsForManager, submitShiftPreference as submitShiftPreferenceWrite } from './shift-requests';
import {
  createShiftAssignment as createShiftAssignmentWrite,
  insertDraftShiftAssignments,
  listShiftAssignments,
  mapDraftAssignmentToInsertRow,
  toAutoDistributeExistingAssignment,
  unassignDraftShiftAssignments,
  updateShiftAssignment as updateShiftAssignmentWrite,
  publishShiftAssignments,
  type WorkforceShiftAssignment,
} from './shift-assignments';
import { autoDistribute, type AutoDistributeEmployee, type AutoDistributePreference } from './auto-distribute';
import { getWeekPeriod } from './period';
import { addIsoDays, localDateTimeToUtcIso } from './timezone';
import {
  parseCreateShiftAssignmentInput,
  parsePublishScheduleInput,
  parseRunAutoDistributionInput,
  parseSubmitShiftPreferenceInput,
  parseUndoAutoDistributionInput,
  parseUpdateShiftAssignmentInput,
} from './schedule-input';
import type { WorkforceShiftRequest } from './shift-requests';
import type { WorkforceWriteResult } from './result-types';
import type { RunAutoDistributionActionResult } from './schedule-types';

/**
 * Server Actions for shift preferences, auto-distribution, manual edits, and
 * publishing. Thin controllers: validate -> resolve tenant/self -> delegate
 * to the service-layer helpers, which own the actual Supabase calls. RLS
 * remains the real authorization boundary everywhere; the
 * `getMyWorkforceStaffProfile` lookup in `submitShiftPreference` is a UX
 * nicety (a clearer error than an opaque RLS denial for a caller with no
 * staff row at all), not a security check.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
const NO_STAFF_PROFILE_RESULT = { status: 'unexpected_error', message: 'You have no staff profile in this tenant.' } as const;

export interface MyScheduleWeek {
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  assignments: WorkforceShiftAssignment[];
}

/** Sanity cap on how far a staff member can navigate the weekly view, matching `staff/page.tsx`'s own `MAX_WEEK_OFFSET`. */
const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

/**
 * Staff-only: re-read one week's PUBLISHED shift assignments for the
 * caller's own resolved location, tenant-wide (every employee at that
 * location, not just the caller's own rows) -- the canonical Staff
 * dashboard's coworker-roster/self-pin/all-only-me schedule view needs the
 * full roster's published shifts, the same shape `_client-preview`'s
 * `previewGetStaffScheduleWeek` already returns. Live-sync poll target
 * (Manager -> Staff propagation) deliberately scoped to exactly one week
 * (never the caller's full multi-week window) so a background poll stays a
 * small, targeted query.
 */
export async function getMyScheduleWeek(weekOffset: number): Promise<WorkforceWriteResult<MyScheduleWeek>> {
  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === myProfile.data!.locationId);
  if (!location) return { status: 'not_found' };

  const rawOffset = Number.isInteger(weekOffset) ? weekOffset : 0;
  const clampedOffset = Math.max(MIN_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, rawOffset));

  const nowIso = new Date().toISOString();
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, location.timezone, clampedOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', location.timezone);

  const result = await listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive });
  if (result.status !== 'success') return result;

  const publishedAssignments = result.data.filter((a) => a.published && a.locationId === location.locationId);
  return { status: 'success', data: { periodStart, periodEnd, weekOffset: clampedOffset, assignments: publishedAssignments } };
}

export async function submitShiftPreference(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  const input = parseSubmitShiftPreferenceInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;

  return submitShiftPreferenceWrite(supabase, tenantId, {
    employeeId: myProfile.data.staffId,
    locationId: myProfile.data.locationId,
    workDate: input.workDate,
    shiftTypeId: input.shiftTypeId,
    isUnavailable: input.isUnavailable,
  });
}

/**
 * Reads the tenant/location snapshot through the existing RLS-scoped `api`
 * read helpers, runs the pure `autoDistribute()` (Slice 1B, unchanged), and
 * bulk-inserts the resulting draft (`published: false`) assignments. Manager
 * permission is enforced entirely by RLS on the final INSERT (`wf_shifts_manage`,
 * `workforce.shift.write`) -- there is no separate pre-check here, matching
 * the "attempt, then map" convention used by every other manager-only action
 * in this codebase.
 */
export async function runAutoDistribution(input: unknown): Promise<WorkforceWriteResult<RunAutoDistributionActionResult>> {
  const parsed = parseRunAutoDistributionInput(input);
  if (!parsed) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === parsed.locationId);
  if (!location) return { status: 'not_found' };
  const timeZone = location.timezone;

  const fromIso = localDateTimeToUtcIso(parsed.periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(parsed.periodEnd, 1), '00:00', timeZone);

  const [staffResult, shiftTypesResult, preferencesResult, existingResult] = await Promise.all([
    listWorkforceStaffDirectory(supabase, tenantId),
    listWorkforceShiftTypes(supabase, tenantId),
    listShiftRequestsForManager(supabase, tenantId, { kind: 'preference' }),
    listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
  ]);
  if (staffResult.status !== 'success') return staffResult;
  if (shiftTypesResult.status !== 'success') return shiftTypesResult;
  if (preferencesResult.status !== 'success') return preferencesResult;
  if (existingResult.status !== 'success') return existingResult;

  const employees: AutoDistributeEmployee[] = staffResult.data
    .filter((s) => s.locationId === parsed.locationId)
    .map((s) => ({ employeeId: s.staffId, isActive: s.isActive }));

  const preferences: AutoDistributePreference[] = preferencesResult.data
    .filter((r) => r.workDate >= parsed.periodStart && r.workDate <= parsed.periodEnd)
    .map((r) => ({
      employeeId: r.employeeId,
      workDate: r.workDate,
      shiftTypeId: r.shiftTypeId,
      isUnavailable: r.isUnavailable,
    }));

  const existingAssignments = existingResult.data
    .map((a) => toAutoDistributeExistingAssignment(a, timeZone))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const result = autoDistribute({
    employees,
    shiftTypes: shiftTypesResult.data.map((st) => ({
      shiftTypeId: st.shiftTypeId,
      code: st.code,
      startsAtLocal: st.startsAtLocal,
      endsAtLocal: st.endsAtLocal,
      breakMinutes: st.breakMinutes,
      sortOrder: st.sortOrder,
      isActive: st.isActive,
    })),
    preferences,
    staffingRequirements: parsed.staffingRequirements,
    existingAssignments,
    options: {
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      maxPeriodHours: parsed.maxPeriodHours,
      overwriteExisting: parsed.overwriteExisting,
    },
  });

  const insertRows = result.draftAssignments.map((draft) =>
    mapDraftAssignmentToInsertRow(draft, tenantId, parsed.locationId, timeZone),
  );
  const insertResult = await insertDraftShiftAssignments(supabase, insertRows);
  if (insertResult.status !== 'success') return insertResult;

  return {
    status: 'success',
    data: {
      shortages: result.shortages,
      unplaced: result.unplaced,
      nonSubmitters: result.nonSubmitters,
      draftCount: insertResult.data.inserted,
      createdAssignmentIds: insertResult.data.assignmentIds,
    },
  };
}

/**
 * Same-session "Undo" for `runAutoDistribution`: nulls `employee_id` on
 * exactly the assignment ids that run just created (returned to the client
 * as `createdAssignmentIds`), not a general-purpose bulk-unassign endpoint.
 * `unassignDraftShiftAssignments` itself is tenant-scoped and filters to
 * `published = false`, and RLS (`wf_shifts_manage`, `workforce.shift.write`)
 * remains the real authorization boundary regardless.
 */
export async function undoAutoDistribution(input: unknown): Promise<WorkforceWriteResult<{ unassigned: number }>> {
  const parsed = parseUndoAutoDistributionInput(input);
  if (!parsed) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  return unassignDraftShiftAssignments(supabase, tenantId, parsed.assignmentIds);
}

export async function updateShiftAssignment(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftAssignment>> {
  const input = parseUpdateShiftAssignmentInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === input.locationId);
  if (!location) return { status: 'not_found' };

  return updateShiftAssignmentWrite(supabase, tenantId, input.assignmentId, {
    employeeId: input.employeeId,
    shiftTypeId: input.shiftTypeId,
    startsAt: localDateTimeToUtcIso(input.workDate, input.startsAtLocal, location.timezone),
    endsAt: localDateTimeToUtcIso(input.workDate, input.endsAtLocal, location.timezone),
    breakMinutes: input.breakMinutes,
    role: input.role,
    notes: input.notes,
    published: input.published,
  });
}

/** Manager manual assignment of a specific employee into a previously-empty grid cell -- see `createShiftAssignment` in `shift-assignments.ts`. */
export async function createShiftAssignment(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftAssignment>> {
  const input = parseCreateShiftAssignmentInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === input.locationId);
  if (!location) return { status: 'not_found' };

  return createShiftAssignmentWrite(supabase, tenantId, input.locationId, {
    employeeId: input.employeeId,
    shiftTypeId: input.shiftTypeId,
    startsAt: localDateTimeToUtcIso(input.workDate, input.startsAtLocal, location.timezone),
    endsAt: localDateTimeToUtcIso(input.workDate, input.endsAtLocal, location.timezone),
    breakMinutes: input.breakMinutes,
    role: input.role,
    notes: input.notes,
  });
}

export async function publishSchedule(formData: FormData): Promise<WorkforceWriteResult<{ published: number }>> {
  const input = parsePublishScheduleInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === input.locationId);
  if (!location) return { status: 'not_found' };

  const fromIso = localDateTimeToUtcIso(input.periodStart, '00:00', location.timezone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(input.periodEnd, 1), '00:00', location.timezone);

  const result = await publishShiftAssignments(supabase, tenantId, input.locationId, fromIso, toIsoExclusive);
  if (result.status === 'success') {
    // WP C2: inert today, never affects this write's own result either way.
    queueLineNotification({
      type: 'schedule_published',
      tenantId,
      targetStaffId: null,
      payload: { locationId: input.locationId, periodStart: input.periodStart, periodEnd: input.periodEnd, published: result.data.published },
    });
  }
  return result;
}
