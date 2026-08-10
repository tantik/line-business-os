import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { listTenantLocations } from '@/lib/tenant/locations';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';
import { applyApprovedCorrection } from './attendance';
import { localDateTimeToUtcIso } from './timezone';

/** Flat row shape returned by `api.workforce_shift_requests`. Never includes `decided_by`/`decided_at` (0030/0031). */
interface ApiWorkforceShiftRequestRow {
  request_id: string;
  tenant_id: string;
  location_id: string | null;
  employee_id: string;
  shift_id: string | null;
  shift_type_id: string | null;
  work_date: string;
  kind: string;
  is_unavailable: boolean;
  status: string;
  details: Record<string, unknown>;
  attendance_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkforceShiftRequest {
  requestId: string;
  tenantId: string;
  locationId: string | null;
  employeeId: string;
  shiftId: string | null;
  shiftTypeId: string | null;
  workDate: string;
  kind: string;
  isUnavailable: boolean;
  status: string;
  details: Record<string, unknown>;
  attendanceId: string | null;
  createdAt: string;
  updatedAt: string;
}

const REQUEST_SELECT =
  'request_id, tenant_id, location_id, employee_id, shift_id, shift_type_id, work_date, kind, is_unavailable, status, details, attendance_id, created_at, updated_at';

function mapRequestRow(row: ApiWorkforceShiftRequestRow): WorkforceShiftRequest {
  return {
    requestId: row.request_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    employeeId: row.employee_id,
    shiftId: row.shift_id,
    shiftTypeId: row.shift_type_id,
    workDate: row.work_date,
    kind: row.kind,
    isUnavailable: row.is_unavailable,
    status: row.status,
    details: row.details ?? {},
    attendanceId: row.attendance_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Read the caller's own shift requests (self-scoped by RLS, `wf_shift_requests_self_select`). */
export async function listMyShiftRequests(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { kind?: string } = {},
): Promise<TenantAccessResult<WorkforceShiftRequest[]>> {
  try {
    let query = supabase.schema('api').from('workforce_shift_requests').select(REQUEST_SELECT).eq('tenant_id', tenantId);
    if (opts.kind) query = query.eq('kind', opts.kind);

    const { data, error } = await query;
    if (error) return mapWorkforceReadError(error, 'read your shift requests');

    const rows = (data ?? []) as ApiWorkforceShiftRequestRow[];
    const requests = rows.map(mapRequestRow).sort((a, b) => a.workDate.localeCompare(b.workDate));
    return { status: 'success', data: requests };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading your shift requests.',
    };
  }
}

/** Manager read of shift requests (RLS `wf_shift_requests_write`, `workforce.request.manage`, unchanged -- returns every employee's requests, not self-scoped). */
export async function listShiftRequestsForManager(
  supabase: SupabaseClient,
  tenantId: string,
  opts: { kind?: string; status?: string } = {},
): Promise<TenantAccessResult<WorkforceShiftRequest[]>> {
  try {
    let query = supabase.schema('api').from('workforce_shift_requests').select(REQUEST_SELECT).eq('tenant_id', tenantId);
    if (opts.kind) query = query.eq('kind', opts.kind);
    if (opts.status) query = query.eq('status', opts.status);

    const { data, error } = await query;
    if (error) return mapWorkforceReadError(error, 'read shift requests');

    const rows = (data ?? []) as ApiWorkforceShiftRequestRow[];
    const requests = rows
      .map(mapRequestRow)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
    return { status: 'success', data: requests };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading shift requests.',
    };
  }
}

export interface SubmitShiftPreferenceInput {
  employeeId: string;
  locationId: string | null;
  workDate: string;
  shiftTypeId: string | null;
  isUnavailable: boolean;
}

/**
 * Submit a shift preference (`kind: 'preference'`). INSERT-only: there is no
 * self-scope UPDATE RLS policy on `workforce.shift_requests` (only
 * `wf_shift_requests_self_insert`; only managers can UPDATE, via
 * `wf_shift_requests_write`), and no RLS change is in scope for this slice.
 * A second submission for the same employee/day hits the partial unique
 * index (`wf_shift_requests_one_preference_per_day`) and comes back as
 * `duplicate` -- changing an already-submitted preference requires a manager
 * to edit it directly in v0.1.
 */
export async function submitShiftPreference(
  supabase: SupabaseClient,
  tenantId: string,
  input: SubmitShiftPreferenceInput,
): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_requests')
      .insert({
        tenant_id: tenantId,
        location_id: input.locationId,
        employee_id: input.employeeId,
        kind: 'preference',
        work_date: input.workDate,
        shift_type_id: input.shiftTypeId,
        is_unavailable: input.isUnavailable,
      })
      .select(REQUEST_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'submit this shift preference');
    return { status: 'success', data: mapRequestRow(data as ApiWorkforceShiftRequestRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error submitting this shift preference.',
    };
  }
}

export interface SubmitCorrectionRequestInput {
  employeeId: string;
  locationId: string | null;
  workDate: string;
  attendanceId: string | null;
  details?: Record<string, unknown>;
}

