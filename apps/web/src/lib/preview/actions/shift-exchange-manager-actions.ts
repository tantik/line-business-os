'use server';

import { revalidatePath } from 'next/cache';
import { resolvePreviewManagerContext } from './authorize';
import { decideShiftExchange, listShiftExchanges } from '@/lib/workforce/shift-exchanges';
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
  const { supabase, tenantId, locationId } = auth.context;
  const exchanges = await listShiftExchanges(supabase, tenantId, locationId);
  if (exchanges.status !== 'success') return mapWorkforceWriteResult(exchanges);
  if (!exchanges.data.some((exchange) => exchange.exchangeId === exchangeId)) {
    return { status: 'not_found' };
  }
  const result = await decideShiftExchange(supabase, exchangeId, decision);
  if (result.status === 'success') {
    revalidatePath('/mame-to-cha');
    revalidatePath('/mame-to-cha/manager');
  }
  return mapWorkforceWriteResult(result);
}
