'use server';

import { getWorkforceStaffDirectoryEntryById, listWorkforceStaffDirectory } from '@/lib/workforce/employees';
import { getWorkforceShiftTypeById, listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import {
  createShiftAssignment as createShiftAssignmentWrite,
  getShiftAssignmentById,
  insertDraftShiftAssignments,
  listShiftAssignments,
  mapDraftAssignmentToInsertRow,
  toAutoDistributeExistingAssignment,
  updateShiftAssignment as updateShiftAssignmentWrite,
  publishShiftAssignments,
  type WorkforceShiftAssignment,
} from '@/lib/workforce/shift-assignments';
import {
  autoDistribute,
  deriveActiveScheduleWindowCodes,
  type AutoDistributeEmployee,
  type AutoDistributePreference,
} from '@/lib/workforce/auto-distribute';
import { buildAuthoritativeStaffingRequirements } from '@/lib/workforce/auto-distribution-authority';
import { getWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  parseCreateShiftAssignmentInput,
  parsePublishScheduleInput,
  parseRunAutoDistributionInput,
  parseUpdateShiftAssignmentInput,
} from '@/lib/workforce/schedule-input';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteFailureStatus, type PreviewWriteResult } from '../write-result';
import { classifyRawAutoDistributionInput, hasPositiveHeadcount, type AutoDistributionInvalidInputReason } from '../auto-distribution-requirements';
import { getWeekPeriod } from '@/lib/workforce/period';

/** Mirrors the same bound the Manager page and week-nav chrome enforce (`MAX_WEEK_OFFSET` in both `manager/page.tsx` and `preview-manager-view-chrome.tsx`) - never trust a client-supplied offset outside this range. */
const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

/**
 * Phase 1N-4C Slice B2a - preview-specific manager Server Actions for shift
 * create/update/unassign, auto-distribution, and schedule publish.
 * Preview-only wrappers around the existing, unchanged `shift-assignments.ts`/
 * `auto-distribute.ts` service-layer functions - never imports
 * `schedule-actions.ts` (the dashboard action module).
 *
 * Every wrapper always substitutes the server-resolved active location
 * (`resolvePreviewManagerContext`) for any client-supplied `locationId` -
 * a submitted `locationId` field is never read as authority (B2 plan
 * Section 3.0/8.1). Every submitted target-record id (`employeeId`,
 * `shiftTypeId`, `assignmentId`) is independently re-verified against the
 * strict tenant + resolved location before the service-layer call.
 */

function withResolvedLocationId(formData: FormData, locationId: string): FormData {
  const scoped = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === 'locationId') continue;
    scoped.append(key, value);
  }
  scoped.set('locationId', locationId);
  return scoped;
}

