'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import {
  cancelScheduledRevision,
  createOperationsSchedule,
  deactivateOperationsSchedule,
  reviseOperationsSchedule,
  type OperationsSchedule,
  type ReviseOperationsScheduleResult,
} from './schedules';
import {
  parseCancelScheduledRevisionInput,
  parseCreateScheduleInput,
  parseDeactivateScheduleInput,
  parseReviseScheduleInput,
} from './schedules-input';
import type { OperationsWriteResult } from './result-types';

/**
 * Server Actions for the Manager Operations scheduling slice (apply a
 * template to a location with a simple recurrence; revise/deactivate/cancel
 * it). Thin controllers: parse `FormData` -> resolve tenant -> delegate to
 * `schedules.ts`'s service-layer helpers, which own the actual
 * `api.operations_*` RPC calls. Mirrors `templates-actions.ts`'s exact shape.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

export async function createSchedule(formData: FormData): Promise<OperationsWriteResult<{ scheduleId: string }>> {
  const input = parseCreateScheduleInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return createOperationsSchedule(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function reviseSchedule(formData: FormData): Promise<OperationsWriteResult<ReviseOperationsScheduleResult>> {
  const input = parseReviseScheduleInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return reviseOperationsSchedule(supabase, tenantContext.data.activeTenant.tenantId, input);
}

export async function deactivateSchedule(
  formData: FormData,
): Promise<OperationsWriteResult<{ scheduleId: string; effectiveTo: string }>> {
  const input = parseDeactivateScheduleInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return deactivateOperationsSchedule(supabase, tenantContext.data.activeTenant.tenantId, input.scheduleId, input.effectiveTo);
}

export async function cancelSchedule(
  formData: FormData,
): Promise<OperationsWriteResult<{ cancelledScheduleId: string; reopenedScheduleId: string | null }>> {
  const input = parseCancelScheduledRevisionInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return cancelScheduledRevision(supabase, tenantContext.data.activeTenant.tenantId, input.scheduleId);
}

export type { OperationsSchedule };
