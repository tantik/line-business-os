'use server';

import { listWorkforceStaffDirectory } from '@/lib/workforce/employees';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
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
import { autoDistribute, type AutoDistributeEmployee, type AutoDistributePreference } from '@/lib/workforce/auto-distribute';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import {
  parseCreateShiftAssignmentInput,
  parsePublishScheduleInput,
  parseRunAutoDistributionInput,
  parseUpdateShiftAssignmentInput,
} from '@/lib/workforce/schedule-input';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';
import { hasPositiveHeadcount, rawInputHasPositiveRequirement } from '../auto-distribution-requirements';

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
    listWorkforceStaffDirectory(supabase, tenantId),
    input.shiftTypeId ? listWorkforceShiftTypes(supabase, tenantId) : Promise.resolve(null),
  ]);
  if (staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult);
  const employee = staffResult.data.find((s) => s.staffId === input.employeeId);
  if (!employee || employee.locationId !== locationId) return { status: 'not_found' };

  if (input.shiftTypeId) {
    if (!shiftTypesResult || shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult!);
    const shiftType = shiftTypesResult.data.find((st) => st.shiftTypeId === input.shiftTypeId);
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
  const existingResult = await getShiftAssignmentById(supabase, tenantId, input.assignmentId);
  if (existingResult.status !== 'success') return mapWorkforceWriteResult(existingResult);
  const target = existingResult.data;
  if (!target || target.locationId !== locationId) return { status: 'not_found' };

  const [staffResult, shiftTypesResult] = await Promise.all([
    input.employeeId ? listWorkforceStaffDirectory(supabase, tenantId) : Promise.resolve(null),
    input.shiftTypeId ? listWorkforceShiftTypes(supabase, tenantId) : Promise.resolve(null),
  ]);
  if (input.employeeId) {
    if (!staffResult || staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult!);
    const employee = staffResult.data.find((s) => s.staffId === input.employeeId);
    if (!employee || employee.locationId !== locationId) return { status: 'not_found' };
  }

  if (input.shiftTypeId) {
    if (!shiftTypesResult || shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult!);
    const shiftType = shiftTypesResult.data.find((st) => st.shiftTypeId === input.shiftTypeId);
    if (!shiftType) return { status: 'not_found' };
  }

  const result = await updateShiftAssignmentWrite(supabase, tenantId, input.assignmentId, {
    employeeId: input.employeeId,
    shiftTypeId: input.shiftTypeId,
    startsAt: localDateTimeToUtcIso(input.workDate, input.startsAtLocal, timeZone),
    endsAt: localDateTimeToUtcIso(input.workDate, input.endsAtLocal, timeZone),
    breakMinutes: input.breakMinutes,
    role: input.role,
    notes: input.notes,
    published: input.published,
  });
  return mapWorkforceWriteResult(result);
}

export async function previewRunAutoDistribution(
  input: unknown,
): Promise<PreviewWriteResult<RunAutoDistributionActionResult>> {
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
  if (!rawInputHasPositiveRequirement(input)) return PREVIEW_INVALID_INPUT_RESULT;

  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const rawInput = typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>), locationId } : null;
  const parsed = parseRunAutoDistributionInput(rawInput);
  if (!parsed) return PREVIEW_INVALID_INPUT_RESULT;

  // Authoritative re-check on the fully-parsed/validated requirements (the
  // raw pre-check above is a coarse `typeof === 'number'` scan, not a
  // substitute for this) - a zero-headcount requirement remains valid on its
  // own (it legitimately expresses "no one is needed for this window"), but
  // the overall request must still contain at least one requirement above
  // zero before the wrapper ever reports "success".
  if (!hasPositiveHeadcount(parsed.staffingRequirements)) return PREVIEW_INVALID_INPUT_RESULT;

  const fromIso = localDateTimeToUtcIso(parsed.periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(parsed.periodEnd, 1), '00:00', timeZone);

  const [staffResult, shiftTypesResult, preferencesResult, existingResult] = await Promise.all([
    listWorkforceStaffDirectory(supabase, tenantId),
    listWorkforceShiftTypes(supabase, tenantId),
    listShiftRequestsForManager(supabase, tenantId, { kind: 'preference' }),
    listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
  ]);
  if (staffResult.status !== 'success') return mapWorkforceWriteResult(staffResult);
  if (shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult);
  if (preferencesResult.status !== 'success') return mapWorkforceWriteResult(preferencesResult);
  if (existingResult.status !== 'success') return mapWorkforceWriteResult(existingResult);

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
