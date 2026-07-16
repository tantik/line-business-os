'use server';

import { submitCorrectionRequest as submitCorrectionRequestWrite, type WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { listMyAttendance, submitWorkReport as submitWorkReportWrite, type WorkforceAttendance } from '@/lib/workforce/attendance';
import { localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import { parseSubmitCorrectionRequestInput, parseSubmitWorkReportInput } from '@/lib/workforce/attendance-input';
import { resolvePreviewStaffContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

/**
 * Phase 1N-4C Slice B2b - preview-specific staff Server Actions for work
 * report (attendance) and attendance-correction-request submission.
 * Preview-only wrappers around the existing, unchanged `submitWorkReport`/
 * `submitCorrectionRequest` service-layer functions - never imports
 * `attendance-actions.ts` (the dashboard action module).
 *
 * Deliberately a separate file from the B2a manager attendance action
 * (`attendance-actions.ts`, `previewDecideCorrectionRequest`): Next.js's
 * Server Action manifest registers every export of a `'use server'` module
 * as a worker for every route that imports ANY export from that module, so
 * colocating a manager-only and a staff-only action in one file would make
 * each route's bundle (wrongly) register the other role's action too -
 * confirmed empirically against `.next/server/server-reference-manifest.json`
 * during this slice's verification.
 *
 * `employeeId`/`locationId`/`timeZone` are always the server-resolved,
 * self-bound values from `resolvePreviewStaffContext()` - a submitted
 * employee/tenant/location field in `formData` is never read.
 */
export async function previewSubmitWorkReport(formData: FormData): Promise<PreviewWriteResult<WorkforceAttendance>> {
  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, employeeId, locationId, timeZone } = contextResult.context;

  const input = parseSubmitWorkReportInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  const clockIn = input.clockInLocal ? localDateTimeToUtcIso(input.workDate, input.clockInLocal, timeZone) : null;
  const clockOut = input.clockOutLocal ? localDateTimeToUtcIso(input.workDate, input.clockOutLocal, timeZone) : null;

  const result = await submitWorkReportWrite(supabase, tenantId, {
    employeeId,
    locationId,
    workDate: input.workDate,
    clockIn,
    clockOut,
    transportationCost: input.transportationCost,
    dailyMessage: input.dailyMessage,
  });
  return mapWorkforceWriteResult(result);
}

/**
 * A submitted `attendanceId` is a legitimate optional target reference, never
 * trusted merely because it parses as a UUID (B2b plan Section 6): it is
 * independently re-verified against the caller's own self-scoped attendance
 * read (`listMyAttendance`, RLS `wf_attendance_self_select`) - never the
 * manager-wide `listAttendanceForManager` - checking existence, tenant
 * (implicit in `listMyAttendance`'s own tenant filter), own-employee, and
 * resolved-location ownership before the mutation.
 */
export async function previewSubmitCorrectionRequest(
  formData: FormData,
): Promise<PreviewWriteResult<WorkforceShiftRequest>> {
  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, employeeId, locationId } = contextResult.context;

  const input = parseSubmitCorrectionRequestInput(formData);
  if (!input) return PREVIEW_INVALID_INPUT_RESULT;

  if (input.attendanceId) {
    const myAttendanceResult = await listMyAttendance(supabase, tenantId);
    if (myAttendanceResult.status !== 'success') return mapWorkforceWriteResult(myAttendanceResult);
    const target = myAttendanceResult.data.find((a) => a.attendanceId === input.attendanceId);
    if (!target || target.employeeId !== employeeId || target.locationId !== locationId) return { status: 'not_found' };
  }

  const result = await submitCorrectionRequestWrite(supabase, tenantId, {
    employeeId,
    locationId,
    workDate: input.workDate,
    attendanceId: input.attendanceId,
    details: input.message ? { message: input.message } : {},
  });
  return mapWorkforceWriteResult(result);
}