export async function previewCreateShiftAssignment(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceShiftAssignment>> {
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const input = parseCreateShiftAssignmentInput(withResolvedLocationId(formData, locationId));
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const [staffResult, shiftTypesResult] = await Promise.all([
    getWorkforceStaffDirectoryEntryById(supabase, tenantId, input.employeeId),
    input.shiftTypeId ? getWorkforceShiftTypeById(supabase, tenantId, input.shiftTypeId) : Promise.resolve(null),
  ]);
  if (staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult);
  const employee = staffResult.data;
  if (!employee || employee.locationId !== locationId) return { status: 'not_found' };

  if (input.shiftTypeId) {
    if (!shiftTypesResult || shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult!);
    const shiftType = shiftTypesResult.data;
    if (!shiftType) return { status: 'not_found' };
  }

  const result = await createShiftAssignmentWrite(supabase, tenantId, locationId, {
    employeeId: input.employeeId,
    shiftTypeId: input.shiftTypeId,
    startsAt: localDateTimeToUtcIso(input.workDate, input.startsAtLocal, timeZone),
    endsAt: localDateTimeToUtcIso(input.workDate, input.endsAtLocal, timeZone),
    breakMinutes: input.breakMinutes,
    role: input.role,
    notes: input.notes,
  });
  return mapWorkforceWriteResult(result);
}

export async function previewUpdateShiftAssignment(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceShiftAssignment>> {
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  // `locationId` here is parsed only to satisfy the shared parser's shape -
  // it is never read for security or timezone purposes below; the resolved
  // `timeZone`/`locationId` from context are used instead.
  const input = parseUpdateShiftAssignmentInput(withResolvedLocationId(formData, locationId));
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  // Assignment location is not inferable from "the tenant has one active
  // location" - a target row may sit at an inactive/historical location
  // (B2 plan Section 8.1). Verified independently via an unbounded read.
  //
  // This read and the staff/shift-type reads below are independent of each
  // other (none reads a value the others produce), so they run as one
  // Promise.all instead of "read the assignment, then read staff/shift-type"
  // -- collapsing what was a sequential extra round trip into the same
  // parallel batch, on the same latency-sensitive Save path already fixed
  // once for unassign in PR #162.
  const isUnassign = !input.employeeId;
  const [existingResult, staffResult, shiftTypesResult] = await Promise.all([
    getShiftAssignmentById(supabase, tenantId, input.assignmentId),
    input.employeeId ? getWorkforceStaffDirectoryEntryById(supabase, tenantId, input.employeeId) : Promise.resolve(null),
    !isUnassign && input.shiftTypeId ? getWorkforceShiftTypeById(supabase, tenantId, input.shiftTypeId) : Promise.resolve(null),
  ]);
  if (existingResult.status !== 'success') return mapWorkforceWriteResult(existingResult);
  const target = existingResult.data;
  if (!target || target.locationId !== locationId) return { status: 'not_found' };
  if (input.employeeId) {
    if (!staffResult || staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult!);
    const employee = staffResult.data;
    if (!employee || employee.locationId !== locationId) return { status: 'not_found' };
  }

  if (!isUnassign && input.shiftTypeId) {
    if (!shiftTypesResult || shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult!);
    const shiftType = shiftTypesResult.data;
    if (!shiftType) return { status: 'not_found' };
  }

  const result = await updateShiftAssignmentWrite(supabase, tenantId, input.assignmentId, {
    employeeId: input.employeeId,
    shiftTypeId: isUnassign ? target.shiftTypeId : input.shiftTypeId,
    startsAt: isUnassign ? target.startsAt : localDateTimeToUtcIso(input.workDate, input.startsAtLocal, timeZone),
    endsAt: isUnassign ? target.endsAt : localDateTimeToUtcIso(input.workDate, input.endsAtLocal, timeZone),
    breakMinutes: isUnassign ? target.breakMinutes : input.breakMinutes,
    role: isUnassign ? target.role : input.role,
    notes: isUnassign ? target.notes : input.notes,
    // Unassign is the final visible removal state, not a draft schedule row.
    // Mark the retained audit row published so it cannot create a phantom
    // "unpublished shift" alert after the cell has already disappeared.
    published: isUnassign ? true : input.published,
  });
  return mapWorkforceWriteResult(result);
}

export type PreviewRunAutoDistributionResult =
  | { status: 'success'; data: RunAutoDistributionActionResult }
  | { status: 'invalid_input'; reason?: AutoDistributionInvalidInputReason }
  | { status: Exclude<PreviewWriteFailureStatus, 'invalid_input'> };

function invalidAutoDistributionInput(reason: AutoDistributionInvalidInputReason): PreviewRunAutoDistributionResult {
  return { status: 'invalid_input', reason };
}

export async function previewRunAutoDistribution(
  input: unknown,
): Promise<PreviewRunAutoDistributionResult> {
  // An empty staffingRequirements array - or one containing only
  // requiredHeadcount: 0 rows - can never produce a draft assignment for any
  // windowed shift type (AM/PM/ALL/A-P/SHORT_AM): autoDistribute() defaults
  // each window's requiredHeadcount to 0 when no rule covers it, and
  // `filled >= required` (0 >= 0) is immediately true whenever `required` is
  // 0, so every windowed preference is reported unplaced, never assigned
  // (confirmed empirically against the real algorithm during review). This
  // coarse check runs first - before tenant/module/location resolution or
  // any Supabase call - so a request that could not possibly do real work is
  // rejected before doing any work at all, not merely before the algorithm.
  // `classifyRawAutoDistributionInput` distinguishes a malformed payload from
  // one that's shaped correctly but carries only non-positive headcounts, so
  // the caller can report the real cause instead of a generic message.
  const rawReason = classifyRawAutoDistributionInput(input);
  if (rawReason) return invalidAutoDistributionInput(rawReason);

  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const rawInput = typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>), locationId } : null;
  const parsed = parseRunAutoDistributionInput(rawInput);
  if (!parsed) return invalidAutoDistributionInput('malformed_input');

  // Authoritative re-check on the fully-parsed/validated requirements (the
  // raw pre-check above is a coarse `typeof === 'number'` scan, not a
  // substitute for this) - a zero-headcount requirement remains valid on its
  // own (it legitimately expresses "no one is needed for this window"), but
  // the overall request must still contain at least one requirement above
  // zero before the wrapper ever reports "success".
  if (!hasPositiveHeadcount(parsed.staffingRequirements)) return invalidAutoDistributionInput('no_positive_headcount');

  const fromIso = localDateTimeToUtcIso(parsed.periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(parsed.periodEnd, 1), '00:00', timeZone);

  const [staffResult, shiftTypesResult, preferencesResult, existingResult, scheduleSettingsResult] = await Promise.all([
    listWorkforceStaffDirectory(supabase, tenantId),
    listWorkforceShiftTypes(supabase, tenantId),
    listShiftRequestsForManager(supabase, tenantId, { kind: 'preference' }),
    listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
    getWorkforceScheduleSettings(supabase, tenantId, locationId),
  ]);
  if (staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult);
  if (shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult);
  if (preferencesResult.status !== 'success') return mapWorkforceWriteResult(preferencesResult);
  if (existingResult.status !== 'success') return mapWorkforceWriteResult(existingResult);
  if (scheduleSettingsResult.status !== 'success') return mapWorkforceWriteResult(scheduleSettingsResult);

  // Authoritative override (post-review fix): the client-submitted
  // `staffingRequirements` above only ever satisfies the input parser's
  // shape validation - the actual windows and per-weekday headcount an
  // auto-distribution run is allowed to fill are always re-derived here from
  // the server-resolved tenant/location's own active shift types
  // (`deriveActiveScheduleWindowCodes`) and schedule settings
  // (`getWorkforceScheduleSettings`), never trusted from the request body. A
  // stale or manipulated client cannot widen a window, inflate a headcount,
  // or bypass the "no active windows configured" state this way.
  //
  // `listWorkforceShiftTypes` returns every shift type for the tenant, not
  // just the resolved location's (it has no location filter of its own) -
  // scope to the resolved `locationId` here so a shift type belonging to a
  // different location in the same tenant can never widen the active windows
  // or headcount this run is authoritative for.
  const locationShiftTypes = shiftTypesResult.data.filter((st) => st.locationId === locationId);
  const activeWindowCodes = deriveActiveScheduleWindowCodes(locationShiftTypes);
  if (activeWindowCodes.length === 0) return invalidAutoDistributionInput('no_active_windows');
  // Shared single source of truth with the canonical Manager
  // `runAutoDistribution` (`@/lib/workforce/auto-distribution-authority`) --
  // one row per (weekday x active window) carrying that weekday's stored
  // headcount, never trusted from the request body.
  const authoritativeStaffingRequirements = buildAuthoritativeStaffingRequirements(
    activeWindowCodes,
    scheduleSettingsResult.data?.requiredHeadcountByWeekday,
  );
  if (!hasPositiveHeadcount(authoritativeStaffingRequirements)) return invalidAutoDistributionInput('no_positive_headcount');
  parsed.staffingRequirements = authoritativeStaffingRequirements;

  const employees: AutoDistributeEmployee[] = staffResult.data
    .filter((s) => s.locationId === locationId)
    .map((s) => ({ employeeId: s.staffId, isActive: s.isActive }));

  const preferences: AutoDistributePreference[] = preferencesResult.data
    .filter((r) => r.workDate >= parsed.periodStart && r.workDate <= parsed.periodEnd)
    .map((r) => ({
      employeeId: r.employeeId,
      workDate: r.workDate,
      shiftTypeId: r.shiftTypeId,
      isUnavailable: r.isUnavailable,
    }));

  // Location isolation (same as the canonical `runAutoDistribution`):
  // `listShiftAssignments` is tenant-scoped only, so scope the existing-shift
  // snapshot to the resolved location before it reaches the algorithm -- a
  // sibling location's rows must never influence this run.
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
    staffingRequirements: parsed.staffingRequirements,
    existingAssignments,
    options: {
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      maxPeriodHours: parsed.maxPeriodHours,
      overwriteExisting: parsed.overwriteExisting,
    },
  });

  const insertRows = result.draftAssignments.map((draft) => mapDraftAssignmentToInsertRow(draft, tenantId, locationId, timeZone));
  const insertResult = await insertDraftShiftAssignments(supabase, insertRows);
  if (insertResult.status !== 'success') return mapWorkforceWriteResult(insertResult);

  return {
    status: 'success',
    data: {
      shortages: result.shortages,
      unplaced: result.unplaced,
      nonSubmitters: result.nonSubmitters,
      draftCount: insertResult.data.inserted,
      // The Undo button is a canonical-app-only affordance (`/manager`, PR
      // WP-G) -- the preview/demo surface doesn't wire it up, but still
      // satisfies the shared result type.
      createdAssignmentIds: insertResult.data.assignmentIds,
    },
  };
}

