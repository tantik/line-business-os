// ============================================================================
// _shared/auto-schedule/job.ts -- scheduled monthly auto-create orchestration
// ----------------------------------------------------------------------------
// DEBT-074 (Stage 2). Moved from `apps/worker/src/jobs/auto-schedule-monthly.ts`
// (which never had a deployment target) to run inside the
// `auto-schedule-monthly` Edge Function, invoked hourly by pg_cron
// (migration 0125). Business rules are carried over unchanged:
//
//   * only locations whose Manager opted in (`auto_create_enabled`), whose
//     tenant has Workforce enabled, and whose location is active -- this
//     filter lives in the DB (`api.auto_schedule_candidates()`);
//   * on the Manager-configured day of month, in the LOCATION's timezone,
//     generate a REVIEW-PENDING proposal (`published: false`) for the NEXT
//     calendar month -- never auto-published, never sent via LINE;
//   * the ONE shared engine (`autoDistribute()` +
//     `buildAuthoritativeStaffingRequirements()` /
//     `hasPositiveStaffingRequirement()`), copied verbatim from
//     `packages/workforce` by `scripts/sync-edge-workforce-engine.mjs` --
//     never a second implementation;
//   * idempotency marker `auto_create_last_generated_month` (0114): a
//     location already marked for the target month is skipped; a config
//     error never sets the marker (fix-and-retry on the next hourly tick).
//
// What changed vs. the worker: every DB read/write goes through narrow
// service-role-only RPCs (0125) instead of direct table access, and the
// marker + draft insert + run log + audit row are ONE transaction
// (`api.auto_schedule_apply`, optimistic lock on the marker). Every outcome
// that is not a silent skip is recorded in `workforce.auto_schedule_runs`,
// so the Manager can see it. A failure at one location is caught and
// recorded, and the next location still runs.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports -- the caller injects
// the RPC function and "now", so this is unit-testable under Node/tsx.
// ============================================================================

import {
  autoDistribute,
  endOfIsoWeek,
  startOfIsoWeek,
  type AutoDistributeEmployee,
  type AutoDistributeExistingAssignment,
  type AutoDistributePreference,
  type AutoDistributeShiftType,
} from '../workforce-engine/auto-distribute.ts';
import {
  buildAuthoritativeStaffingRequirements,
  hasPositiveStaffingRequirement,
} from '../workforce-engine/auto-distribution-authority.ts';
import { addIsoDays, localDateTimeToUtcIso, nextMonthPeriod, todayIsoInTimeZone, utcIsoToLocalDateTime } from './timezone.ts';

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

/** Injected RPC caller -- in the Edge Function this is `serviceClient.rpc` on the `api` schema. */
export type AutoScheduleRpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

/** One row of `api.auto_schedule_candidates()`. */
export interface AutoScheduleCandidate {
  tenant_id: string;
  location_id: string;
  timezone: string;
  auto_create_day_of_month: number;
  auto_create_last_generated_month: string | null;
  required_headcount_by_weekday: number[];
  max_monthly_hours: number;
  /** Weekly labour limits (migration 0126; per ISO week Mon-Sun). */
  max_weekly_hours: number;
  max_days_per_week: number;
}

/** Shape of `api.auto_schedule_load_inputs(...)`'s jsonb result. */
export interface AutoScheduleInputs {
  employees: { employee_id: string; is_active: boolean }[];
  shift_types: {
    shift_type_id: string;
    code: string;
    starts_at_local: string;
    ends_at_local: string;
    break_minutes: number;
    sort_order: number;
    is_active: boolean;
  }[];
  preferences: { employee_id: string; work_date: string; shift_type_id: string | null; is_unavailable: boolean }[];
  existing_assignments: {
    employee_id: string | null;
    shift_type_id: string | null;
    starts_at: string;
    ends_at: string;
    break_minutes: number;
    published: boolean;
    location_id: string;
  }[];
}

/** Machine codes only -- never raw error text (stored in `workforce.auto_schedule_runs.error_code`). */
export type AutoScheduleConfigErrorCode = 'no_active_shift_types' | 'no_staffing_requirement';
export type AutoScheduleFailureCode =
  | 'load_inputs_failed'
  | 'apply_failed'
  | 'invalid_timezone'
  | 'unexpected_error';

export type AutoScheduleOutcome = 'generated' | 'config_error' | 'failed' | 'already_claimed';

/** Per-location result. Ids + counts + a machine code only -- no PII, no raw error text. */
export interface AutoScheduleLocationResult {
  tenantId: string;
  locationId: string;
  targetMonth: string; // YYYY-MM
  outcome: AutoScheduleOutcome;
  errorCode: AutoScheduleConfigErrorCode | AutoScheduleFailureCode | null;
  created: number;
  shortages: number;
  unplaced: number;
  assignedWithoutPreference: number;
}

export interface AutoScheduleRunSummary {
  /** Opted-in, module-enabled, active locations checked this tick. */
  candidates: number;
  /** Only locations that were due this tick (silent skips are omitted). */
  results: AutoScheduleLocationResult[];
}

