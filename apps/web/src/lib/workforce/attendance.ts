import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';

/** Flat row shape returned by `api.workforce_attendance`. */
interface ApiWorkforceAttendanceRow {
  attendance_id: string;
  tenant_id: string;
  location_id: string;
  employee_id: string;
  shift_id: string | null;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  actual_break_minutes: number;
  status: string;
  transportation_cost: number | null;
  daily_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkforceAttendance {
  attendanceId: string;
  tenantId: string;
  locationId: string;
  employeeId: string;
  shiftId: string | null;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  actualBreakMinutes: number;
  status: string;
  transportationCost: number | null;
  dailyMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const ATTENDANCE_SELECT =
  'attendance_id, tenant_id, location_id, employee_id, shift_id, work_date, clock_in, clock_out, actual_break_minutes, status, transportation_cost, daily_message, created_at, updated_at';

function mapAttendanceRow(row: ApiWorkforceAttendanceRow): WorkforceAttendance {
  return {
    attendanceId: row.attendance_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    employeeId: row.employee_id,
    shiftId: row.shift_id,
    workDate: row.work_date,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    actualBreakMinutes: row.actual_break_minutes,
    status: row.status,
    transportationCost: row.transportation_cost,
    dailyMessage: row.daily_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Read the caller's own attendance/work-report rows (self-scoped by RLS, `wf_attendance_self_select`). */
export async function listMyAttendance(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceAttendance[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('workforce_attendance').select(ATTENDANCE_SELECT).eq('tenant_id', tenantId);
    if (error) return mapWorkforceReadError(error, 'read your attendance');

    const rows = (data ?? []) as ApiWorkforceAttendanceRow[];
    const entries = rows.map(mapAttendanceRow).sort((a, b) => a.workDate.localeCompare(b.workDate));
    return { status: 'success', data: entries };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading your attendance.',
    };
  }
}

/** Manager read of attendance (RLS `wf_attendance_manage`, `workforce.attendance.manage`, unchanged -- every employee's rows, not self-scoped). */
export async function listAttendanceForManager(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceAttendance[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('workforce_attendance').select(ATTENDANCE_SELECT).eq('tenant_id', tenantId);
    if (error) return mapWorkforceReadError(error, 'read attendance');

    const rows = (data ?? []) as ApiWorkforceAttendanceRow[];
    const entries = rows
      .map(mapAttendanceRow)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
    return { status: 'success', data: entries };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading attendance.',
    };
  }
}

export interface SubmitWorkReportInput {
  employeeId: string;
  locationId: string;
  workDate: string;
  clockIn?: string | null;
  clockOut?: string | null;
  actualBreakMinutes?: number;
  status?: string;
  transportationCost?: number | null;
  dailyMessage?: string | null;
}

function buildAttendancePayload(input: SubmitWorkReportInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { location_id: input.locationId };
  if (input.clockIn !== undefined) payload.clock_in = input.clockIn;
  if (input.clockOut !== undefined) payload.clock_out = input.clockOut;
  if (input.actualBreakMinutes !== undefined) payload.actual_break_minutes = input.actualBreakMinutes;
  if (input.status !== undefined) payload.status = input.status;
  if (input.transportationCost !== undefined) payload.transportation_cost = input.transportationCost;
  if (input.dailyMessage !== undefined) payload.daily_message = input.dailyMessage;
  return payload;
}

export interface ApplyApprovedCorrectionInput {
  /**
   * The attendance row the correction request was submitted against, or
   * `null` when the staff member had no attendance row for that day at
   * submission time (e.g. a fully missed clock-in/out being corrected from
   * scratch). `employeeId`/`workDate`/`locationId` are always required so a
   * `null` target can still be resolved to an existing row or created.
   */
  attendanceId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string;
  clockIn?: string;
  clockOut?: string;
  actualBreakMinutes?: number;
}

/**
 * Apply an approved correction request's requested values to the attendance
 * row it targets. When `attendanceId` is set, updates that row directly
 * (never by employee/work_date lookup -- the request already carries the
 * exact row it corrects). When `attendanceId` is `null` (no attendance row
 * existed for that employee/day when the correction was submitted), falls
 * back to the same find-or-create-by-day upsert `submitWorkReport` uses, so
 * approving a from-scratch correction actually produces an attendance row
 * instead of silently no-op-ing. Relies entirely on RLS (`wf_attendance_manage`,
 * `workforce.attendance.manage`): a manager who can decide the request but
 * lacks attendance-manage returns `not_found` here rather than a fabricated
 * success, same as every other RLS-filtered zero-row write in this module.
 */
export async function applyApprovedCorrection(
  supabase: SupabaseClient,
  tenantId: string,
  input: ApplyApprovedCorrectionInput,
): Promise<WorkforceWriteResult<WorkforceAttendance>> {
  try {
    const payload: Record<string, unknown> = {};
    if (input.clockIn !== undefined) payload.clock_in = input.clockIn;
    if (input.clockOut !== undefined) payload.clock_out = input.clockOut;
    if (input.actualBreakMinutes !== undefined) payload.actual_break_minutes = input.actualBreakMinutes;

    if (input.attendanceId) {
      const { data, error } = await supabase
        .schema('api')
        .from('workforce_attendance')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('attendance_id', input.attendanceId)
        .select(ATTENDANCE_SELECT)
        .maybeSingle();

      if (error) return mapWorkforceWriteError(error, 'apply this correction to attendance');
      if (!data) return { status: 'not_found' };
      return { status: 'success', data: mapAttendanceRow(data as ApiWorkforceAttendanceRow) };
    }

    const { data: existing, error: findError } = await supabase
      .schema('api')
      .from('workforce_attendance')
      .select('attendance_id')
      .eq('tenant_id', tenantId)
      .eq('employee_id', input.employeeId)
      .eq('work_date', input.workDate)
      .maybeSingle();

    if (findError) return mapWorkforceWriteError(findError, 'apply this correction to attendance');

    if (existing) {
      const { data, error } = await supabase
        .schema('api')
        .from('workforce_attendance')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('attendance_id', existing.attendance_id as string)
        .select(ATTENDANCE_SELECT)
        .maybeSingle();

      if (error) return mapWorkforceWriteError(error, 'apply this correction to attendance');
      if (!data) return { status: 'not_found' };
      return { status: 'success', data: mapAttendanceRow(data as ApiWorkforceAttendanceRow) };
    }

    const { data, error } = await supabase
      .schema('api')
      .from('workforce_attendance')
      .insert({
        tenant_id: tenantId,
        employee_id: input.employeeId,
        work_date: input.workDate,
        location_id: input.locationId,
        ...payload,
      })
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'apply this correction to attendance');
    return { status: 'success', data: mapAttendanceRow(data as ApiWorkforceAttendanceRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error applying this correction to attendance.',
    };
  }
}

/**
 * Submit (create or edit) a work report for one employee/day. Unlike shift
 * preferences, attendance has a full self-scope CRUD surface
 * (`wf_attendance_self_select`/`_insert`/`_update`, 0027), so this can be a
 * true upsert-by-day: find the existing row for (employee, work_date) first
 * (RLS already limits the lookup to the caller's own rows), then UPDATE or
 * INSERT accordingly.
 */
export async function submitWorkReport(
  supabase: SupabaseClient,
  tenantId: string,
  input: SubmitWorkReportInput,
): Promise<WorkforceWriteResult<WorkforceAttendance>> {
  try {
    const { data: existing, error: findError } = await supabase
      .schema('api')
      .from('workforce_attendance')
      .select('attendance_id')
      .eq('tenant_id', tenantId)
      .eq('employee_id', input.employeeId)
      .eq('work_date', input.workDate)
      .maybeSingle();

    if (findError) return mapWorkforceWriteError(findError, 'submit this work report');

    const payload = buildAttendancePayload(input);

    if (existing) {
      const { data, error } = await supabase
        .schema('api')
        .from('workforce_attendance')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('attendance_id', existing.attendance_id as string)
        .select(ATTENDANCE_SELECT)
        .maybeSingle();

      if (error) return mapWorkforceWriteError(error, 'update this work report');
      if (!data) return { status: 'not_found' };
      return { status: 'success', data: mapAttendanceRow(data as ApiWorkforceAttendanceRow) };
    }

    const { data, error } = await supabase
      .schema('api')
      .from('workforce_attendance')
      .insert({ tenant_id: tenantId, employee_id: input.employeeId, work_date: input.workDate, ...payload })
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'submit this work report');
    return { status: 'success', data: mapAttendanceRow(data as ApiWorkforceAttendanceRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error submitting this work report.',
    };
  }
}
