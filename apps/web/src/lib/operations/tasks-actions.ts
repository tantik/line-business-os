'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  completeOperationsTask,
  listItemResponses,
  recordOperationsResponse,
  reportOperationsProblem,
  type RecordResponseResult,
} from './tasks';
import { parseCompleteTaskInput, parseRecordResponseInput, parseReportProblemInput } from './tasks-input';
import type { OperationsWriteResult } from './result-types';
import type { OperationsInstanceStatus } from './tasks';
import { parseUuid } from './validation';

/**
 * Server Actions for the Staff Operations task-execution slice (record a
 * checklist item response, complete a task, report a problem). Thin
 * controllers: parse `FormData` -> resolve tenant -> delegate to `tasks.ts`'s
 * service-layer helpers, which own the actual `api.operations_*` RPC calls.
 * Mirrors `schedules-actions.ts`'s exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

/**
 * Manager read: the numeric value recorded for one checklist item of one task
 * instance -- shown next to an open `threshold` exception so the Manager sees
 * WHAT was measured, not just that it was out of range. Read-only, RLS-scoped
 * through `api.operations_item_responses` (same visibility as the task list).
 */
export async function getRecordedNumericValue(input: unknown): Promise<OperationsWriteResult<{ responseNumeric: number | null }>> {
  if (typeof input !== 'object' || input === null) return INVALID_INPUT_RESULT;
  const obj = input as Record<string, unknown>;
  const instanceId = parseUuid(obj.instanceId);
  const itemId = parseUuid(obj.itemId);
  if (!instanceId || !itemId) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const result = await listItemResponses(supabase, tenantContext.data.activeTenant.tenantId, instanceId);
  if (result.status !== 'success') return result;
  return { status: 'success', data: { responseNumeric: result.data.find((r) => r.itemId === itemId)?.responseNumeric ?? null } };
}

export async function recordResponse(formData: FormData): Promise<OperationsWriteResult<RecordResponseResult>> {
  const input = parseRecordResponseInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return recordOperationsResponse(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function completeTask(
  formData: FormData,
): Promise<OperationsWriteResult<{ instanceId: string; status: OperationsInstanceStatus }>> {
  const input = parseCompleteTaskInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return completeOperationsTask(supabase, tenantContext.data.activeTenant.tenantId, input.scheduleId);
}

export async function reportProblem(
  formData: FormData,
): Promise<OperationsWriteResult<{ instanceId: string; exceptionId: string }>> {
  const input = parseReportProblemInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return reportOperationsProblem(supabase, tenantContext.data.activeTenant.tenantId, input);
}
