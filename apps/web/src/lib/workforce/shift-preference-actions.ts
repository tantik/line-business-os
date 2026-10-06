'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { getShiftRequestById, setShiftPreferenceReviewed, type WorkforceShiftRequest } from './shift-requests';
import { sendShiftPreferenceReminder, type ShiftPreferenceReminderOutcome } from './shift-preference-reminder';
import { parseUuid } from './validation';
import type { WorkforceWriteResult } from './result-types';

/**
 * Manager Server Actions for the Shift preferences review popup
 * (`manager/shift-requests-review-popup.tsx`). Thin controllers: validate ->
 * resolve tenant -> server-side permission pre-check -> delegate. RLS
 * (`wf_shift_requests_write`, `workforce.request.manage`) stays the real
 * boundary for the review write; the pre-check only turns a Staff caller's
 * silent zero-row update into an explicit `unauthorized`.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
const UNAUTHORIZED_RESULT = { status: 'unauthorized', message: 'You do not have permission to review shift preferences.' } as const;

export async function markShiftPreferenceReviewed(input: unknown): Promise<WorkforceWriteResult<WorkforceShiftRequest>> {
  if (typeof input !== 'object' || input === null) return INVALID_INPUT_RESULT;
  const obj = input as Record<string, unknown>;
  const requestId = parseUuid(obj.requestId);
  if (!requestId || typeof obj.reviewed !== 'boolean') return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const existing = await getShiftRequestById(supabase, tenantId, requestId);
  if (existing.status !== 'success') return existing;
  if (!existing.data || existing.data.kind !== 'preference') return { status: 'not_found' };

  const { data: permitted, error } = await supabase.schema('api').rpc('has_permission', {
    p_tenant_id: tenantId,
    p_permission: 'workforce.request.manage',
    p_location_id: existing.data.locationId,
  });
  if (error || permitted !== true) return UNAUTHORIZED_RESULT;

  return setShiftPreferenceReviewed(supabase, tenantId, requestId, obj.reviewed);
}

export async function sendShiftPreferenceReminderEmail(input: unknown): Promise<WorkforceWriteResult<ShiftPreferenceReminderOutcome>> {
  if (typeof input !== 'object' || input === null) return INVALID_INPUT_RESULT;
  const obj = input as Record<string, unknown>;
  const employeeId = parseUuid(obj.employeeId);
  const nonce = parseUuid(obj.nonce);
  if (!employeeId || !nonce) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return sendShiftPreferenceReminder(supabase, tenantContext.data.activeTenant.tenantId, { employeeId, nonce });
}
