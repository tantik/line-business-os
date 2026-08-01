import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { AutoDistributeExistingAssignment, DraftAssignment } from './auto-distribute';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';
import { localDateTimeToUtcIso, utcIsoToLocalDateTime } from './timezone';

/** Flat row shape returned by `api.workforce_shift_assignments`. */
interface ApiWorkforceShiftAssignmentRow {
  assignment_id: string;
  tenant_id: string;
  location_id: string;
  employee_id: string | null;
  shift_type_id: string | null;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  role: string | null;
  notes: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkforceShiftAssignment {
  assignmentId: string;
  tenantId: string;
  locationId: string;
  employeeId: string | null;
  shiftTypeId: string | null;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  role: string | null;
  notes: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

const ASSIGNMENT_SELECT =
  'assignment_id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, role, notes, published, created_at, updated_at';

function mapAssignmentRow(row: ApiWorkforceShiftAssignmentRow): WorkforceShiftAssignment {
  return {
    assignmentId: row.assignment_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    employeeId: row.employee_id,
    shiftTypeId: row.shift_type_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    breakMinutes: row.break_minutes,
    role: row.role,
    notes: row.notes,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListShiftAssignmentsOptions {
  /** Inclusive lower bound on `starts_at`, as an ISO instant (e.g. from `localDateTimeToUtcIso`). */
  fromIso?: string;
  /** Exclusive upper bound on `starts_at`, as an ISO instant. */
  toIsoExclusive?: string;
}

/**
 * Read shift assignments through `api.workforce_shift_assignments`. Staff see
 * published rows only, managers see draft + published (RLS, unchanged) --
 * this helper adds no additional filtering beyond the optional date bounds.
 */
export async function listShiftAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  opts: ListShiftAssignmentsOptions = {},
): Promise<TenantAccessResult<WorkforceShiftAssignment[]>> {
  try {
    let query = supabase.schema('api').from('workforce_shift_assignments').select(ASSIGNMENT_SELECT).eq('tenant_id', tenantId);
    if (opts.fromIso) query = query.gte('starts_at', opts.fromIso);
    if (opts.toIsoExclusive) query = query.lt('starts_at', opts.toIsoExclusive);

    const { data, error } = await query;
    if (error) return mapWorkforceReadError(error, 'read shift assignments');

    const rows = (data ?? []) as ApiWorkforceShiftAssignmentRow[];
    const assignments = rows
      .map(mapAssignmentRow)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.assignmentId.localeCompare(b.assignmentId));
    return { status: 'success', data: assignments };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading shift assignments.',
    };
  }
}

/** Read one assignment through the same RLS-protected app-facing facade. */
export async function getShiftAssignmentById(
  supabase: SupabaseClient,
  tenantId: string,
  assignmentId: string,
): Promise<TenantAccessResult<WorkforceShiftAssignment | null>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('tenant_id', tenantId)
      .eq('assignment_id', assignmentId)
      .maybeSingle();
    if (error) return mapWorkforceReadError(error, 'read this shift assignment');
    return { status: 'success', data: data ? mapAssignmentRow(data as ApiWorkforceShiftAssignmentRow) : null };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading this shift assignment.',
    };
  }
}

/**
 * Converts a `runAutoDistribution` (Slice 1B) draft assignment into an insert
 * row for `api.workforce_shift_assignments`. Pure/no I/O -- unit-testable
 * without Supabase.
 */
export function mapDraftAssignmentToInsertRow(
  draft: DraftAssignment,
  tenantId: string,
  locationId: string,
  timeZone: string,
) {
  return {
    tenant_id: tenantId,
    location_id: locationId,
    employee_id: draft.employeeId,
    shift_type_id: draft.shiftTypeId,
    starts_at: localDateTimeToUtcIso(draft.workDate, draft.startsAtLocal, timeZone),
    ends_at: localDateTimeToUtcIso(draft.workDate, draft.endsAtLocal, timeZone),
    break_minutes: draft.breakMinutes,
    published: false,
  };
}

export type ShiftAssignmentInsertRow = ReturnType<typeof mapDraftAssignmentToInsertRow>;

/** Bulk-insert draft shift assignments (`published: false`) produced by `autoDistribute()`. */
export async function insertDraftShiftAssignments(
  supabase: SupabaseClient,
  rows: ShiftAssignmentInsertRow[],
): Promise<WorkforceWriteResult<{ inserted: number }>> {
  if (rows.length === 0) return { status: 'success', data: { inserted: 0 } };

  try {
    const { data, error } = await supabase.schema('api').from('workforce_shift_assignments').insert(rows).select('assignment_id');
    if (error) return mapWorkforceWriteError(error, 'insert draft shift assignments');
    return { status: 'success', data: { inserted: (data ?? []).length } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error inserting draft shift assignments.',
    };
  }
}

