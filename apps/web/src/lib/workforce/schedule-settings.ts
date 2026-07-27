import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

export interface WorkforceScheduleSettings {
  tenantId: string;
  locationId: string;
  requiredHeadcountByWeekday: number[];
  maxMonthlyHours: number;
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
    .select('tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours')
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
    },
  };
}

export async function upsertWorkforceScheduleSettings(
  supabase: SupabaseClient,
  settings: WorkforceScheduleSettings,
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
      },
      { onConflict: 'tenant_id,location_id' },
    )
    .select('tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours')
    .single();
  if (error) return mapError(error);
  return {
    status: 'success',
    data: {
      tenantId: data.tenant_id as string,
      locationId: data.location_id as string,
      requiredHeadcountByWeekday: data.required_headcount_by_weekday as number[],
      maxMonthlyHours: data.max_monthly_hours as number,
    },
  };
}
