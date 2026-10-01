import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { OperationsWriteResult } from './result-types';
import { mapOperationsReadError, mapOperationsWriteError } from './pg-error';

/**
 * Manager "Attention" (open Operations exceptions) read/write service layer
 * (Cafe v2.2 WP1 Operations, fourth UI slice). Reads go through
 * `api.operations_open_exceptions` (a `security_invoker` view, 0101); the
 * resolve write goes through `api.operations_resolve_exception` (0101) --
 * never a raw `operations.*` table write. Mirrors `templates.ts`/`schedules.ts`/
 * `tasks.ts`'s exact shape/conventions. This is explicitly the Manager's own
 * Operations exceptions feed -- not the tenant-wide Workforce Attention panel
 * (`@/app/(protected)/manager/attention-panel.tsx`), which is a separate,
 * unmerged concept (see that file's own scope note).
 */

export type OperationsExceptionSeverity = 'warning' | 'action_required';
/**
 * `threshold` / `reported` are instance-attached (a numeric breach / a Staff
 * report on a task someone opened). `critical_missed` (0116) is instance-LESS:
 * a critical scheduled check whose window closed with no completion -- it
 * carries `scheduleId` + `businessDate` instead of an `instanceId`.
 */
export type OperationsExceptionSource = 'threshold' | 'reported' | 'critical_missed';

/** Flat row shape returned by `api.operations_open_exceptions` (0101, + schedule_id/business_date in 0116). Only ever `status = 'open'` -- the view has no "resolved" rows, so a resolved exception simply disappears from a subsequent read. */
interface ApiOperationsOpenExceptionRow {
  exception_id: string;
  tenant_id: string;
  location_id: string;
  instance_id: string | null;
  schedule_id: string | null;
  business_date: string | null;
  item_id: string | null;
  severity: OperationsExceptionSeverity;
  source: OperationsExceptionSource;
  note: string | null;
  created_at: string;
}

export interface OperationsOpenException {
  exceptionId: string;
  tenantId: string;
  locationId: string;
  /** NULL for a `critical_missed` exception -- use `scheduleId` + `businessDate` to resolve it to its task. */
  instanceId: string | null;
  scheduleId: string | null;
  businessDate: string | null;
  itemId: string | null;
  severity: OperationsExceptionSeverity;
  source: OperationsExceptionSource;
  note: string | null;
  createdAt: string;
}

function mapOpenExceptionRow(row: ApiOperationsOpenExceptionRow): OperationsOpenException {
  return {
    exceptionId: row.exception_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    instanceId: row.instance_id,
    scheduleId: row.schedule_id,
    businessDate: row.business_date,
    itemId: row.item_id,
    severity: row.severity,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  };
}

const OPEN_EXCEPTION_SELECT =
  'exception_id, tenant_id, location_id, instance_id, schedule_id, business_date, item_id, severity, source, note, created_at';

/** Read every currently-open Operations exception the caller may see (RLS-scoped: module ON + `operations.task.read`/`operations.exception.resolve`, tenant/location isolated). Not scoped to one location -- callers that need only the Manager's own location must filter client-side, same convention as `listExpectedTasks`. */
export async function listOpenOperationsExceptions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<OperationsOpenException[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('operations_open_exceptions')
      .select(OPEN_EXCEPTION_SELECT)
      .eq('tenant_id', tenantId);
    if (error) return mapOperationsReadError(error, 'read open Operations exceptions');

    const rows = (data ?? []) as ApiOperationsOpenExceptionRow[];
    const exceptions = rows
      .map(mapOpenExceptionRow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.exceptionId.localeCompare(b.exceptionId));
    return { status: 'success', data: exceptions };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading open Operations exceptions.' };
  }
}

/**
 * G1 (0116): materialise persistent `critical_missed` exceptions for the
 * caller's permitted locations via `api.operations_flag_missed_critical`. A
 * critical scheduled check whose window closed with no completion becomes a
 * durable `action_required` Attention item.
 *
 * "Read-time materialisation" (Founder decision 2026-09-09): this is called
 * from the Manager Operations server-load, right before
 * `listOpenOperationsExceptions`, so the feed reflects it on the same load.
 * Idempotent (a historical unique index prevents duplicates) and safe to call
 * on every Manager Operations render.
 *
 * Best-effort: a failure here MUST NOT break the Manager dashboard -- the
 * transient `isOverdueCritical` flag from `api.operations_expected_tasks`
 * still surfaces the state -- so this never throws and returns nothing.
 *
 * ACCEPTED MVP IMPLEMENTATION DETAIL: if a Manager never opens Operations
 * after a miss, the persistent row may not exist yet. A future scheduled
 * worker can call the same RPC with no schema change.
 */
export async function flagMissedCriticalExceptions(supabase: SupabaseClient, tenantId: string): Promise<void> {
  try {
    await supabase.schema('api').rpc('operations_flag_missed_critical', { p_tenant_id: tenantId });
  } catch {
    // deliberately swallowed -- see the doc comment
  }
}

export type OperationsExceptionStatus = 'open' | 'resolved';

/** Resolve an open exception via `api.operations_resolve_exception` (0101) -- there is no "reopen"; once resolved it drops out of `listOpenOperationsExceptions`'s next read. */
export async function resolveOperationsException(
  supabase: SupabaseClient,
  tenantId: string,
  exceptionId: string,
  resolutionNote?: string | null,
): Promise<OperationsWriteResult<{ exceptionId: string; status: OperationsExceptionStatus }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('operations_resolve_exception', {
      p_tenant_id: tenantId,
      p_exception_id: exceptionId,
      p_resolution_note: resolutionNote ?? null,
    });
    if (error) return mapOperationsWriteError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { exception_id: string; status: OperationsExceptionStatus };
    return { status: 'success', data: { exceptionId: row.exception_id, status: row.status } };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error resolving this exception.' };
  }
}
