'use server';

import { upsertWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { listWorkforceShiftTypes, setWorkforceShiftTypeActive, upsertWorkforceShiftType } from '@/lib/workforce/shift-types';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, PREVIEW_INVALID_INPUT_RESULT, type PreviewWriteResult } from '../write-result';

export async function previewSaveScheduleSettings(
  input: unknown,
): Promise<PreviewWriteResult<{ requiredHeadcountByWeekday: number[]; maxMonthlyHours: number }>> {
  if (!input || typeof input !== 'object') return PREVIEW_INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const required = value.requiredHeadcountByWeekday;
  const maxHours = value.maxMonthlyHours;
  if (
    !Array.isArray(required) ||
    required.length !== 7 ||
    required.some((item) => !Number.isInteger(item) || (item as number) < 0 || (item as number) > 100) ||
    !Number.isInteger(maxHours) ||
    (maxHours as number) < 0 ||
    (maxHours as number) > 744
  ) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }

  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;
  const result = await upsertWorkforceScheduleSettings(supabase, {
    tenantId,
    locationId,
    requiredHeadcountByWeekday: required as number[],
    maxMonthlyHours: maxHours as number,
  });
  const mapped = mapWorkforceWriteResult(result);
  if (mapped.status !== 'success') return mapped;
  return {
    status: 'success',
    data: {
      requiredHeadcountByWeekday: mapped.data.requiredHeadcountByWeekday,
      maxMonthlyHours: mapped.data.maxMonthlyHours,
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function previewUpsertShiftType(input: unknown): Promise<PreviewWriteResult<unknown>> {
  if (!input || typeof input !== 'object') return PREVIEW_INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const shiftTypeId = typeof value.shiftTypeId === 'string' && value.shiftTypeId ? value.shiftTypeId : undefined;
  const labelJa = typeof value.labelJa === 'string' ? value.labelJa.trim() : '';
  const startsAtLocal = typeof value.startsAtLocal === 'string' ? value.startsAtLocal : '';
  const endsAtLocal = typeof value.endsAtLocal === 'string' ? value.endsAtLocal : '';
  if (
    (shiftTypeId && !UUID_RE.test(shiftTypeId)) ||
    !labelJa ||
    labelJa.length > 80 ||
    !TIME_RE.test(startsAtLocal) ||
    !TIME_RE.test(endsAtLocal) ||
    endsAtLocal <= startsAtLocal
  ) {
    return PREVIEW_INVALID_INPUT_RESULT;
  }
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;
  if (shiftTypeId) {
    const visible = await listWorkforceShiftTypes(supabase, tenantId);
    if (visible.status !== 'success') return { status: visible.status === 'unauthorized' ? 'no_access' : 'unexpected_error' };
    if (!visible.data.some((item) => item.shiftTypeId === shiftTypeId && item.locationId === locationId)) return { status: 'not_found' };
  }
  return mapWorkforceWriteResult(
    await upsertWorkforceShiftType(supabase, { shiftTypeId, tenantId, locationId, labelJa, startsAtLocal, endsAtLocal }),
  );
}

export async function previewSetShiftTypeActive(input: unknown): Promise<PreviewWriteResult<unknown>> {
  if (!input || typeof input !== 'object') return PREVIEW_INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  if (typeof value.shiftTypeId !== 'string' || !UUID_RE.test(value.shiftTypeId) || typeof value.isActive !== 'boolean') {
    return PREVIEW_INVALID_INPUT_RESULT;
  }
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;
  return mapWorkforceWriteResult(
    await setWorkforceShiftTypeActive(supabase, tenantId, locationId, value.shiftTypeId, value.isActive),
  );
}
