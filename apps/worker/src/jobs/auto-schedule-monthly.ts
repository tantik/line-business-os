import { createServiceClient } from '@line-os/db';
import {
  autoDistribute,
  buildAuthoritativeStaffingRequirements,
  hasPositiveStaffingRequirement,
  type AutoDistributeEmployee,
  type AutoDistributeExistingAssignment,
  type AutoDistributePreference,
  type AutoDistributeShiftType,
} from '@line-os/workforce';
import { addIsoDays, localDateTimeToUtcIso, nextMonthPeriod, todayIsoInTimeZone, utcIsoToLocalDateTime } from '../lib/timezone.js';

/**
 * Scheduled monthly auto-create (Auto Scheduling completion mission,
 * 2026-09-04). Primary mode of the Auto Scheduling capability: for every
 * location that has opted in (`workforce.schedule_settings.auto_create_enabled`),
 * on the Manager-configured day of month, generates a REVIEW-PENDING
 * proposal (`published: false`) for the NEXT calendar month -- never
 * auto-published, never sent via LINE. The Manager's existing manual
 * "auto-create schedule" flow (`apps/web`'s `runAutoDistribution` Server
 * Action) and this job call the exact same distribution engine
 * (`autoDistribute()` + `buildAuthoritativeStaffingRequirements()`, both
 * from `@line-os/workforce`) -- there is exactly one implementation of the
 * scheduling algorithm; only the data-fetch/write plumbing differs, because
 * this job runs as a service-role worker with no authenticated tenant
 * context (see "Tenant/location isolation" below).
 *
 * Tenant/location isolation: `service_role` bypasses RLS entirely, so this
 * job explicitly scopes every query to one `(tenant_id, location_id)` pair
 * at a time -- it never relies on RLS to keep one location's data out of
 * another's run.
 *
 * Idempotency: `workforce.schedule_settings.auto_create_last_generated_month`
 * (migration 0114) is the persisted marker. It is set to the target month's
 * first-of-month date only after a real engine run completes (not on a
 * config error, so a Manager who fixes a config problem later the same day
 * still gets picked up on the job's next tick). A location already marked
 * for the target month is skipped outright -- safe to run this job's tick
 * more than once on the trigger day (retry, restart, overlapping cron).
 */

interface ScheduleSettingsRow {
  tenant_id: string;
  location_id: string;
  required_headcount_by_weekday: number[];
  max_monthly_hours: number;
  auto_create_day_of_month: number;
  auto_create_last_generated_month: string | null;
}

export interface AutoScheduleMonthlyRunSummary {
  locationId: string;
  tenantId: string;
  targetMonth: string;
  created: number;
  shortages: number;
  unplaced: number;
  assignedWithoutPreference: number;
}

/** Runs the scheduled monthly auto-create check for every opted-in location. Returns one summary entry per location that actually generated a proposal this tick (skipped/ineligible locations are omitted). */
export async function runAutoScheduleMonthly(): Promise<AutoScheduleMonthlyRunSummary[]> {
  const db = createServiceClient();
  const summaries: AutoScheduleMonthlyRunSummary[] = [];

  const { data: settingsRows, error: settingsError } = await db
    .schema('workforce')
    .from('schedule_settings')
    .select(
      'tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours, auto_create_day_of_month, auto_create_last_generated_month',
    )
    .eq('auto_create_enabled', true);
  if (settingsError) throw settingsError;

  for (const row of (settingsRows ?? []) as ScheduleSettingsRow[]) {
    const summary = await runForLocation(db, row);
    if (summary) summaries.push(summary);
  }

  return summaries;
}

