import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';

interface ExchangeRow {
  exchange_id: string;
  tenant_id: string;
  location_id: string;
  shift_id: string;
  requester_employee_id: string;
  replacement_employee_id: string | null;
  reason: string;
  status: ShiftExchangeStatus;
  accepted_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  request_kind: ShiftRequestKind;
  requested_shift_type_id: string | null;
}

export type ShiftExchangeStatus = 'open' | 'accepted' | 'approved' | 'rejected' | 'cancelled';
export type ShiftRequestKind = 'exchange' | 'change' | 'cancel';

export interface WorkforceShiftExchange {
  exchangeId: string;
  tenantId: string;
  locationId: string;
  shiftId: string;
  requesterEmployeeId: string;
  replacementEmployeeId: string | null;
  reason: string;
  status: ShiftExchangeStatus;
  acceptedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestKind: ShiftRequestKind;
  requestedShiftTypeId: string | null;
}

const SELECT =
  'exchange_id, tenant_id, location_id, shift_id, requester_employee_id, replacement_employee_id, reason, status, accepted_at, decided_at, created_at, updated_at, request_kind, requested_shift_type_id';

function mapRow(row: ExchangeRow): WorkforceShiftExchange {
  return {
    exchangeId: row.exchange_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    shiftId: row.shift_id,
    requesterEmployeeId: row.requester_employee_id,
    replacementEmployeeId: row.replacement_employee_id,
    reason: row.reason,
    status: row.status,
    acceptedAt: row.accepted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    requestKind: row.request_kind,
    requestedShiftTypeId: row.requested_shift_type_id,
  };
}

export async function listShiftExchanges(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<WorkforceShiftExchange[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_exchanges')
      .select(SELECT)
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .order('created_at', { ascending: false });
    if (error) return mapWorkforceReadError(error, 'read shift exchanges');
    return { status: 'success', data: ((data ?? []) as ExchangeRow[]).map(mapRow) };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to read shift exchanges.' };
  }
}

export async function createShiftExchange(
  supabase: SupabaseClient,
  input: { tenantId: string; locationId: string; shiftId: string; requesterEmployeeId: string; reason: string; requestKind: ShiftRequestKind; requestedShiftTypeId?: string | null },
): Promise<WorkforceWriteResult<WorkforceShiftExchange>> {
  const reason = input.reason.trim();
  if (reason.length < 1 || reason.length > 500) {
    return { status: 'unexpected_error', message: 'Shift exchange reason is invalid.' };
  }
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_exchanges')
      .insert({
        tenant_id: input.tenantId,
        location_id: input.locationId,
        shift_id: input.shiftId,
        requester_employee_id: input.requesterEmployeeId,
        reason,
        request_kind: input.requestKind,
        requested_shift_type_id: input.requestKind === 'change' ? input.requestedShiftTypeId ?? null : null,
      })
      .select(SELECT)
      .single();
    if (error) return mapWorkforceWriteError(error, 'request this shift exchange');
    return { status: 'success', data: mapRow(data as ExchangeRow) };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to request shift exchange.' };
  }
}

async function exchangeRpc(
  supabase: SupabaseClient,
  name: 'accept_workforce_shift_exchange' | 'cancel_workforce_shift_exchange' | 'decide_workforce_shift_exchange',
  args: Record<string, string>,
): Promise<WorkforceWriteResult<{ exchangeId: string }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc(name, args);
    if (error) return mapWorkforceWriteError(error, 'update this shift exchange');
    const row = Array.isArray(data) ? data[0] : data;
    const exchangeId =
      row && typeof row === 'object' && 'exchange_id' in row ? String(row.exchange_id) : String(args.p_exchange_id ?? '');
    return { status: 'success', data: { exchangeId } };
  } catch (error) {
    return { status: 'unexpected_error', message: error instanceof Error ? error.message : 'Unable to update shift exchange.' };
  }
}

export function acceptShiftExchange(supabase: SupabaseClient, exchangeId: string) {
  return exchangeRpc(supabase, 'accept_workforce_shift_exchange', { p_exchange_id: exchangeId });
}

export function cancelShiftExchange(supabase: SupabaseClient, exchangeId: string) {
  return exchangeRpc(supabase, 'cancel_workforce_shift_exchange', { p_exchange_id: exchangeId });
}

export function decideShiftExchange(supabase: SupabaseClient, exchangeId: string, decision: 'approved' | 'rejected') {
  return exchangeRpc(supabase, 'decide_workforce_shift_exchange', {
    p_exchange_id: exchangeId,
    p_decision: decision,
  });
}
