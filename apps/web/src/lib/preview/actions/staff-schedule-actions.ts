'use server';

import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { submitShiftPreference as submitShiftPreferenceWrite, type WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { listShiftAssignments, type WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { parseSubmitShiftPreferenceInput } from '@/lib/workforce/schedule-input';
import { getWeekPeriod } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import { resolvePreviewStaffContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/** Mirrors the same bound the Staff page and week-nav chrome enforce (`MAX_WEEK_OFFSET` in `mame-to-cha/page.tsx`/`preview-staff-schedule.tsx`) - never trust a client-supplied offset outside this range. */
const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

/**
 * Phase 1N-4C Slice B2b - preview-specific staff Server Action for shift
 * preference submission. Preview-only wrapper around the existing, unchanged
 * `submitShiftPreference` service-layer function - never imports
 * `schedule-actions.ts` (the dashboard action module).
 *
 * Deliberately a separate file from the B2a manager schedule actions
 * (`schedule-actions.ts`): Next.js's Server Action manifest registers every
 * export of a `'use server'` module as a worker for every route that imports
 * ANY export from that module, so colocating a manager-only and a staff-only
 * action in one file would make each route's bundle (wrongly) register the
 * other role's action too - confirmed empirically against
 * `.next/server/server-reference-manifest.json` during this slice's
 * verification.
 *
 * `employeeId`/`locationId` are always the server-resolved, self-bound values
 * from `resolvePreviewStaffContext()` - never read from `formData` (B2b plan
 * Section 2/3). `workforce.shift_types.location_id` is a real, non-null,
 * FK-enforced column (0025) - shift types are location-specific, not
 * tenant-wide - so a submitted `shiftTypeId` is verified to belong to both the
 * strict tenant AND the caller's own resolved location, and to be active,
 * before the service-layer call.
 */
export async function previewSubmitShiftPreference(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceShiftRequest>> {
  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, employeeId, locationId } = contextResult.context;

  const input = parseSubmitShiftPreferenceInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  if (input.shiftTypeId) {
    const shiftTypesResult = await listWorkforceShiftTypes(supabase, tenantId);
    if (shiftTypesResult.status !== 'success') return mapWorkforceWriteResult(shiftTypesResult);
    const shiftType = shiftTypesResult.data.find((st) => st.shiftTypeId === input.shiftTypeId);
    if (!shiftType || shiftType.locationId !== locationId || !shiftType.isActive) return { status: 'not_found' };
  }

  const result = await submitShiftPreferenceWrite(supabase, tenantId, {
    employeeId,
    locationId,
    workDate: input.workDate,
    shiftTypeId: input.shiftTypeId,
    isUnavailable: input.isUnavailable,
  });
  return mapWorkforceWriteResult(result);
}

export interface PreviewStaffScheduleWeek {
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  assignments: WorkforceShiftAssignment[];
}

/**
 * Staff-only: re-read one week's PUBLISHED shift assignments for the caller's
 * own resolved location. Live-sync poll target for `PreviewStaffSchedule`
 * (Founder P1, 2026-08-13, Manager-\>Staff propagation) - deliberately scoped
 * to exactly one week (never the full ±8-week window `mame-to-cha/page.tsx`
 * loads once at render) so a background poll stays a small, targeted query,
 * never a full-page/full-history refetch. Filters to `published` the same
 * way the Staff page's initial server-render does - a Manager's still-draft
 * edit is never surfaced here, preserving the existing draft/published
 * schedule contract for Staff.
 */
export async function previewGetStaffScheduleWeek(weekOffset: number): Promise<PreviewWriteResult<PreviewStaffScheduleWeek>> {
  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const rawOffset = Number.isInteger(weekOffset) ? weekOffset : 0;
  const clampedOffset = Math.max(MIN_WEEK_OFFSET, Math.min(MAX_WEEK_OFFSET, rawOffset));

  const nowIso = new Date().toISOString();
  const { periodStart, periodEnd } = getWeekPeriod(nowIso, timeZone, clampedOffset);
  const fromIso = localDateTimeToUtcIso(periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(periodEnd, 1), '00:00', timeZone);

  const result = await listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive });
  if (result.status !== 'success') return mapWorkforceWriteResult(result);

  const publishedAssignments = result.data.filter((a) => a.published && a.locationId === locationId);
  return { status: 'success', data: { periodStart, periodEnd, weekOffset: clampedOffset, assignments: publishedAssignments } };
}
