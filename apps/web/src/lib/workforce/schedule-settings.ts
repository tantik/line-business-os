import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

export interface WorkforceScheduleSettings {
  tenantId: string;
  locationId: string;
  requiredHeadcountByWeekday: number[];
  maxMonthlyHours: number;
  /** Day of month (1-28) the scheduled monthly auto-create job uses to generate the next calendar month's schedule proposal. Real, persisted, manager-editable (Round 3, 2026-08-22). */
  autoCreateDayOfMonth: number;
  /** Manager opt-in for scheduled monthly auto-create (migration 0114). Default OFF -- automation never runs for a location until a Manager explicitly turns it on here. */
  autoCreateEnabled: boolean;
  /** First-of-month date (`'YYYY-MM-01'`) of the last calendar month the scheduled worker successfully generated a proposal for -- `null` if it has never run. Read-only from the Manager UI's point of view; only the scheduled worker (service-role) ever writes this. */
  autoCreateLastGeneratedMonth: string | null;
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
    .select(
      'tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month',
    )
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
      autoCreateEnabled: data.auto_create_enabled as boolean,
      autoCreateLastGeneratedMonth: (data.auto_create_last_generated_month as string | null) ?? null,
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
export type UpsertWorkforceScheduleSettingsInput = Omit<
  WorkforceScheduleSettings,
  'autoCreateDayOfMonth' | 'autoCreateEnabled' | 'autoCreateLastGeneratedMonth'
> & {
  autoCreateDayOfMonth?: number;
  /** Manager ON/OFF opt-in. Omitting it (like `autoCreateDayOfMonth`) leaves the column untouched. `autoCreateLastGeneratedMonth` is deliberately NOT settable through this input at all -- only the scheduled worker (service-role) ever writes it. */
  autoCreateEnabled?: boolean;
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
        ...(settings.autoCreateEnabled !== undefined ? { auto_create_enabled: settings.autoCreateEnabled } : {}),
      },
      { onConflict: 'tenant_id,location_id' },
    )
    .select(
      'tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month',
    )
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
      autoCreateEnabled: data.auto_create_enabled as boolean,
      autoCreateLastGeneratedMonth: (data.auto_create_last_generated_month as string | null) ?? null,
    },
  };
}