export async function previewPublishSchedule(formData: FormData): Promise<PreviewWriteResult<{ published: number }>> {
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const input = parsePublishScheduleInput(withResolvedLocationId(formData, locationId));
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const fromIso = localDateTimeToUtcIso(input.periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(input.periodEnd, 1), '00:00', timeZone);

  const result = await publishShiftAssignments(supabase, tenantId, locationId, fromIso, toIsoExclusive);
  return mapWorkforceWriteResult(result);
}

export interface PreviewScheduleWeek {
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  assignments: WorkforceShiftAssignment[];
}

/**
 * Manager-only: re-read one week's shift assignments for the manager's own
 * resolved location. Preview Manager architecture (perf phase 2) - the week
 * prev/today/next control and the auto-distribute/publish actions call this
 * instead of a full-page navigation/`router.refresh()`, so changing week (or
 * a schedule write) refreshes only the schedule card's own data - no
 * Inventory/Staff/Recipes re-fetch, no page navigation, no scroll reset.
 */
export async function previewGetScheduleWeek(weekOffset: number): Promise<PreviewWriteResult<PreviewScheduleWeek>> {
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, timeZone } = contextResult.context;

  const rawOffset = Number.isInteger(weekOffset) ? weekOffset : 0;
  const clampedOffset = Math.max(MIN_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, rawOffset));

  const nowIso = new Date().toISOString();
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, timeZone, clampedOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', timeZone);

  const result = await listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive });
  if (result.status !== 'success') return mapWorkforceWriteResult(result);

  return { status: 'success', data: { periodStart, periodEnd, weekOffset: clampedOffset, assignments: result.data } };
}
