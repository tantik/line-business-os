'use server';

import { revalidatePath } from 'next/cache';
import { resolvePreviewStaffContext } from './authorize';
import {
  acceptShiftExchange,
  cancelShiftExchange,
  createShiftExchange,
} from '@/lib/workforce/shift-exchanges';
import { listShiftAssignments } from '@/lib/workforce/shift-assignments';
import { listWorkforceShiftTypes } from '@/lib/workforce/shift-types';
import { mapWorkforceWriteResult, type PreviewWriteResult } from '../write-result';

const PREVIEW_BASE = '/mame-to-cha';

function field(formData: FormData, key: string, max = 500): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function refresh() {
  revalidatePath(PREVIEW_BASE);
  revalidatePath(`${PREVIEW_BASE}/manager`);
}

export async function previewRequestShiftExchange(formData: FormData): Promise<PreviewWriteResult<{ exchangeId: string }>> {
  const shiftId = field(formData, 'shiftId', 64);
  const reason = field(formData, 'reason');
  const requestKind = field(formData, 'requestKind', 16);
  const requestedShiftTypeId = field(formData, 'requestedShiftTypeId', 64);
  if (!shiftId || !reason || !requestKind || !['exchange', 'change', 'cancel'].includes(requestKind)) return { status: 'invalid_input' };
  if (requestKind === 'change' && !requestedShiftTypeId) return { status: 'invalid_input' };

  const auth = await resolvePreviewStaffContext();
  if (auth.status === 'fail') return auth.result;
  const { supabase, tenantId, locationId, employeeId } = auth.context;

  const shifts = await listShiftAssignments(supabase, tenantId, {});
  if (shifts.status !== 'success') return mapWorkforceWriteResult(shifts);
  const target = shifts.data.find(
    (shift) =>
      shift.assignmentId === shiftId &&
      shift.locationId === locationId &&
      shift.employeeId === employeeId &&
      shift.published &&
      new Date(shift.startsAt).getTime() > Date.now(),
  );
  if (!target) return { status: 'not_found' };

  if (requestKind === 'change') {
    const types = await listWorkforceShiftTypes(supabase, tenantId);
    if (types.status !== 'success') return mapWorkforceWriteResult(types);
    const requested = types.data.find((type) => type.shiftTypeId === requestedShiftTypeId && type.isActive);
    if (!requested || (requested.locationId !== null && requested.locationId !== locationId)) return { status: 'not_found' };
  }

  const result = await createShiftExchange(supabase, {
    tenantId,
    locationId,
    shiftId,
    requesterEmployeeId: employeeId,
    reason,
    requestKind: requestKind as 'exchange' | 'change' | 'cancel',
    requestedShiftTypeId,
  });
  if (result.status === 'success') refresh();
  return result.status === 'success'
    ? { status: 'success', data: { exchangeId: result.data.exchangeId } }
    : mapWorkforceWriteResult(result);
}

export async function previewAcceptShiftExchange(formData: FormData): Promise<PreviewWriteResult<{ exchangeId: string }>> {
  const exchangeId = field(formData, 'exchangeId', 64);
  if (!exchangeId) return { status: 'invalid_input' };
  const auth = await resolvePreviewStaffContext();
  if (auth.status === 'fail') return auth.result;
  const result = await acceptShiftExchange(auth.context.supabase, exchangeId);
  if (result.status === 'success') refresh();
  return mapWorkforceWriteResult(result);
}

export async function previewCancelShiftExchange(formData: FormData): Promise<PreviewWriteResult<{ exchangeId: string }>> {
  const exchangeId = field(formData, 'exchangeId', 64);
  if (!exchangeId) return { status: 'invalid_input' };
  const auth = await resolvePreviewStaffContext();
  if (auth.status === 'fail') return auth.result;
  const result = await cancelShiftExchange(auth.context.supabase, exchangeId);
  if (result.status === 'success') refresh();
  return mapWorkforceWriteResult(result);
}
