'use server';

import { upsertWorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
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
