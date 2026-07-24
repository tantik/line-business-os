'use server';

import { submitCorrectionRequest as submitCorrectionRequestWrite, type WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { listMyAttendance, submitWorkReport as submitWorkReportWrite, type WorkforceAttendance } from '@/lib/workforce/attendance';
import { localDateTimeToUtcIso, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
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

  // Omitted clock fields must remain unchanged. Passing null here would erase
  // clock events recorded by the dedicated clock-in/clock-out actions.
  const clockIn = input.clockInLocal ? localDateTimeToUtcIso(input.workDate, input.clockInLocal, timeZone) : undefined;
  const clockOut = input.clockOutLocal ? localDateTimeToUtcIso(input.workDate, input.clockOutLocal, timeZone) : undefined;

  const result = await submitWorkReportWrite(supabase, tenantId, {
    employeeId,
    locationId,
    workDate: input.workDate,
    clockIn,
    clockOut,
    actualBreakMinutes: input.actualBreakMinutes ?? undefined,
    transportationCost: input.transportationCost,
    dailyMessage: input.dailyMessage,
  });
  return mapWorkforceWriteResult(result);
}

/** Clock in at the server-observed current instant for the resolved staff location. */
export async function previewClockIn(): Promise<PreviewWriteResult<WorkforceAttendance>> {
  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, employeeId, locationId, timeZone } = contextResult.context;
  const nowIso = new Date().toISOString();
  const { workDate } = utcIsoToLocalDateTime(nowIso, timeZone);

  const attendanceResult = await listMyAttendance(supabase, tenantId);
  if (attendanceResult.status !== 'success') return mapWorkforceWriteResult(attendanceResult);
  const existing = attendanceResult.data.find(
    (entry) =>
      entry.workDate === workDate &&
      entry.employeeId === employeeId &&
      entry.locationId === locationId,
  );
  if (existing?.clockIn || existing?.clockOut) return { status: 'duplicate' };

  return mapWorkforceWriteResult(
    await submitWorkReportWrite(supabase, tenantId, {
      employeeId,
      locationId,
      workDate,
      clockIn: nowIso,
      actualBreakMinutes: 0,
    }),
  );
}

/** Clock out at the server-observed current instant after an exact 0/30/60 break choice. */
export async function previewClockOut(formData: FormData): Promise<PreviewWriteResult<WorkforceAttendance>> {
  const rawBreakMinutes = formData.get('actualBreakMinutes');
  if (rawBreakMinutes !== '0' && rawBreakMinutes !== '30' && rawBreakMinutes !== '60') {
    return PREVIEW_INVALID_INPUT_RESULT;
  }

  const contextResult = await resolvePreviewStaffContext();
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, employeeId, locationId, timeZone } = contextResult.context;
  const nowIso = new Date().toISOString();
  const { workDate } = utcIsoToLocalDateTime(nowIso, timeZone);

  const attendanceResult = await listMyAttendance(supabase, tenantId);
  if (attendanceResult.status !== 'success') return mapWorkforceWriteResult(attendanceResult);
  const existing = attendanceResult.data.find(
    (entry) =>
      entry.workDate === workDate &&
      entry.employeeId === employeeId &&
      entry.locationId === locationId,
  );
  if (!existing?.clockIn || existing.clockOut) return { status: 'not_found' };

  return mapWorkforceWriteResult(
    await submitWorkReportWrite(supabase, tenantId, {
      employeeId,
      locationId,
      workDate,
      clockOut: nowIso,
      actualBreakMinutes: Number(rawBreakMinutes),
    }),
  );
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
