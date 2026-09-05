import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { OperationsWriteResult } from './result-types';
import { mapOperationsReadError, mapOperationsWriteError } from './pg-error';

/**
 * Staff task-execution read/write service layer for Operations (Cafe v2.2
 * WP1 Operations, third UI slice -- today's expected tasks at the staff
 * member's own location, their checklist, and recording
 * responses/problems/completion). Reads go through `api.operations_expected_tasks`
 * (a function, not a view -- called via `.rpc()`) and the
 * `api.operations_item_responses` `security_invoker` view (both 0101); writes
 * go through the `api.operations_*` execution RPCs (0101) -- never a raw
 * `operations.*` table write. Mirrors `templates.ts`/`schedules.ts`'s exact
 * shape/conventions.
 */

/** `operations.instance_status` (0101): only ever `in_progress`/`completed` once an instance is materialised; `null` here means "not yet materialised" (no instance row exists for this occurrence). */
export type OperationsInstanceStatus = 'in_progress' | 'completed';

/** Derived display state (0101's `state` column) -- `not_started` and `overdue` only apply before the instance is materialised or completed. */
export type OperationsTaskState = 'not_started' | 'in_progress' | 'overdue' | 'completed';

/** Flat row shape returned by `api.operations_expected_tasks` (0101). */
interface ApiOperationsExpectedTaskRow {
  schedule_id: string;
  schedule_group_id: string | null;
  tenant_id: string;
  location_id: string;
  template_id: string;
  template_name: string;
  category: string | null;
  business_date: string;
  due_time: string;
  window_end_time: string | null;
  window_close_at: string;
  instance_id: string | null;
  status: OperationsInstanceStatus | null;
  state: OperationsTaskState;
  is_overdue_critical: boolean;
  open_exception_count: number;
  completed_at: string | null;
}

export interface OperationsExpectedTask {
  scheduleId: string;
  scheduleGroupId: string | null;
  tenantId: string;
  locationId: string;
  templateId: string;
  templateName: string;
  category: string | null;
  businessDate: string;
  dueTime: string;
  windowEndTime: string | null;
  windowCloseAt: string;
  instanceId: string | null;
  status: OperationsInstanceStatus | null;
  state: OperationsTaskState;
  isOverdueCritical: boolean;
  openExceptionCount: number;
  completedAt: string | null;
}

function mapExpectedTaskRow(row: ApiOperationsExpectedTaskRow): OperationsExpectedTask {
  return {
    scheduleId: row.schedule_id,
    scheduleGroupId: row.schedule_group_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    templateId: row.template_id,
    templateName: row.template_name,
    category: row.category,
    businessDate: row.business_date,
    dueTime: row.due_time,
    windowEndTime: row.window_end_time,
    windowCloseAt: row.window_close_at,
    instanceId: row.instance_id,
    status: row.status,
    state: row.state,
    isOverdueCritical: row.is_overdue_critical,
    openExceptionCount: row.open_exception_count,
    completedAt: row.completed_at,
  };
}

/**
 * Read every Operations task expected on `date` the caller may see
 * (RLS-scoped via `operations.task_schedules`: module ON +
 * `operations.task.read`/`operations.task.execute`, tenant/location
 * isolated). `operations.task.read` may be tenant-wide for some roles, so
 * this is NOT guaranteed to already be narrowed to one location -- callers
 * that need only one location's tasks (e.g. a Staff member's own location)
 * must filter the result client-side by `locationId`.
 */
export async function listExpectedTasks(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
): Promise<TenantAccessResult<OperationsExpectedTask[]>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_expected_tasks', { p_start: date, p_end: date });
    if (error) return mapOperationsReadError(error, "read today's Operations tasks");

    const rows = (data ?? []) as ApiOperationsExpectedTaskRow[];
    const tasks = rows.filter((row) => row.tenant_id === tenantId).map(mapExpectedTaskRow);
    return { status: 'success', data: tasks };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : "Unexpected error reading today's Operations tasks." };
  }
}

/** Flat row shape returned by `api.operations_item_responses` (0101). */
interface ApiOperationsItemResponseRow {
  response_id: string;
  tenant_id: string;
  location_id: string;
  instance_id: string;
  item_id: string;
  response_bool: boolean | null;
  response_numeric: number | null;
  response_text: string | null;
  recorded_at: string;
  updated_at: string;
}