/** Thrown for a whole-run failure that happens before any location is processed. */
export class AutoScheduleRunError extends Error {
  constructor(readonly code: 'candidates_failed') {
    super(code);
    this.name = 'AutoScheduleRunError';
  }
}

class LocationStepError extends Error {
  constructor(readonly code: AutoScheduleFailureCode) {
    super(code);
    this.name = 'LocationStepError';
  }
}

/**
 * Runs one scheduled tick for every candidate location. `now` is the instant
 * the tick represents; each location's "today" is derived from it in that
 * location's own timezone.
 */
export async function runAutoScheduleMonthly(rpc: AutoScheduleRpc, now: Date): Promise<AutoScheduleRunSummary> {
  const { data, error } = await rpc('auto_schedule_candidates');
  if (error) throw new AutoScheduleRunError('candidates_failed');
  const candidates = (Array.isArray(data) ? data : []) as AutoScheduleCandidate[];

  const results: AutoScheduleLocationResult[] = [];
  for (const candidate of candidates) {
    const result = await runForLocation(rpc, candidate, now);
    if (result) results.push(result);
  }
  return { candidates: candidates.length, results };
}

function emptyResult(
  candidate: AutoScheduleCandidate,
  targetMonth: string,
  outcome: AutoScheduleOutcome,
  errorCode: AutoScheduleLocationResult['errorCode'],
): AutoScheduleLocationResult {
  return {
    tenantId: candidate.tenant_id,
    locationId: candidate.location_id,
    targetMonth,
    outcome,
    errorCode,
    created: 0,
    shortages: 0,
    unplaced: 0,
    assignedWithoutPreference: 0,
  };
}

async function recordIssue(
  rpc: AutoScheduleRpc,
  candidate: AutoScheduleCandidate,
  periodStart: string,
  outcome: 'config_error' | 'failed',
  errorCode: string,
): Promise<void> {
  try {
    await rpc('auto_schedule_record_issue', {
      p_tenant_id: candidate.tenant_id,
      p_location_id: candidate.location_id,
      p_target_month: periodStart,
      p_outcome: outcome,
      p_error_code: errorCode,
    });
  } catch {
    // Recording is best-effort: the summary still reports the outcome, and
    // the next hourly tick on the trigger day retries the location anyway.
  }
}

