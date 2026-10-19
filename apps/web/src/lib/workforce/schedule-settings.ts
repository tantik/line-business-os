import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';

/** DB defaults of `workforce.schedule_settings.max_weekly_hours` / `max_days_per_week` (migration 0126). Also used when a location has no settings row yet, so the weekly labour limits are never silently off. */
export const DEFAULT_MAX_WEEKLY_HOURS = 40;
export const DEFAULT_MAX_DAYS_PER_WEEK = 5;

export interface WorkforceScheduleSettings {
  tenantId: string;
  locationId: string;
  requiredHeadcountByWeekday: number[];
  maxMonthlyHours: number;
  /** Per-staff cap on net worked hours per ISO week (Mon-Sun) the auto-schedule engine respects (migration 0126, default 40 -- 労働基準法 statutory weekly limit). */
  maxWeeklyHours: number;
  /** Per-staff cap on working days per ISO week (Mon-Sun) the auto-schedule engine respects (migration 0126, default 5). */
  maxDaysPerWeek: number;
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
      'tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, max_weekly_hours, max_days_per_week, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month',
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
      maxWeeklyHours: data.max_weekly_hours as number,
      maxDaysPerWeek: data.max_days_per_week as number,
      autoCreateDayOfMonth: data.auto_create_day_of_month as number,
      autoCreateEnabled: data.auto_create_enabled as boolean,
      autoCreateLastGeneratedMonth: (data.auto_create_last_generated_month as string | null) ?? null,
    },
  };
}

export type AutoScheduleRunOutcome = 'generated' | 'config_error' | 'failed';

/** One row of the scheduled monthly auto-create run log (`api.workforce_auto_schedule_runs`, migration 0125). Ids/counts/machine code only. */
export interface AutoScheduleRun {
  runId: string;
  /** First-of-month date (`'YYYY-MM-01'`) of the month the run targeted. */
  targetMonth: string;
  outcome: AutoScheduleRunOutcome;
  createdCount: number;
  shortageCount: number;
  /** Short machine code (`no_active_shift_types`, `no_staffing_requirement`, `apply_failed`, ...) -- never raw error text. `null` for `generated`. */
  errorCode: string | null;
  attemptCount: number;
  /** ISO instant of the latest attempt with this outcome. */
  lastSeenAt: string;
}

/**
 * Latest scheduled-auto-create run-log rows for one location (newest first;
 * a few more than are shown, so `visibleAutoScheduleRuns` can drop rows
 * superseded by a later `generated` row and still show up to 3).
 * RLS (`wf_auto_schedule_runs_read`): workforce.shift.write at the location
 * with the Workforce module ON -- the Manager page is the only caller.
 */
export async function listRecentAutoScheduleRuns(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  limit = 6,
): Promise<TenantAccessResult<AutoScheduleRun[]>> {
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_auto_schedule_runs')
    .select('run_id, target_month, outcome, created_count, shortage_count, error_code, attempt_count, last_seen_at')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) return mapError(error);
  return {
    status: 'success',
    data: (data ?? []).map((row) => ({
      runId: row.run_id as string,
      targetMonth: row.target_month as string,
      outcome: row.outcome as AutoScheduleRunOutcome,
      createdCount: row.created_count as number,
      shortageCount: row.shortage_count as number,
      errorCode: (row.error_code as string | null) ?? null,
      attemptCount: row.attempt_count as number,
      lastSeenAt: row.last_seen_at as string,
    })),
  };
}

/**
 * What the Manager sees: the newest `max` rows, minus any config_error /
 * failed row for a target month that already has a `generated` row (a later
 * successful run supersedes earlier problems for the same month, so the log
 * never contradicts itself). Input is newest-first; order is preserved.
 */
export function visibleAutoScheduleRuns(runs: readonly AutoScheduleRun[], max = 3): AutoScheduleRun[] {
  const generatedMonths = new Set(runs.filter((run) => run.outcome === 'generated').map((run) => run.targetMonth));
  return runs.filter((run) => run.outcome === 'generated' || !generatedMonths.has(run.targetMonth)).slice(0, max);
}

/**
 * True when the scheduled auto-create should already have run this month
 * but there is no trace of it: automation ON, today (location timezone) is
 * past the configured day, the marker is not next month, and no run-log row
 * (of any outcome) exists for next month. Pure -- `todayIso` is the
 * location-local date.
 */
export function isAutoScheduleRunMissed(input: {
  autoCreateEnabled: boolean;
  autoCreateDayOfMonth: number;
  autoCreateLastGeneratedMonth: string | null;
  todayIso: string;
  runs: readonly Pick<AutoScheduleRun, 'targetMonth'>[];
}): boolean {
  if (!input.autoCreateEnabled) return false;
  const [year, month, day] = input.todayIso.split('-').map(Number) as [number, number, number];
  if (!(day > input.autoCreateDayOfMonth)) return false;
  const next = new Date(Date.UTC(year, month, 1)); // `month` is 1-based, so this is next month's first day
  const nextMonthStart = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  if (input.autoCreateLastGeneratedMonth === nextMonthStart) return false;
  return !input.runs.some((run) => run.targetMonth === nextMonthStart);
}

/**
 * `autoCreateDayOfMonth` is optional here (unlike the full `WorkforceScheduleSettings`
 * read type, where the column's `not null default 20` guarantees it's always
 * present) -- callers that only edit headcount/hours (e.g. the earlier
 * preview surface's settings action) write `requiredHeadcountByWeekday`/`maxMonthlyHours`
 * only and has no concept of scheduled automation. Omitting the field from
 * the upsert payload leaves the column untouched on an existing row (or
 * takes its DB default on first insert) rather than forcing every caller to
 * invent a value for a canonical-Manager-only setting.
 */
export type UpsertWorkforceScheduleSettingsInput = Omit<
  WorkforceScheduleSettings,
  'autoCreateDayOfMonth' | 'autoCreateEnabled' | 'autoCreateLastGeneratedMonth' | 'maxWeeklyHours' | 'maxDaysPerWeek'
> & {
  autoCreateDayOfMonth?: number;
  /** Weekly labour limits (0126). Omitting either leaves the column untouched (or takes its DB default on first insert) -- the `_client-preview` settings action does not know about them. */
  maxWeeklyHours?: number;
  maxDaysPerWeek?: number;
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
        ...(settings.maxWeeklyHours !== undefined ? { max_weekly_hours: settings.maxWeeklyHours } : {}),
        ...(settings.maxDaysPerWeek !== undefined ? { max_days_per_week: settings.maxDaysPerWeek } : {}),
        ...(settings.autoCreateDayOfMonth !== undefined ? { auto_create_day_of_month: settings.autoCreateDayOfMonth } : {}),
        ...(settings.autoCreateEnabled !== undefined ? { auto_create_enabled: settings.autoCreateEnabled } : {}),
      },
      { onConflict: 'tenant_id,location_id' },
    )
    .select(
      'tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, max_weekly_hours, max_days_per_week, auto_create_day_of_month, auto_create_enabled, auto_create_last_generated_month',
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
      maxWeeklyHours: data.max_weekly_hours as number,
      maxDaysPerWeek: data.max_days_per_week as number,
      autoCreateDayOfMonth: data.auto_create_day_of_month as number,
      autoCreateEnabled: data.auto_create_enabled as boolean,
      autoCreateLastGeneratedMonth: (data.auto_create_last_generated_month as string | null) ?? null,
    },
  };
}
