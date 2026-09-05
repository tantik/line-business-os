import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { OperationsWriteResult } from './result-types';
import { mapOperationsReadError, mapOperationsWriteError } from './pg-error';

/**
 * Manager scheduling read/write service layer for Operations task schedules
 * (Cafe v2.2 WP1 Operations, second UI slice -- apply a checklist template
 * to a location with a simple recurrence, then revise/deactivate/cancel it).
 * Reads go through the `api.operations_schedules` `security_invoker` view
 * (0115); writes go through the `api.operations_*` scheduling RPCs
 * (0102/0105) -- never a raw `operations.*` table write. Mirrors
 * `templates.ts`'s exact shape/conventions.
 */

/** `operations.recurrence_kind` (0100). */
export type OperationsRecurrenceKind = 'daily' | 'weekdays';

/** Flat row shape returned by `api.operations_schedules` (0115). */
interface ApiOperationsScheduleRow {
  schedule_id: string;
  tenant_id: string;
  location_id: string;
  template_id: string;
  schedule_group_id: string;
  recurrence_kind: OperationsRecurrenceKind;
  weekdays: number[] | null;
  due_time: string;
  window_end_time: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OperationsSchedule {
  scheduleId: string;
  tenantId: string;
  locationId: string;
  templateId: string;
  scheduleGroupId: string;
  recurrenceKind: OperationsRecurrenceKind;
  weekdays: number[] | null;
  dueTime: string;
  windowEndTime: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapScheduleRow(row: ApiOperationsScheduleRow): OperationsSchedule {
  return {
    scheduleId: row.schedule_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    templateId: row.template_id,
    scheduleGroupId: row.schedule_group_id,
    recurrenceKind: row.recurrence_kind,
    weekdays: row.weekdays,
    dueTime: row.due_time,
    windowEndTime: row.window_end_time,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SCHEDULE_SELECT =
  'schedule_id, tenant_id, location_id, template_id, schedule_group_id, recurrence_kind, weekdays, due_time, window_end_time, effective_from, effective_to, is_active, created_at, updated_at';

/**
 * Read every task schedule the caller may see (RLS-scoped: module ON +
 * `operations.task.read`/`operations.template.manage`, tenant/location
 * isolated). Includes both current AND not-yet-effective future versions --
 * the UI groups by `scheduleGroupId` and picks the current/active row for
 * display, per this slice's "current version only" scope.
 */
export async function listOperationsSchedules(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<OperationsSchedule[]>> {
  try {
    const { data, error } = await supabase.schema('api').from('operations_schedules').select(SCHEDULE_SELECT).eq('tenant_id', tenantId);
    if (error) return mapOperationsReadError(error, 'read Operations schedules');

    const rows = (data ?? []) as ApiOperationsScheduleRow[];
    const schedules = rows
      .map(mapScheduleRow)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.scheduleId.localeCompare(b.scheduleId));
    return { status: 'success', data: schedules };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading Operations schedules.' };
  }
}

export interface CreateOperationsScheduleInput {
  locationId: string;
  templateId: string;
  recurrenceKind: OperationsRecurrenceKind;
  dueTime: string;
  weekdays?: number[] | null;
  windowEndTime?: string | null;
  effectiveFrom?: string | null;
}

/** Create a new logical schedule via `api.operations_create_schedule` (0105). */
export async function createOperationsSchedule(
  supabase: SupabaseClient,
  tenantId: string,
  input: CreateOperationsScheduleInput,
): Promise<OperationsWriteResult<{ scheduleId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_create_schedule', {
      p_tenant_id: tenantId,
      p_location_id: input.locationId,
      p_template_id: input.templateId,
      p_recurrence_kind: input.recurrenceKind,
      p_due_time: input.dueTime,
      p_weekdays: input.weekdays ?? null,
      p_window_end_time: input.windowEndTime ?? null,
      ...(input.effectiveFrom ? { p_effective_from: input.effectiveFrom } : {}),
    });
    if (error) return mapOperationsWriteError(error);
    return { status: 'success', data: { scheduleId: String(data) } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error creating this schedule.' };
  }
}

export interface ReviseOperationsScheduleInput {
  scheduleId: string;
  recurrenceKind: OperationsRecurrenceKind;
  weekdays?: number[] | null;
  dueTime?: string | null;
  windowEndTime?: string | null;
  effectiveFrom?: string | null;
}

export interface ReviseOperationsScheduleResult {
  scheduleId: string;
  scheduleGroupId: string;
  effectiveFrom: string;
  supersededScheduleId: string;
}

/** Revise a schedule's recurrence/timing as a new future-dated version via `api.operations_revise_schedule` (0102). */
export async function reviseOperationsSchedule(
  supabase: SupabaseClient,
  tenantId: string,
  input: ReviseOperationsScheduleInput,
): Promise<OperationsWriteResult<ReviseOperationsScheduleResult>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_revise_schedule', {
      p_tenant_id: tenantId,
      p_schedule_id: input.scheduleId,
      p_recurrence_kind: input.recurrenceKind,
      p_weekdays: input.weekdays ?? null,
      p_due_time: input.dueTime ?? null,
      p_window_end_time: input.windowEndTime ?? null,
      p_effective_from: input.effectiveFrom ?? null,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as {
      schedule_id: string;
      schedule_group_id: string;
      effective_from: string;
      superseded_schedule_id: string;
    };
    return {
      status: 'success',
      data: {
        scheduleId: row.schedule_id,
        scheduleGroupId: row.schedule_group_id,
        effectiveFrom: row.effective_from,
        supersededScheduleId: row.superseded_schedule_id,
      },
    };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error revising this schedule.' };
  }
}

/** Retire a schedule at a boundary via `api.operations_deactivate_schedule` (0102). `effectiveTo` defaults to today server-side. */
export async function deactivateOperationsSchedule(
  supabase: SupabaseClient,
  tenantId: string,
  scheduleId: string,
  effectiveTo?: string | null,
): Promise<OperationsWriteResult<{ scheduleId: string; effectiveTo: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_deactivate_schedule', {
      p_tenant_id: tenantId,
      p_schedule_id: scheduleId,
      ...(effectiveTo ? { p_effective_to: effectiveTo } : {}),
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { schedule_id: string; effective_to: string };
    return { status: 'success', data: { scheduleId: row.schedule_id, effectiveTo: row.effective_to } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error deactivating this schedule.' };
  }
}

/** Cancel the latest not-yet-effective revision via `api.operations_cancel_scheduled_revision` (0105) -- LIFO, physically deletes the future version and re-opens its predecessor if one was closed for it. */
export async function cancelScheduledRevision(
  supabase: SupabaseClient,
  tenantId: string,
  scheduleId: string,
): Promise<OperationsWriteResult<{ cancelledScheduleId: string; reopenedScheduleId: string | null }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_cancel_scheduled_revision', {
      p_tenant_id: tenantId,
      p_schedule_id: scheduleId,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { cancelled_schedule_id: string; reopened_schedule_id: string | null };
    return { status: 'success', data: { cancelledScheduleId: row.cancelled_schedule_id, reopenedScheduleId: row.reopened_schedule_id } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error cancelling this scheduled revision.' };
  }
}