async function runForLocation(
  db: ReturnType<typeof createServiceClient>,
  settings: ScheduleSettingsRow,
): Promise<AutoScheduleMonthlyRunSummary | null> {
  const { tenant_id: tenantId, location_id: locationId } = settings;

  // Module gate: fail closed if Workforce isn't enabled for this tenant (or
  // the row is missing entirely) -- the same posture every other
  // module-gated surface in this codebase takes.
  const { data: moduleRow } = await db
    .schema('core')
    .from('tenant_modules')
    .select('is_enabled')
    .eq('tenant_id', tenantId)
    .eq('module', 'workforce')
    .maybeSingle();
  if (!moduleRow?.is_enabled) return null;

  const { data: location } = await db
    .schema('core')
    .from('locations')
    .select('id, timezone, is_active')
    .eq('id', locationId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!location || !location.is_active) return null;
  const timeZone = location.timezone as string;

  const today = todayIsoInTimeZone(timeZone);
  const todayDayOfMonth = Number(today.slice(8, 10));
  if (todayDayOfMonth !== settings.auto_create_day_of_month) return null;

  const target = nextMonthPeriod(today);
  if (settings.auto_create_last_generated_month === target.periodStart) return null; // already generated this month (idempotent re-tick)

  const monthFromIso = localDateTimeToUtcIso(target.periodStart, '00:00', timeZone);
  const monthToIsoExclusive = localDateTimeToUtcIso(addIsoDays(target.periodEnd, 1), '00:00', timeZone);

  const [staffResult, shiftTypesResult, preferencesResult, existingResult] = await Promise.all([
    db
      .schema('api')
      .from('workforce_staff_directory')
      .select('staff_id, tenant_id, location_id, is_active')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId),
    db
      .schema('api')
      .from('workforce_shift_types')
      .select('shift_type_id, tenant_id, location_id, code, starts_at_local, ends_at_local, break_minutes, sort_order, is_active')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId),
    db
      .schema('api')
      .from('workforce_shift_requests')
      .select('employee_id, work_date, shift_type_id, is_unavailable, kind')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .eq('kind', 'preference')
      .gte('work_date', target.periodStart)
      .lte('work_date', target.periodEnd),
    db
      .schema('api')
      .from('workforce_shift_assignments')
      .select('employee_id, shift_type_id, starts_at, ends_at, break_minutes, published, location_id')
      .eq('tenant_id', tenantId)
      .eq('location_id', locationId)
      .gte('starts_at', monthFromIso)
      .lt('starts_at', monthToIsoExclusive),
  ]);
  if (staffResult.error) throw staffResult.error;
  if (shiftTypesResult.error) throw shiftTypesResult.error;
  if (preferencesResult.error) throw preferencesResult.error;
  if (existingResult.error) throw existingResult.error;

  const activeShiftTypeIds = (shiftTypesResult.data ?? [])
    .filter((st) => st.is_active)
    .map((st) => st.shift_type_id as string);
  if (activeShiftTypeIds.length === 0) return null; // config problem -- do not mark as generated, retry on the next tick

  const staffingRequirements = buildAuthoritativeStaffingRequirements(activeShiftTypeIds, settings.required_headcount_by_weekday);
  if (!hasPositiveStaffingRequirement(staffingRequirements)) return null; // config problem -- do not mark as generated

  const employees: AutoDistributeEmployee[] = (staffResult.data ?? []).map((s) => ({
    employeeId: s.staff_id as string,
    isActive: s.is_active as boolean,
  }));

  const shiftTypes: AutoDistributeShiftType[] = (shiftTypesResult.data ?? []).map((st) => ({
    shiftTypeId: st.shift_type_id as string,
    code: st.code as string,
    startsAtLocal: (st.starts_at_local as string).slice(0, 5),
    endsAtLocal: (st.ends_at_local as string).slice(0, 5),
    breakMinutes: st.break_minutes as number,
    sortOrder: st.sort_order as number,
    isActive: st.is_active as boolean,
  }));

  const preferences: AutoDistributePreference[] = (preferencesResult.data ?? []).map((r) => ({
    employeeId: r.employee_id as string,
    workDate: r.work_date as string,
    shiftTypeId: r.shift_type_id as string | null,
    isUnavailable: r.is_unavailable as boolean,
  }));

  // The target month is always entirely in the future (it is next calendar
  // month, computed from today), so a manually pre-created shift is the
  // ONLY kind of "existing assignment" this run can ever see -- never a
  // past/worked shift. Those are preserved exactly like the manual path
  // preserves published/manual shifts; there is nothing to clear first
  // (unlike a re-run, this is always this location's FIRST scheduled
  // attempt at this target month, guarded by the idempotency marker above).
  const existingAssignments: AutoDistributeExistingAssignment[] = (existingResult.data ?? [])
    .filter((a) => a.location_id === locationId)
    .map((a) => {
      const startLocal = utcIsoToLocalDateTime(a.starts_at as string, timeZone);
      const endLocal = utcIsoToLocalDateTime(a.ends_at as string, timeZone);
      if (!a.employee_id) return null;
      return {
        employeeId: a.employee_id as string,
        workDate: startLocal.workDate,
        shiftTypeId: a.shift_type_id as string | null,
        startsAtLocal: startLocal.localTime,
        endsAtLocal: endLocal.localTime,
        breakMinutes: a.break_minutes as number,
        published: a.published as boolean,
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
      maxPeriodHours: settings.max_monthly_hours,
      extraHoursByEmployee: {}, // the whole cap window IS this run's period -- nothing accrues outside it
      overwriteExisting: false,
    },
  });

  if (result.draftAssignments.length > 0) {
    const insertRows = result.draftAssignments.map((draft) => ({
      tenant_id: tenantId,
      location_id: locationId,
      employee_id: draft.employeeId,
      shift_type_id: draft.shiftTypeId,
      starts_at: localDateTimeToUtcIso(draft.workDate, draft.startsAtLocal, timeZone),
      ends_at: localDateTimeToUtcIso(draft.workDate, draft.endsAtLocal, timeZone),
      break_minutes: draft.breakMinutes,
      published: false, // review-pending proposal -- never auto-published, never queued to LINE
    }));
    const { error: insertError } = await db.schema('api').from('workforce_shift_assignments').insert(insertRows);
    if (insertError) throw insertError;
  }

  // Mark this location generated for the target month -- ONLY on a real
  // engine run (reached this point past both config-error early returns
  // above), regardless of whether it produced any draft rows (e.g. already
  // fully staffed by manual assignments is still a legitimate, complete
  // outcome, not a config problem to retry).
  //
  // Optimistic lock: the read-then-write between the top-level idempotency
  // check (line ~116) and this write is not atomic, so two overlapping
  // ticks for the same location could both pass that check before either
  // writes the marker. Conditioning the UPDATE on the marker still holding
  // the value it held when this run started closes that window -- a
  // concurrent winner's write makes this one affect 0 rows, which is
  // treated as "already claimed by another run" rather than an error. Worst
  // case without this would only ever be a duplicate DRAFT insert (never a
  // publish or notification) for a Manager to notice on review; this closes
  // it anyway since it's a small, safe, well-scoped condition.
  let markQuery = db
    .schema('workforce')
    .from('schedule_settings')
    .update({ auto_create_last_generated_month: target.periodStart })
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId);
  // `.eq(col, null)` is NOT the same as `IS NULL` in PostgREST -- it must be
  // `.is(...)` for the "never run before" case, or the lock condition would
  // never match on a location's very first scheduled run.
  markQuery =
    settings.auto_create_last_generated_month === null
      ? markQuery.is('auto_create_last_generated_month', null)
      : markQuery.eq('auto_create_last_generated_month', settings.auto_create_last_generated_month);
  const { data: markedRows, error: markError } = await markQuery.select('tenant_id');
  if (markError) throw markError;
  if (!markedRows || markedRows.length === 0) return null; // lost the race to a concurrent run -- its own result already accounts for this month

  return {
    locationId,
    tenantId,
    targetMonth: target.monthPrefix,
    created: result.draftAssignments.length,
    shortages: result.shortages.length,
    unplaced: result.unplaced.length,
    assignedWithoutPreference: result.assignedWithoutPreference.length,
  };
}
