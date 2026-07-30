'use server';

import { revalidatePath } from 'next/cache';
import {
  completeInventoryCheckSession,
  recordInventorySessionItem,
  startInventoryCheckSession,
  type InventoryCheckType,
} from '@/lib/inventory/check-sessions';
import type { InventoryWriteResult } from '@/lib/inventory/result-types';
import { resolvePreviewInventoryStaffContext } from './inventory-authorize';
import { type PreviewWriteResult } from '../write-result';

function map<T>(result: InventoryWriteResult<T>): PreviewWriteResult<T> {
  if (result.status === 'success') return result;
  if (result.status === 'not_found') return { status: 'not_found' };
  if (result.status === 'not_authenticated') return { status: 'not_authenticated' };
  if (result.status === 'no_membership' || result.status === 'unauthorized') return { status: 'no_access' };
  return { status: 'unexpected_error' };
}

function text(data: FormData, key: string, max = 64): string | null {
  const value = data.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function refresh() {
  revalidatePath('/mame-to-cha');
  revalidatePath('/mame-to-cha/manager');
}

export async function previewStartInventorySession(formData: FormData): Promise<PreviewWriteResult<{ id: string }>> {
  const businessDate = text(formData, 'businessDate', 10);
  const checkType = text(formData, 'checkType', 16);
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || (checkType !== 'opening' && checkType !== 'closing')) {
    return { status: 'invalid_input' };
  }
  const context = await resolvePreviewInventoryStaffContext();
  if (context.status !== 'ok') return context.result;
  const result = await startInventoryCheckSession(
    context.context.supabase,
    context.context.tenantId,
    context.context.locationId,
    businessDate,
    checkType as InventoryCheckType,
  );
  if (result.status === 'success') refresh();
  return map(result);
}

export async function previewRecordInventorySessionItem(formData: FormData): Promise<PreviewWriteResult<{ id: string }>> {
  const sessionId = text(formData, 'sessionId');
  const itemId = text(formData, 'itemId');
  const raw = text(formData, 'actualQuantity', 32);
  const actualQuantity = raw === null ? Number.NaN : Number(raw);
  if (!sessionId || !itemId || !Number.isFinite(actualQuantity) || actualQuantity < 0) return { status: 'invalid_input' };
  const context = await resolvePreviewInventoryStaffContext();
  if (context.status !== 'ok') return context.result;
  const result = await recordInventorySessionItem(context.context.supabase, sessionId, itemId, actualQuantity);
  if (result.status === 'success') refresh();
  return map(result);
}

export async function previewCompleteInventorySession(formData: FormData): Promise<PreviewWriteResult<{ id: string }>> {
  const sessionId = text(formData, 'sessionId');
  if (!sessionId) return { status: 'invalid_input' };
  const context = await resolvePreviewInventoryStaffContext();
  if (context.status !== 'ok') return context.result;
  const result = await completeInventoryCheckSession(context.context.supabase, sessionId);
  if (result.status === 'success') refresh();
  return map(result);
}