async function runForLocation(
  rpc: AutoScheduleRpc,
  candidate: AutoScheduleCandidate,
  now: Date,
): Promise<AutoScheduleLocationResult | null> {
  const { tenant_id: tenantId, location_id: locationId } = candidate;

  let today: string;
  try {
    today = todayIsoInTimeZone(candidate.timezone, now);
  } catch {
    // An unparseable IANA zone can never match a trigger day -- record it
    // against the UTC next month so the failure is visible, not silent.
    const fallbackTarget = nextMonthPeriod(now.toISOString().slice(0, 10));
    if (now.getUTCDate() !== candidate.auto_create_day_of_month) return null;
    await recordIssue(rpc, candidate, fallbackTarget.periodStart, 'failed', 'invalid_timezone');
    return emptyResult(candidate, fallbackTarget.monthPrefix, 'failed', 'invalid_timezone');
  }

  const todayDayOfMonth = Number(today.slice(8, 10));
  if (todayDayOfMonth !== candidate.auto_create_day_of_month) return null; // not this location's trigger day

  const target = nextMonthPeriod(today);
  if (candidate.auto_create_last_generated_month === target.periodStart) return null; // already generated this month (idempotent re-tick)

  try {
    const timeZone = candidate.timezone;
    // Existing-shift READ window = the whole Monday-Sunday weeks overlapping
    // the target month, so the weekly labour limits also count the boundary
    // weeks' days in the neighbouring months. Those out-of-month rows are
    // used by the engine ONLY for the weekly limits; drafts are still only
    // ever written inside the target month (re-checked by auto_schedule_apply).
    const readFromIso = localDateTimeToUtcIso(startOfIsoWeek(target.periodStart), '00:00', timeZone);
    const readToIsoExclusive = localDateTimeToUtcIso(addIsoDays(endOfIsoWeek(target.periodEnd), 1), '00:00', timeZone);

    // Every read inside this RPC is scoped by BOTH tenant_id and location_id
    // (service_role bypasses RLS -- isolation is explicit, never implied).
    const loaded = await rpc('auto_schedule_load_inputs', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_period_start: target.periodStart,
      p_period_end: target.periodEnd,
      p_from: readFromIso,
      p_to: readToIsoExclusive,
    });
    if (loaded.error || !loaded.data || typeof loaded.data !== 'object') throw new LocationStepError('load_inputs_failed');
    const inputs = loaded.data as AutoScheduleInputs;

    const shiftTypes: AutoDistributeShiftType[] = (inputs.shift_types ?? []).map((st) => ({
      shiftTypeId: st.shift_type_id,
      code: st.code,
      startsAtLocal: st.starts_at_local.slice(0, 5),
      endsAtLocal: st.ends_at_local.slice(0, 5),
      breakMinutes: st.break_minutes,
      sortOrder: st.sort_order,
      isActive: st.is_active,
    }));

    const activeShiftTypeIds = shiftTypes.filter((st) => st.isActive).map((st) => st.shiftTypeId);
    if (activeShiftTypeIds.length === 0) {
      // Config problem -- do NOT mark as generated; retried on the next tick.
      await recordIssue(rpc, candidate, target.periodStart, 'config_error', 'no_active_shift_types');
      return emptyResult(candidate, target.monthPrefix, 'config_error', 'no_active_shift_types');
    }

    const staffingRequirements = buildAuthoritativeStaffingRequirements(activeShiftTypeIds, candidate.required_headcount_by_weekday);
    if (!hasPositiveStaffingRequirement(staffingRequirements)) {
      // Config problem -- do NOT mark as generated.
      await recordIssue(rpc, candidate, target.periodStart, 'config_error', 'no_staffing_requirement');
      return emptyResult(candidate, target.monthPrefix, 'config_error', 'no_staffing_requirement');
    }

    const employees: AutoDistributeEmployee[] = (inputs.employees ?? []).map((e) => ({
      employeeId: e.employee_id,
      isActive: e.is_active,
    }));

    const preferences: AutoDistributePreference[] = (inputs.preferences ?? []).map((r) => ({
      employeeId: r.employee_id,
      workDate: r.work_date,
      shiftTypeId: r.shift_type_id,
      isUnavailable: r.is_unavailable,
    }));

    // The target month is entirely in the future, so a manually pre-created
    // shift is the only kind of existing assignment this run can see inside
    // it; it is preserved (`overwriteExisting: false`), never cleared. Rows
    // of the boundary weeks outside the month (published or not -- this run
    // never touches them) count only toward the weekly limits. Defensively
    // re-filtered to this location (belt-and-suspenders, as the manual path).
    const existingAssignments: AutoDistributeExistingAssignment[] = (inputs.existing_assignments ?? [])
      .filter((a) => a.location_id === locationId)
      .map((a) => {
        if (!a.employee_id) return null;
        const startLocal = utcIsoToLocalDateTime(a.starts_at, timeZone);
        const endLocal = utcIsoToLocalDateTime(a.ends_at, timeZone);
        return {
          employeeId: a.employee_id,
          workDate: startLocal.workDate,
          shiftTypeId: a.shift_type_id,
          startsAtLocal: startLocal.localTime,
          endsAtLocal: endLocal.localTime,
          breakMinutes: a.break_minutes,
          published: a.published,
        };
      })
      .filter((a): a is AutoDistributeExistingAssignment => a !== null);

    const result = autoDistribute({
      employees,
      shiftTypes,
      preferences,
      staffingRequirements,
      existingAssignments,
      options: {
        periodStart: target.periodStart,
        periodEnd: target.periodEnd,
        maxPeriodHours: candidate.max_monthly_hours,
        extraHoursByEmployee: {}, // the whole cap window IS this run's period -- nothing accrues outside it
        maxWeeklyHours: candidate.max_weekly_hours,
        maxDaysPerWeek: candidate.max_days_per_week,
        overwriteExisting: false,
      },
    });

    const drafts = result.draftAssignments.map((draft) => ({
      employee_id: draft.employeeId,
      shift_type_id: draft.shiftTypeId,
      starts_at: localDateTimeToUtcIso(draft.workDate, draft.startsAtLocal, timeZone),
      ends_at: localDateTimeToUtcIso(draft.workDate, draft.endsAtLocal, timeZone),
      break_minutes: draft.breakMinutes,
    }));

    // ONE transaction in the DB: optimistic-lock claim of the marker, then
    // drafts (published = false), run log and audit row. `false` = another
    // run already claimed this (location, month) -- nothing was written.
    const applied = await rpc('auto_schedule_apply', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_target_month: target.periodStart,
      p_expected_marker: candidate.auto_create_last_generated_month,
      p_drafts: drafts,
      p_shortages: result.shortages.length,
      p_unplaced: result.unplaced.length,
      p_assigned_without_preference: result.assignedWithoutPreference.length,
    });
    if (applied.error) throw new LocationStepError('apply_failed');
    if (applied.data !== true) return emptyResult(candidate, target.monthPrefix, 'already_claimed', null);

    return {
      tenantId,
      locationId,
      targetMonth: target.monthPrefix,
      outcome: 'generated',
      errorCode: null,
      created: result.draftAssignments.length,
      shortages: result.shortages.length,
      unplaced: result.unplaced.length,
      assignedWithoutPreference: result.assignedWithoutPreference.length,
    };
  } catch (err) {
    // Per-location isolation: record and continue with the next location.
    const code: AutoScheduleFailureCode = err instanceof LocationStepError ? err.code : 'unexpected_error';
    await recordIssue(rpc, candidate, target.periodStart, 'failed', code);
    return emptyResult(candidate, target.monthPrefix, 'failed', code);
  }
}
