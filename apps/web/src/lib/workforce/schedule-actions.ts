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
  clearUnconfirmedDraftAssignmentsInPeriod,
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
import {
  autoDistribute,
  deriveActiveScheduleWindowCodes,
  type AutoDistributeEmployee,
  type AutoDistributePreference,
} from './auto-distribute';
import {
  buildAuthoritativeStaffingRequirements,
  hasPositiveStaffingRequirement,
} from './auto-distribution-authority';
import { getWorkforceScheduleSettings } from './schedule-settings';
import { getWeekPeriod } from './period';
import { addIsoDays, localDateTimeToUtcIso } from './timezone';
import {
  parseCreateShiftAssignmentInput,
  parsePublishScheduleInput,
  parseSubmitMonthlyShiftPreferencesInput,
  parseSubmitShiftPreferenceInput,
  parseUndoAutoDistributionInput,
  parseUpdateShiftAssignmentInput,
} from './schedule-input';
import { parseIsoDate, parseUuid } from './validation';
import type { WorkforceShiftRequest } from './shift-requests';
import type { WorkforceWriteResult } from './result-types';
import type { RunAutoDistributionActionOutcome } from './schedule-types';

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

export interface SubmitMonthlyShiftPreferencesResult {
  insertedCount: number;
  /** Dates that already had a preference row (`duplicate`, from `wf_shift_requests_one_preference_per_day`) -- INSERT-only, so a day the caller already submitted can't be changed here; skipped rather than failing the whole batch. */
  skippedDates: string[];
}

/**
 * Submit several next-month day preferences in one call (the "tap a calendar
 * of days" modal) -- there is no bulk-insert RPC, so this just loops
 * `submitShiftPreferenceWrite` once per selection, same INSERT-only
 * semantics as the single-day `submitShiftPreference` above (self-insert RLS
 * only; no self-scoped UPDATE policy exists). A day that already has a
 * preference comes back `duplicate` and is recorded in `skippedDates`
 * instead of failing the whole batch -- the modal pre-fills/locks those days
 * from `requests` so this should be rare, but a stale client (another tab,
 * a second device) can still race into it.
 */
export async function submitMonthlyShiftPreferences(input: unknown): Promise<WorkforceWriteResult<SubmitMonthlyShiftPreferencesResult>> {
  const parsed = parseSubmitMonthlyShiftPreferencesInput(input);
  if (!parsed) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;

  let insertedCount = 0;
  const skippedDates: string[] = [];
  for (const selection of parsed.selections) {
    const result = await submitShiftPreferenceWrite(supabase, tenantId, {
      employeeId: myProfile.data.staffId,
      locationId: myProfile.data.locationId,
      workDate: selection.workDate,
      shiftTypeId: selection.shiftTypeId,
      isUnavailable: selection.isUnavailable,
      details: parsed.note ? { note: parsed.note } : undefined,
    });
    if (result.status === 'success') {
      insertedCount += 1;
    } else if (result.status === 'duplicate') {
      skippedDates.push(selection.workDate);
    } else {
      return result;
    }
  }

  return { status: 'success', data: { insertedCount, skippedDates } };
}

/**
 * Manual "auto-create schedule" for the canonical Manager dashboard. The
 * client sends ONLY `{ locationId, periodStart, periodEnd }` -- it never
 * supplies (and this action never reads) a staffing-requirement array, an
 * `overwriteExisting` flag, or a max-hours cap. The staffing window matrix,
 * the per-weekday headcount, and the monthly-hours cap are all resolved
 * server-side from the tenant/location's own active shift types and stored
 * `workforce_schedule_settings`, so a stale or manipulated client cannot
 * widen a window, inflate a headcount, or overwrite a confirmed shift.
 *
 * `overwriteExisting` is always `false`: `autoDistribute()` then preserves
 * every published (manager-confirmed / manual) assignment untouched and
 * never re-generates it. Manager permission is enforced by RLS on the final
 * INSERT (`wf_shifts_manage`, `workforce.shift.write`), same "attempt, then
 * map" convention as every other manager-only action here.
 */