/** Submit an attendance correction request (`kind: 'correction'`). INSERT-only, same self-insert RLS as preferences; no per-day uniqueness constraint (multiple corrections per day are legitimate, e.g. a rejected one followed by a re-submission). */
export async function submitCorrectionRequest(
  supabase: SupabaseClient,
  tenantId: string,
  input: SubmitCorrectionRequestInput,
): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_requests')
      .insert({
        tenant_id: tenantId,
        location_id: input.locationId,
        employee_id: input.employeeId,
        kind: 'correction',
        work_date: input.workDate,
        attendance_id: input.attendanceId,
        details: input.details ?? {},
      })
      .select(REQUEST_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'submit this correction request');
    return { status: 'success', data: mapRequestRow(data as ApiWorkforceShiftRequestRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error submitting this correction request.',
    };
  }
}

export type ShiftRequestDecision = 'approved' | 'rejected';

/** Fields a correction request's `details` may carry for the attendance row it targets. Read defensively -- `details` is untyped jsonb. */
function readCorrectionDetails(details: Record<string, unknown>): {
  clockInLocal?: string;
  clockOutLocal?: string;
  actualBreakMinutes?: number;
} {
  return {
    clockInLocal: typeof details.clockInLocal === 'string' ? details.clockInLocal : undefined,
    clockOutLocal: typeof details.clockOutLocal === 'string' ? details.clockOutLocal : undefined,
    actualBreakMinutes: typeof details.actualBreakMinutes === 'number' ? details.actualBreakMinutes : undefined,
  };
}

/**
 * Manager decides a pending request (correction or otherwise). `status` is
 * written first -- `decided_by`/`decided_at` are stamped server-side by the
 * `stamp_shift_request_decision` trigger (0031) and are never accepted from
 * the client. RLS: `wf_shift_requests_write` (`workforce.request.manage`,
 * unchanged).
 *
 * An *approved* `kind: 'correction'` request that carries requested clock-in/
 * clock-out/break values in `details` is then applied to the attendance row
 * it targets (`applyApprovedCorrection`, by `attendance_id`, exactly once --
 * gated by the same `.eq('status', 'pending')` race guard above, so a
 * request can never be approved, and therefore never applied, twice).
 * Rejects never touch attendance. A request with no requested values (e.g. a
 * text-only correction note) has nothing to apply and is a no-op here.
 */
export async function decideCorrectionRequest(
  supabase: SupabaseClient,
  tenantId: string,
  requestId: string,
  decision: ShiftRequestDecision,
): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_requests')
      .update({ status: decision })
      .eq('tenant_id', tenantId)
      .eq('request_id', requestId)
      .eq('status', 'pending')
      .select(REQUEST_SELECT)
      .maybeSingle();

    if (error) return mapWorkforceWriteError(error, 'decide this request');
    if (!data) {
      // The `.eq('status', 'pending')` filter above means a zero-row result
      // is ambiguous: either the request never existed/isn't visible under
      // RLS (`not_found`), or it did exist and was already decided by a
      // concurrent request in the race window between this manager loading
      // the queue and submitting a decision (`stale_reference` -- the same
      // status `decideShiftExchange('approved', ...)` uses for its own
      // concurrent-decision race, see shift-exchanges.ts). Distinguish them
      // with a follow-up existence check, not the pending filter.
      const { data: existing, error: existingError } = await supabase
        .schema('api')
        .from('workforce_shift_requests')
        .select('request_id')
        .eq('tenant_id', tenantId)
        .eq('request_id', requestId)
        .maybeSingle();
      if (existingError) return mapWorkforceWriteError(existingError, 'decide this request');
      return { status: existing ? 'stale_reference' : 'not_found' };
    }

    const decided = mapRequestRow(data as ApiWorkforceShiftRequestRow);

    if (decision === 'approved' && decided.kind === 'correction' && decided.attendanceId) {
      const { clockInLocal, clockOutLocal, actualBreakMinutes } = readCorrectionDetails(decided.details);
      if (clockInLocal !== undefined || clockOutLocal !== undefined || actualBreakMinutes !== undefined) {
        const locationsResult = await listTenantLocations(supabase);
        if (locationsResult.status !== 'success') return locationsResult;
        const location = locationsResult.data.find((l) => l.locationId === decided.locationId);
        if (!location) return { status: 'not_found' };

        const applyResult = await applyApprovedCorrection(supabase, tenantId, {
          attendanceId: decided.attendanceId,
          clockIn: clockInLocal ? localDateTimeToUtcIso(decided.workDate, clockInLocal, location.timezone) : undefined,
          clockOut: clockOutLocal ? localDateTimeToUtcIso(decided.workDate, clockOutLocal, location.timezone) : undefined,
          actualBreakMinutes,
        });
        if (applyResult.status !== 'success') return applyResult;
      }
    }

    return { status: 'success', data: decided };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error deciding this request.',
    };
  }
}
