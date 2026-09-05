'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  completeOperationsTask,
  recordOperationsResponse,
  reportOperationsProblem,
  type RecordResponseResult,
} from './tasks';
import { parseCompleteTaskInput, parseRecordResponseInput, parseReportProblemInput } from './tasks-input';
import type { OperationsWriteResult } from './result-types';
import type { OperationsInstanceStatus } from './tasks';

/**
 * Server Actions for the Staff Operations task-execution slice (record a
 * checklist item response, complete a task, report a problem). Thin
 * controllers: parse `FormData` -> resolve tenant -> delegate to `tasks.ts`'s
 * service-layer helpers, which own the actual `api.operations_*` RPC calls.
 * Mirrors `schedules-actions.ts`'s exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

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
