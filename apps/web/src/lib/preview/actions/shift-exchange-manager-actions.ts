'use server';

import { revalidatePath } from 'next/cache';
import { resolvePreviewManagerContext } from './authorize';
import { decideShiftExchange } from '@/lib/workforce/shift-exchanges';
import { mapWorkforceWriteResult, type PreviewWriteResult } from '../write-result';

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
