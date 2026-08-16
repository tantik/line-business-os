'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { getMyWorkforceStaffProfile } from './staff-profile';
import {
  acceptShiftExchange,
  cancelShiftExchange as cancelShiftExchangeWrite,
  createShiftExchange,
  decideShiftExchange as decideShiftExchangeWrite,
  listShiftExchanges,
  type ShiftRequestKind,
  type WorkforceShiftExchange,
} from './shift-exchanges';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for the shift-exchange/change/cancel workflow -- canonical-
 * dashboard counterpart to `_client-preview`'s
 * `lib/preview/actions/shift-exchange-actions.ts` /
 * `shift-exchange-manager-actions.ts`, ported to consolidate this Cafe v2.1
 * capability into the canonical app rather than leaving it preview-only.
 * Wraps the already-shared backend (`shift-exchanges.ts`). The staff-side
 * actions always use the server-resolved, self-bound `employeeId`/
 * `locationId` from the caller's own tenant context -- never accepted from
 * `formData`. `decideShiftExchange` (Manager) adds no separate app-level
 * permission check, same as `decideCorrectionRequest` in
 * `attendance-actions.ts`: `api.decide_workforce_shift_exchange`
 * (0050_workforce_shift_change_requests.sql) already re-checks
 * `workforce.request.manage` and the row's decidable status inside its own
 * transaction, and RLS (`wf_shift_exchanges_manage`) is the redundant
 * defense-in-depth layer beneath that. RLS remains the real authorization
 * boundary for every action in this module.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
const NO_STAFF_PROFILE_RESULT = { status: 'unexpected_error', message: 'You have no staff profile in this tenant.' } as const;

async function resolveMyExchangeContext() {
  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return { status: 'fail' as const, result: tenantContext };

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return { status: 'fail' as const, result: myProfile };
  if (!myProfile.data) return { status: 'fail' as const, result: NO_STAFF_PROFILE_RESULT };
  // A staff profile with no bound location has nothing here to resolve against -- fails closed the same as "no profile", never falls back to another location.
  if (!myProfile.data.locationId) return { status: 'fail' as const, result: NO_STAFF_PROFILE_RESULT };

  return {
    status: 'ok' as const,
    supabase,
    tenantId,
    locationId: myProfile.data.locationId,
    employeeId: myProfile.data.staffId,
  };
}

export async function listMyShiftExchanges(): Promise<WorkforceWriteResult<WorkforceShiftExchange[]>> {
  const context = await resolveMyExchangeContext();
  if (context.status !== 'ok') return context.result;
  return listShiftExchanges(context.supabase, context.tenantId, context.locationId);
}

/** Requests a shift change/cancellation/exchange for one of the caller's own future shifts. */
export async function requestMyShiftExchange(formData: FormData): Promise<WorkforceWriteResult<WorkforceShiftExchange>> {
  const shiftId = formData.get('shiftId');
  const reason = formData.get('reason');
  const requestKind = formData.get('requestKind');
  const requestedShiftTypeId = formData.get('requestedShiftTypeId');
  if (typeof shiftId !== 'string' || !shiftId) return INVALID_INPUT_RESULT;
  if (typeof reason !== 'string' || !reason.trim()) return INVALID_INPUT_RESULT;
  const kind: ShiftRequestKind = requestKind === 'change' || requestKind === 'cancel' ? requestKind : 'exchange';

  const context = await resolveMyExchangeContext();
  if (context.status !== 'ok') return context.result;

  return createShiftExchange(context.supabase, {
    tenantId: context.tenantId,
    locationId: context.locationId,
    shiftId,
    requesterEmployeeId: context.employeeId,
    reason,
    requestKind: kind,
    requestedShiftTypeId: typeof requestedShiftTypeId === 'string' ? requestedShiftTypeId : null,
  });
}

/** Cancels a shift-exchange request the caller previously created (RLS enforces requester-only cancel). */
export async function cancelMyShiftExchange(exchangeId: string): Promise<WorkforceWriteResult<{ exchangeId: string }>> {
  if (!exchangeId) return INVALID_INPUT_RESULT;
  const context = await resolveMyExchangeContext();
  if (context.status !== 'ok') return context.result;
  return cancelShiftExchangeWrite(context.supabase, exchangeId);
}

/** Accepts an open exchange offered by a colleague, becoming its replacement (RLS enforces the accepting employee cannot be the original requester). */
export async function acceptColleagueShiftExchange(exchangeId: string): Promise<WorkforceWriteResult<{ exchangeId: string }>> {
  if (!exchangeId) return INVALID_INPUT_RESULT;
  const context = await resolveMyExchangeContext();
  if (context.status !== 'ok') return context.result;
  return acceptShiftExchange(context.supabase, exchangeId);
}

/** Manager decision (approve/reject) on a shift-exchange/change/cancel request. RLS (`wf_shift_exchanges_manage`) and the RPC's own `workforce.request.manage` check are the authorization boundary -- see module doc comment. */
export async function decideShiftExchange(formData: FormData): Promise<WorkforceWriteResult<{ exchangeId: string }>> {
  const exchangeId = formData.get('exchangeId');
  const decision = formData.get('decision');
  if (typeof exchangeId !== 'string' || !exchangeId) return INVALID_INPUT_RESULT;
  if (decision !== 'approved' && decision !== 'rejected') return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return decideShiftExchangeWrite(supabase, exchangeId, decision);
}
