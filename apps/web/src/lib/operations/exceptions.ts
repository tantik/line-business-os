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
export type OperationsExceptionSource = 'threshold' | 'reported';

/** Flat row shape returned by `api.operations_open_exceptions` (0101). Only ever `status = 'open'` -- the view has no "resolved" rows, so a resolved exception simply disappears from a subsequent read. */
interface ApiOperationsOpenExceptionRow {
  exception_id: string;
  tenant_id: string;
  location_id: string;
  instance_id: string;
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
  instanceId: string;
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
    itemId: row.item_id,
    severity: row.severity,
    source: row.source,
    note: row.note,
    createdAt: row.created_at,
  };
}

const OPEN_EXCEPTION_SELECT = 'exception_id, tenant_id, location_id, instance_id, item_id, severity, source, note, created_at';

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