export interface OperationsItemResponse {
  responseId: string;
  tenantId: string;
  locationId: string;
  instanceId: string;
  itemId: string;
  responseBool: boolean | null;
  responseNumeric: number | null;
  responseText: string | null;
  recordedAt: string;
  updatedAt: string;
}

function mapItemResponseRow(row: ApiOperationsItemResponseRow): OperationsItemResponse {
  return {
    responseId: row.response_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    instanceId: row.instance_id,
    itemId: row.item_id,
    responseBool: row.response_bool,
    responseNumeric: row.response_numeric,
    responseText: row.response_text,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  };
}

const ITEM_RESPONSE_SELECT =
  'response_id, tenant_id, location_id, instance_id, item_id, response_bool, response_numeric, response_text, recorded_at, updated_at';

/** Read every recorded response for one materialised task instance (RLS-scoped, mirrors `listExpectedTasks`'s visibility). Only call this once a task has an `instanceId` -- a not-yet-started task has no responses yet. */
export async function listItemResponses(
  supabase: SupabaseClient,
  tenantId: string,
  instanceId: string,
): Promise<TenantAccessResult<OperationsItemResponse[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('operations_item_responses')
      .select(ITEM_RESPONSE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('instance_id', instanceId);
    if (error) return mapOperationsReadError(error, 'read Operations item responses');

    const rows = (data ?? []) as ApiOperationsItemResponseRow[];
    return { status: 'success', data: rows.map(mapItemResponseRow) };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading Operations item responses.' };
  }
}

export interface RecordResponseInput {
  scheduleId: string;
  itemId: string;
  responseBool?: boolean | null;
  responseNumeric?: number | null;
  responseText?: string | null;
}

export interface RecordResponseResult {
  instanceId: string;
  itemId: string;
  responseId: string;
  exceptionId: string | null;
}

/** Record exactly one item's response via `api.operations_record_response` (0101) -- materialises the task instance lazily, idempotent (one response row per item, later calls update it). Out-of-range numeric values are still accepted; the server opens a threshold exception rather than rejecting the value. */
export async function recordOperationsResponse(
  supabase: SupabaseClient,
  tenantId: string,
  input: RecordResponseInput,
): Promise<OperationsWriteResult<RecordResponseResult>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_record_response', {
      p_tenant_id: tenantId,
      p_schedule_id: input.scheduleId,
      p_item_id: input.itemId,
      p_response_bool: input.responseBool ?? null,
      p_response_numeric: input.responseNumeric ?? null,
      p_response_text: input.responseText ?? null,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as {
      instance_id: string;
      item_id: string;
      response_id: string;
      exception_id: string | null;
    };
    return {
      status: 'success',
      data: { instanceId: row.instance_id, itemId: row.item_id, responseId: row.response_id, exceptionId: row.exception_id },
    };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error recording this response.' };
  }
}

/** Complete today's occurrence for a schedule via `api.operations_complete_task` (0101) -- fails server-side (`operations_required_items_incomplete`) if any active+required item has no response yet. */
export async function completeOperationsTask(
  supabase: SupabaseClient,
  tenantId: string,
  scheduleId: string,
): Promise<OperationsWriteResult<{ instanceId: string; status: OperationsInstanceStatus }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_complete_task', {
      p_tenant_id: tenantId,
      p_schedule_id: scheduleId,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { instance_id: string; status: OperationsInstanceStatus };
    return { status: 'success', data: { instanceId: row.instance_id, status: row.status } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error completing this task.' };
  }
}

export type OperationsExceptionSeverity = 'warning' | 'action_required';

export interface ReportProblemInput {
  scheduleId: string;
  itemId?: string | null;
  note?: string | null;
  severity: OperationsExceptionSeverity;
}

/** Report a problem (whole task or one item) via `api.operations_report_problem` (0101) -- materialises the task instance lazily if needed. */
export async function reportOperationsProblem(
  supabase: SupabaseClient,
  tenantId: string,
  input: ReportProblemInput,
): Promise<OperationsWriteResult<{ instanceId: string; exceptionId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_report_problem', {
      p_tenant_id: tenantId,
      p_schedule_id: input.scheduleId,
      p_item_id: input.itemId ?? null,
      p_note: input.note ?? null,
      p_severity: input.severity,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { instance_id: string; exception_id: string };
    return { status: 'success', data: { instanceId: row.instance_id, exceptionId: row.exception_id } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reporting this problem.' };
  }
}
