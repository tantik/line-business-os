'use server';

import { revalidatePath } from 'next/cache';
import { resolvePreviewManagerContext } from './authorize';
import { decideShiftExchange, listShiftExchanges, type WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { listShiftAssignments, type WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { getWeekOffsetWindow } from '@/lib/workforce/period';
import { addIsoDays, localDateTimeToUtcIso } from '@/lib/workforce/timezone';
import { mapWorkforceWriteResult, type PreviewWriteResult } from '../write-result';

/** Mirrors the manager page's own -8..+8 week bound for the exchange-eligible assignment window (`manager/page.tsx`'s `MAX_WEEK_OFFSET`/`exchangeAssignmentWindow`) - never re-fetch the tenant's entire shift-assignment history for this panel. */
const MAX_WEEK_OFFSET = 8;

export interface PreviewShiftExchangeManagerData {
  exchanges: WorkforceShiftExchange[];
  assignments: WorkforceShiftAssignment[];
}

/**
 * Manager-only: re-read the current exchange requests + their eligible
 * assignment window. Preview Manager architecture (perf phase 3) - the Shift
 * Exchange panel calls this instead of `router.refresh()` after a successful
 * approve/reject, so a decision refreshes only this panel, not the whole
 * Manager page.
 */
export async function previewGetShiftExchangeManagerData(): Promise<PreviewWriteResult<PreviewShiftExchangeManagerData>> {
  const contextResult = await resolvePreviewManagerContext('workforce.request.manage');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId, timeZone } = contextResult.context;

  const nowIso = new Date().toISOString();
  const window = getWeekOffsetWindow(nowIso, timeZone, -MAX_WEEK_OFFSET, MAX_WEEK_OFFSET);
  const fromIso = localDateTimeToUtcIso(window.periodStart, '00:00', timeZone);
  const toIsoExclusive = localDateTimeToUtcIso(addIsoDays(window.periodEnd, 1), '00:00', timeZone);

  const [exchangesResult, assignmentsResult] = await Promise.all([
    listShiftExchanges(supabase, tenantId, locationId),
    listShiftAssignments(supabase, tenantId, { fromIso, toIsoExclusive }),
  ]);
  if (exchangesResult.status !== 'success') return mapWorkforceWriteResult(exchangesResult);
  if (assignmentsResult.status !== 'success') return mapWorkforceWriteResult(assignmentsResult);
  return { status: 'success', data: { exchanges: exchangesResult.data, assignments: assignmentsResult.data } };
}

function field(formData: FormData, key: string, max: number): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

export async function previewDecideShiftExchange(
  formData: FormData,
): Promise<PreviewWriteResult<{ exchangeId: string }>> {
  const exchangeId = field(formData, 'exchangeId', 64);
  const decision = field(formData, 'decision', 16);
  if (!exchangeId || (decision !== 'approved' && decision !== 'rejected')) {
    return { status: 'invalid_input' };
  }
  const auth = await resolvePreviewManagerContext('workforce.request.manage');
  if (auth.status === 'fail') return auth.result;
  const { supabase } = auth.context;
  // `decide_workforce_shift_exchange` (supabase/migrations/0050_workforce_shift_change_requests.sql)
  // already re-checks `core.has_permission(tenant_id, 'workforce.request.manage', location_id)`
  // and that the row is still open/accepted before deciding it, entirely
  // inside the RPC's own transaction -- an extra `listShiftExchanges` read
  // here to pre-validate the same thing was a redundant round trip on an
  // already-slow approve action, not an additional security boundary.
  const result = await decideShiftExchange(supabase, exchangeId, decision);
  if (result.status === 'success') {
    revalidatePath('/mame-to-cha');
    revalidatePath('/mame-to-cha/manager');
  }
  return mapWorkforceWriteResult(result);
}