export interface CreateShiftAssignmentInput {
  employeeId: string;
  shiftTypeId: string | null;
  /** Already resolved to a UTC instant by the caller (`localDateTimeToUtcIso`), never a bare local time. */
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  role: string | null;
  notes: string | null;
}

/**
 * Manager manual assignment of a single, specific employee/date/shift-type
 * into a previously-empty grid cell -- a single-row INSERT into
 * `api.workforce_shift_assignments`, always `published: false`. Distinct from
 * `insertDraftShiftAssignments` (bulk, `runAutoDistribution`-only): this is
 * the one-cell-at-a-time counterpart to `updateShiftAssignment`, covered by
 * the same `wf_shifts_manage` RLS policy the bulk insert already relies on.
 */
export async function createShiftAssignment(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  input: CreateShiftAssignmentInput,
): Promise<WorkforceWriteResult<WorkforceShiftAssignment>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_assignments')
      .insert({
        tenant_id: tenantId,
        location_id: locationId,
        employee_id: input.employeeId,
        shift_type_id: input.shiftTypeId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        break_minutes: input.breakMinutes,
        role: input.role,
        notes: input.notes,
        published: false,
      })
      .select(ASSIGNMENT_SELECT)
      .single();

    if (error) {
      // 23503 = foreign_key_violation: employeeId/shiftTypeId doesn't exist in this tenant.
      if (error.code === '23503') return { status: 'not_found' };
      return mapWorkforceWriteError(error, 'create this shift assignment');
    }
    return { status: 'success', data: mapAssignmentRow(data as ApiWorkforceShiftAssignmentRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error creating this shift assignment.',
    };
  }
}

export interface UpdateShiftAssignmentPatch {
  employeeId?: string | null;
  shiftTypeId?: string | null;
  /** Already resolved to a UTC instant by the caller (`localDateTimeToUtcIso`), never a bare local time. */
  startsAt?: string;
  endsAt?: string;
  breakMinutes?: number;
  role?: string | null;
  notes?: string | null;
  published?: boolean;
}

/** Manager manual edit of a single draft (or published) shift assignment. */
export async function updateShiftAssignment(
  supabase: SupabaseClient,
  tenantId: string,
  assignmentId: string,
  patch: UpdateShiftAssignmentPatch,
): Promise<WorkforceWriteResult<WorkforceShiftAssignment>> {
  const update: Record<string, unknown> = {};
  if (patch.employeeId !== undefined) update.employee_id = patch.employeeId;
  if (patch.shiftTypeId !== undefined) update.shift_type_id = patch.shiftTypeId;
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) update.ends_at = patch.endsAt;
  if (patch.breakMinutes !== undefined) update.break_minutes = patch.breakMinutes;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.published !== undefined) update.published = patch.published;

  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_assignments')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('assignment_id', assignmentId)
      .select(ASSIGNMENT_SELECT)
      .maybeSingle();

    if (error) return mapWorkforceWriteError(error, 'update this shift assignment');
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapAssignmentRow(data as ApiWorkforceShiftAssignmentRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error updating this shift assignment.',
    };
  }
}

/** Bulk-publish every not-yet-published shift assignment in `[fromIso, toIsoExclusive)` for one location. */
export async function publishShiftAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  fromIso: string,
  toIsoExclusive: string,
): Promise<WorkforceWriteResult<{ published: number }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_assignments')
      .update({ published: true })
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .eq('published', false)
      .gte('starts_at', fromIso)
      .lt('starts_at', toIsoExclusive)
      .select('assignment_id');

    if (error) return mapWorkforceWriteError(error, 'publish this schedule');
    return { status: 'success', data: { published: (data ?? []).length } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error publishing this schedule.',
    };
  }
}

/**
 * Converts a read shift assignment back into `autoDistribute()`'s
 * `AutoDistributeExistingAssignment` shape for the `runAutoDistribution`
 * snapshot. `locked` is always `false`: `workforce.shifts` has no `locked`
 * column in this slice's schema, so per-cell locking is not yet available --
 * only `published` (via `overwriteExisting`) governs preservation. Pure/no
 * I/O -- unit-testable without Supabase.
 */
export function toAutoDistributeExistingAssignment(
  entry: WorkforceShiftAssignment,
  timeZone: string,
): AutoDistributeExistingAssignment | null {
  if (!entry.employeeId) return null;
  const starts = utcIsoToLocalDateTime(entry.startsAt, timeZone);
  const ends = utcIsoToLocalDateTime(entry.endsAt, timeZone);
  return {
    employeeId: entry.employeeId,
    workDate: starts.workDate,
    shiftTypeId: entry.shiftTypeId,
    startsAtLocal: starts.localTime,
    endsAtLocal: ends.localTime,
    breakMinutes: entry.breakMinutes,
    published: entry.published,
    locked: false,
  };
}