export async function runAutoDistribution(input: unknown): Promise<RunAutoDistributionActionOutcome> {
  if (typeof input !== 'object' || input === null) return INVALID_INPUT_RESULT;
  const raw = input as Record<string, unknown>;
  const locationId = parseUuid(raw.locationId);
  const periodStart = parseIsoDate(raw.periodStart);
  const periodEnd = parseIsoDate(raw.periodEnd);
  if (!locationId || !periodStart || !periodEnd || periodEnd < periodStart) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return locationsResult;
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === locationId);
  if (!location) return { status: 'not_found' };
  const timeZone = location.timezone;

  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', timeZone);

  const [staffResult, shiftTypesResult, preferencesResult, existingResult, scheduleSettingsResult] = await Promise.all([
    listWorkforceStaffDirectory(supabase, tenantId),
    listWorkforceShiftTypes(supabase, tenantId),
    listShiftRequestsForManager(supabase, tenantId, { kind: 'preference' }),
    listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
    getWorkforceScheduleSettings(supabase, tenantId, locationId),
  ]);
  if (staffResult.status !== 'success') return staffResult;
  if (shiftTypesResult.status !== 'success') return shiftTypesResult;
  if (preferencesResult.status !== 'success') return preferencesResult;
  if (existingResult.status !== 'success') return existingResult;
  if (scheduleSettingsResult.status !== 'success') return scheduleSettingsResult;

  const scheduleSettings = scheduleSettingsResult.data;

  // `listWorkforceShiftTypes` returns every shift type for the tenant -- scope
  // to the resolved location so a sibling location's shift types can never
  // widen the windows / headcount this run is authoritative for.
  const locationShiftTypes = shiftTypesResult.data.filter((st) => st.locationId === locationId);
  const activeWindowCodes = deriveActiveScheduleWindowCodes(locationShiftTypes);
  if (activeWindowCodes.length === 0) return { status: 'invalid_config', reason: 'no_active_windows' };

  const staffingRequirements = buildAuthoritativeStaffingRequirements(
    activeWindowCodes,
    scheduleSettings?.requiredHeadcountByWeekday,
  );
  if (!hasPositiveStaffingRequirement(staffingRequirements)) {
    return { status: 'invalid_config', reason: 'no_staffing_requirement' };
  }

  const employees: AutoDistributeEmployee[] = staffResult.data
    .filter((s) => s.locationId === locationId)
    .map((s) => ({ employeeId: s.staffId, isActive: s.isActive }));

  const preferences: AutoDistributePreference[] = preferencesResult.data
    .filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd)
    .map((r) => ({
      employeeId: r.employeeId,
      workDate: r.workDate,
      shiftTypeId: r.shiftTypeId,
      isUnavailable: r.isUnavailable,
    }));

  // Location isolation: `listShiftAssignments` is tenant-scoped only, so a
  // multi-location tenant's Location B rows are in `existingResult.data` too.
  // Scope to the resolved location BEFORE building the algorithm snapshot --
  // Location A's auto-create must be a pure function of Location A's own
  // employees, shift types, settings and existing shifts. Without this a
  // Location-A employee who also holds a shift recorded at Location B would
  // have that foreign shift block their day / count toward their hours here.
  const existingAssignments = existingResult.data
    .filter((a) => a.locationId === locationId)
    .map((a) => toAutoDistributeExistingAssignment(a, timeZone))
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const result = autoDistribute({
    employees,
    shiftTypes: locationShiftTypes.map((st) => ({
      shiftTypeId: st.shiftTypeId,
      code: st.code,
      startsAtLocal: st.startsAtLocal,
      endsAtLocal: st.endsAtLocal,
      breakMinutes: st.breakMinutes,
      sortOrder: st.sortOrder,
      isActive: st.isActive,
    })),
    preferences,
    staffingRequirements,
    existingAssignments,
    options: {
      periodStart,
      periodEnd,
      maxPeriodHours: scheduleSettings?.maxMonthlyHours,
      overwriteExisting: false,
    },
  });

  // Re-running "auto-create" for a week REPLACES the previous unconfirmed
  // proposal rather than stacking a second one: clear this location/period's
  // `published = false` rows first. `published = true` (confirmed/manual)
  // shifts are never matched, so a manager's own shifts survive untouched.
  const clearResult = await clearUnconfirmedDraftAssignmentsInPeriod(
    supabase,
    tenantId,
    locationId,
    fromIso,
    toIsoExclusive,
  );
  if (clearResult.status !== 'success') return clearResult;

  const insertRows = result.draftAssignments.map((draft) =>
    mapDraftAssignmentToInsertRow(draft, tenantId, locationId, timeZone),
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

/**
 * Weekly Schedule Founder Review Round 2 (2026-08-22): Manager UX no longer
 * exposes Draft/Published at all -- "assign a shift, Save, done" -- so every
 * manual write from the canonical Manager dashboard publishes immediately,
 * hardcoded here rather than left to whatever the client's FormData happens
 * to carry. This does not touch `insertDraftShiftAssignments` (bulk
 * Auto-create, still drafts -- see `runAutoDistribution` above) or the
 * `_client-preview` demo package's own separate write actions.
 */
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
    published: true,
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
    published: true,
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
