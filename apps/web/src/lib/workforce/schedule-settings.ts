import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

export interface WorkforceScheduleSettings {
  tenantId: string;
  locationId: string;
  requiredHeadcountByWeekday: number[];
  maxMonthlyHours: number;
  /** Day of month (1-28) a future scheduled-automation job will use to auto-create the next period's schedule. Real, persisted, manager-editable (Round 3, 2026-08-22) -- the automation job that reads it is not built yet. */
  autoCreateDayOfMonth: number;
}

function mapError(error: PostgrestError): TenantAccessResult<never> {
  if (error.code === '42501' || /permission denied|row-level security/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to access schedule settings.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

export async function getWorkforceScheduleSettings(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<TenantAccessResult<WorkforceScheduleSettings | null>> {
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_schedule_settings')
    .select('tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .maybeSingle();
  if (error) return mapError(error);
  if (!data) return { status: 'success', data: null };
  return {
    status: 'success',
    data: {
      tenantId: data.tenant_id as string,
      locationId: data.location_id as string,
      requiredHeadcountByWeekday: data.required_headcount_by_weekday as number[],
      maxMonthlyHours: data.max_monthly_hours as number,
      autoCreateDayOfMonth: data.auto_create_day_of_month as number,
    },
  };
}

/**
 * `autoCreateDayOfMonth` is optional here (unlike the full `WorkforceScheduleSettings`
 * read type, where the column's `not null default 20` guarantees it's always
 * present) -- the `_client-preview/mame-to-cha` reference surface's own
 * settings action writes `requiredHeadcountByWeekday`/`maxMonthlyHours`
 * only and has no concept of scheduled automation. Omitting the field from
 * the upsert payload leaves the column untouched on an existing row (or
 * takes its DB default on first insert) rather than forcing every caller to
 * invent a value for a canonical-Manager-only setting.
 */
export type UpsertWorkforceScheduleSettingsInput = Omit<WorkforceScheduleSettings, 'autoCreateDayOfMonth'> & {
  autoCreateDayOfMonth?: number;
};

export async function upsertWorkforceScheduleSettings(
  supabase: SupabaseClient,
  settings: UpsertWorkforceScheduleSettingsInput,
): Promise<TenantAccessResult<WorkforceScheduleSettings>> {
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_schedule_settings')
    .upsert(
      {
        tenant_id: settings.tenantId,
        location_id: settings.locationId,
        required_headcount_by_weekday: settings.requiredHeadcountByWeekday,
        max_monthly_hours: settings.maxMonthlyHours,
        ...(settings.autoCreateDayOfMonth !== undefined ? { auto_create_day_of_month: settings.autoCreateDayOfMonth } : {}),
      },
      { onConflict: 'tenant_id,location_id' },
    )
    .select('tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month')
    .single();
  if (error) return mapError(error);
  return {
    status: 'success',
    data: {
      tenantId: data.tenant_id as string,
      locationId: data.location_id as string,
      requiredHeadcountByWeekday: data.required_headcount_by_weekday as number[],
      maxMonthlyHours: data.max_monthly_hours as number,
      autoCreateDayOfMonth: data.auto_create_day_of_month as number,
    },
  };
}
