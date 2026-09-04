/**
 * Cafe v0.1 auto-distribution algorithm (Slice 1B; re-keyed to `shiftTypeId`
 * 2026-09-04 -- see the module-level fix note below).
 *
 * Pure, deterministic, side-effect-free: given a snapshot of employees, shift
 * types, staff shift preferences, staffing requirements, and existing
 * assignments for a period, returns a set of DRAFT (`published: false`)
 * shift assignments plus shortage/unplaced/non-submitter reports.
 *
 * No Supabase client, no DB reads, no env reads, no `Math.random`/`Date.now`
 * dependence on "now". The caller (a later slice's Server Action) is
 * responsible for loading the input snapshot and persisting the output --
 * this module only computes the draft. Manager review/edit/publish is a
 * later slice; staff never see this draft pre-publish (enforced at the RLS
 * layer in Slice 1A, not here).
 *
 * -- Re-keying fix (2026-09-04) --------------------------------------------
 * The original slice competed shift types for headcount through a small,
 * hardcoded `WindowCode` enum (`ALL`/`AM`/`PM`/`A-P`/`SHORT_AM`) derived from
 * a shift type's `code` via a fixed alias table. Every real Manager-created
 * shift type is persisted with `code: CUSTOM_<timestamp>` (see
 * `upsertWorkforceShiftType`), which never resolves to a `WindowCode` -- so
 * a tenant whose shift types are all Manager-created had ZERO windows, and
 * the whole staffing-requirement matrix was empty for them (`invalid_config:
 * no_active_windows`, the actual Preview bug). Requirements and shortages are
 * now keyed directly by `shiftTypeId` -- every active shift type at a
 * location, windowed-code or not, competes for its own per-weekday
 * headcount. This is a superset of the old behavior for any tenant whose
 * shift types happen to use a recognized code (AM/PM/etc): each one still
 * gets its own headcount row, just addressed by id instead of by code.
 * `WindowCode`/`resolveWindowCode`/`KNOWN_WINDOW_CODES`/
 * `deriveActiveScheduleWindowCodes` are kept (unused internally now) purely
 * for the `_client-preview` demo surface's own presentation-layer window
 * grouping, which is out of scope for this fix.
 */

export type IsoDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:MM, 24h, local to the shift

/** @deprecated Kept only for the `_client-preview` demo surface's own presentation-layer grouping. The engine itself no longer groups by window code -- see the module-level fix note above. */
export type WindowCode = 'ALL' | 'AM' | 'PM' | 'A-P' | 'SHORT_AM';

export interface AutoDistributeEmployee {
  employeeId: string;
  isActive: boolean;
  /** Ascending tie-break order. Employees without one sort after every employee that has one. */
  displayOrder?: number;
}

export interface AutoDistributeShiftType {
  shiftTypeId: string;
  /** Free text, matching `workforce.shift_types.code` (not a DB enum). No longer used by the engine to group/compete for headcount (see module-level fix note) -- retained on the shape for the `_client-preview` demo's own presentation-layer window grouping. */
  code: string;
  startsAtLocal: LocalTime;
  endsAtLocal: LocalTime;
  breakMinutes: number;
  sortOrder: number;
  isActive: boolean;
}

export interface AutoDistributePreference {
  employeeId: string;
  workDate: IsoDate;
  shiftTypeId: string | null;
  isUnavailable: boolean;
  /** Overrides the shift type's own start/end when present -- available for any shift type, not just CUSTOM ones. */
  customStartsAtLocal?: LocalTime;
  customEndsAtLocal?: LocalTime;
}

export interface AutoDistributeStaffingRequirement {
  /** 0 = Sunday .. 6 = Saturday (native `Date#getUTCDay()` convention). Ignored when `workDate` is set. */
  weekday?: number;
  /** Exact-date override. Takes priority over a `weekday` rule for the same shift type on the same date. */
  workDate?: IsoDate;
  /** The shift type this required headcount applies to. */
  shiftTypeId: string;
  requiredHeadcount: number;
}

export interface AutoDistributeExistingAssignment {
  employeeId: string;
  workDate: IsoDate;
  shiftTypeId: string | null;
  startsAtLocal: LocalTime;
  endsAtLocal: LocalTime;
  breakMinutes: number;
  published: boolean;
  /** Manager-locked cell. Always preserved, even when `overwriteExisting` is true. */
  locked?: boolean;
}

export interface AutoDistributeOptions {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /**
   * Per-employee cap on total assigned hours counted by this run. This is a
   * CALENDAR-MONTH cap in the product sense (see `extraHoursByEmployee`
   * below) -- the engine itself only ever sees one running total per
   * employee, seeded from `extraHoursByEmployee` plus any preserved
   * in-period hours, and never lets that total exceed this value.
   */
  maxPeriodHours?: number;
  /**
   * Hours an employee has already accrued elsewhere in the same calendar
   * month (published/manual shifts outside this run's period, or past
   * worked shifts) that must still count toward `maxPeriodHours`. The
   * caller (`schedule-actions.ts`) computes this from the full calendar
   * month, not just `[periodStart, periodEnd]`, so a regeneration of the
   * remainder of a month correctly respects hours already used earlier in
   * that same month. Employees absent from this map are assumed to have 0
   * pre-existing hours this month.
   */
  extraHoursByEmployee?: Readonly<Record<string, number>>;
  /** When false (default), published (and always locked) existing assignments are preserved untouched and never re-generated. */
  overwriteExisting?: boolean;
}

export interface AutoDistributeInput {
  employees: AutoDistributeEmployee[];
  shiftTypes: AutoDistributeShiftType[];
  preferences: AutoDistributePreference[];
  staffingRequirements: AutoDistributeStaffingRequirement[];
  existingAssignments: AutoDistributeExistingAssignment[];
  options: AutoDistributeOptions;
}

export interface DraftAssignment {
  employeeId: string;
  workDate: IsoDate;
  shiftTypeId: string | null;
  startsAtLocal: LocalTime;
  endsAtLocal: LocalTime;
  breakMinutes: number;
  published: false;
  source: 'auto';
}

export interface Shortage {
  workDate: IsoDate;
  shiftTypeId: string;
  requiredHeadcount: number;
  assignedHeadcount: number;
  shortage: number;
}

/** Why a specific submitted preference did not become a draft assignment. */
export type UnplacedReason =
  | 'headcount_filled'
  | 'no_staffing_requirement'
  | 'max_period_hours_exceeded'
  | 'already_assigned'
  | 'unknown_shift_type'
  | 'inactive_shift_type';

export interface UnplacedEmployee {
  employeeId: string;
  workDate: IsoDate;
  reason: UnplacedReason;
}

export interface NonSubmitter {
  employeeId: string;
}

export interface AutoDistributeResult {
  draftAssignments: DraftAssignment[];
  shortages: Shortage[];
  unplaced: UnplacedEmployee[];
  nonSubmitters: NonSubmitter[];
  /**
   * Per-assignment detail of every draft assignment made for an employee who
   * submitted NO preference row at all for that date (fallback placement,
   * used only when a required slot still has an unmet headcount after every
   * submitted preference has been honored). "No preference" is never treated
   * as an implicit unavailability -- only an explicit `isUnavailable`
   * preference (or an existing same-day assignment, inactive status, or the
   * monthly hour cap) excludes an employee from fallback placement. Ordered
   * the same way as `draftAssignments` (date, then employeeId).
   */
  assignedWithoutPreference: { employeeId: string; workDate: IsoDate; shiftTypeId: string }[];
}

export const KNOWN_WINDOW_CODES: readonly WindowCode[] = ['ALL', 'AM', 'PM', 'A-P', 'SHORT_AM'];

/** @deprecated Normalizes a free-text shift_type.code to a known WindowCode, or null. Not used by the engine anymore -- kept for the `_client-preview` demo's own presentation-layer grouping. */
const WINDOW_CODE_ALIASES: Readonly<Record<string, WindowCode>> = {
  ALL: 'ALL',
  AM: 'AM',
  PM: 'PM',
  'A-P': 'A-P',
  SHORT_AM: 'SHORT_AM',
  KONS: 'SHORT_AM',
};

/** @deprecated see module-level fix note. */
export function resolveWindowCode(code: string): WindowCode | null {
  return WINDOW_CODE_ALIASES[code.toUpperCase()] ?? null;
}

/**
 * @deprecated The engine itself no longer uses this (see module-level fix
 * note) -- kept only for the `_client-preview` demo surface's own
 * presentation-layer window grouping (`manager-view-model.ts`).
 */
export function deriveActiveScheduleWindowCodes(
  shiftTypes: readonly Pick<AutoDistributeShiftType, 'code' | 'isActive'>[],
): WindowCode[] {
  const resolved = new Set<WindowCode>();
  for (const shiftType of shiftTypes) {
    if (!shiftType.isActive) continue;
    const windowCode = resolveWindowCode(shiftType.code);
    if (windowCode) resolved.add(windowCode);
  }
  return KNOWN_WINDOW_CODES.filter((code) => resolved.has(code));
}

function parseLocalTimeToMinutes(time: LocalTime): number {
  const parts = time.split(':');
  const hours = Number.parseInt(parts[0] ?? '0', 10);
  const minutes = Number.parseInt(parts[1] ?? '0', 10);
  return hours * 60 + minutes;
}

/**
 * Net worked hours for a local start/end/break-minutes triple. Exported so
 * the caller (`schedule-actions.ts`) can compute an employee's
 * already-accrued hours elsewhere in the same calendar month (see
 * `AutoDistributeOptions.extraHoursByEmployee`) using the exact same
 * duration math the engine itself uses -- never a second, divergent
 * implementation.
 */
export function computeDurationHours(startsAtLocal: LocalTime, endsAtLocal: LocalTime, breakMinutes: number): number {
  const grossMinutes = Math.max(0, parseLocalTimeToMinutes(endsAtLocal) - parseLocalTimeToMinutes(startsAtLocal));
  const netMinutes = Math.max(0, grossMinutes - Math.max(0, breakMinutes));
  return netMinutes / 60;
}

/** Every ISO date from periodStart to periodEnd inclusive. UTC-anchored so it never drifts with the host machine's timezone. */
function listDatesInRange(periodStart: IsoDate, periodEnd: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  let cursor = new Date(`${periodStart}T00:00:00.000Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00.000Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  while (cursor <= end) {
    const iso = new Date(cursor).toISOString().slice(0, 10);
    dates.push(iso);
    cursor += dayMs;
  }
  return dates;
}

function weekdayOfIsoDate(date: IsoDate): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function assignmentKey(employeeId: string, workDate: IsoDate): string {
  return `${employeeId}|${workDate}`;
}

/** A submitted, actionable (not unavailable, not null shiftTypeId, known+active shift type) preference for one employee/date, with its shift type already resolved. */
interface ResolvedPreference {
  employeeId: string;
  shiftType: AutoDistributeShiftType;
  customStartsAtLocal?: LocalTime;
  customEndsAtLocal?: LocalTime;
}

/** Deterministic tie-break: fewer assigned hours first, then lower displayOrder (undefined sorts last), then employeeId. */
function compareCandidates(
  aEmployeeId: string,
  bEmployeeId: string,
  employeeById: Map<string, AutoDistributeEmployee>,
  hoursByEmployee: Map<string, number>,
): number {
  const aHours = hoursByEmployee.get(aEmployeeId) ?? 0;
  const bHours = hoursByEmployee.get(bEmployeeId) ?? 0;
  if (aHours !== bHours) return aHours - bHours;

  const aOrder = employeeById.get(aEmployeeId)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = employeeById.get(bEmployeeId)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  return aEmployeeId.localeCompare(bEmployeeId);
}

export function autoDistribute(input: AutoDistributeInput): AutoDistributeResult {
  const { employees, shiftTypes, preferences, staffingRequirements, existingAssignments, options } = input;
  const overwriteExisting = options.overwriteExisting ?? false;

  // Rule 2: inactive employees are ignored entirely, everywhere.
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.employeeId));
  const employeeById = new Map(activeEmployees.map((employee) => [employee.employeeId, employee]));

  // Two lookups: `shiftTypeByIdAll` (every shift type, active or not) so an
  // unknown-vs-inactive shiftTypeId reference can be told apart, and
  // `shiftTypeById` (active only) for everything that actually builds a
  // draft assignment or counts toward preserved headcount.
  const shiftTypeByIdAll = new Map(shiftTypes.map((shiftType) => [shiftType.shiftTypeId, shiftType]));
  const shiftTypeById = new Map(
    shiftTypes.filter((shiftType) => shiftType.isActive).map((shiftType) => [shiftType.shiftTypeId, shiftType]),
  );
  const activeShiftTypesSorted = Array.from(shiftTypeById.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.shiftTypeId.localeCompare(b.shiftTypeId),
  );

  const periodDates = listDatesInRange(options.periodStart, options.periodEnd);
  const periodDateSet = new Set(periodDates);

  // Preferences, restricted to active employees + in-period dates. Deduped by
  // employeeId/workDate (last row in input order wins) for determinism if the
  // caller ever passes a duplicate.
  const preferenceByKey = new Map<string, AutoDistributePreference>();
  for (const preference of preferences) {
    if (!activeEmployeeIds.has(preference.employeeId)) continue;
    if (!periodDateSet.has(preference.workDate)) continue;
    preferenceByKey.set(assignmentKey(preference.employeeId, preference.workDate), preference);
  }

  // Rule 4: employees with zero preference rows anywhere in the period are
  // never guessed -- reported as nonSubmitters instead of being scheduled.
  const submittedEmployeeIds = new Set(
    Array.from(preferenceByKey.values()).map((preference) => preference.employeeId),
  );
  const nonSubmitters: NonSubmitter[] = activeEmployees
    .filter((employee) => !submittedEmployeeIds.has(employee.employeeId))
    .map((employee) => ({ employeeId: employee.employeeId }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  // Rule 5/6: a published (or ever locked) existing assignment is preserved
  // and never regenerated, unless overwriteExisting is true (locked always
  // wins regardless of overwriteExisting).
  const preservedByKey = new Map<string, AutoDistributeExistingAssignment>();
  for (const existing of existingAssignments) {
    if (!activeEmployeeIds.has(existing.employeeId)) continue;
    if (!periodDateSet.has(existing.workDate)) continue;
    const preserve = existing.locked === true || (existing.published && !overwriteExisting);
    if (!preserve) continue;
    preservedByKey.set(assignmentKey(existing.employeeId, existing.workDate), existing);
  }

  // Running per-employee hour totals, seeded from `extraHoursByEmployee`
  // (hours already accrued elsewhere in the same calendar month -- see
  // `AutoDistributeOptions.extraHoursByEmployee`) plus preserved assignments,
  // so fairness ranking (rule 6/7) and maxPeriodHours (rule 8) both account
  // for hours the algorithm didn't itself just assign.
  const hoursByEmployee = new Map<string, number>();
  for (const employee of activeEmployees) {
    hoursByEmployee.set(employee.employeeId, options.extraHoursByEmployee?.[employee.employeeId] ?? 0);
  }

  // One shift per employee per day: dates already covered by a preserved
  // assignment are off-limits to the fill loops below.
  const assignedDateByEmployee = new Map<string, Set<IsoDate>>();
  for (const employee of activeEmployees) assignedDateByEmployee.set(employee.employeeId, new Set());

  // Preserved headcount already occupying each (date, shiftTypeId) slot, so
  // the fill loop only needs to cover the remainder of requiredHeadcount.
  const preservedHeadcountByDateShiftType = new Map<string, number>();

  for (const preserved of preservedByKey.values()) {
    const hours = computeDurationHours(preserved.startsAtLocal, preserved.endsAtLocal, preserved.breakMinutes);
    hoursByEmployee.set(preserved.employeeId, (hoursByEmployee.get(preserved.employeeId) ?? 0) + hours);
    assignedDateByEmployee.get(preserved.employeeId)?.add(preserved.workDate);

    if (!preserved.shiftTypeId || !shiftTypeById.has(preserved.shiftTypeId)) continue;
    const key = `${preserved.workDate}|${preserved.shiftTypeId}`;
    preservedHeadcountByDateShiftType.set(key, (preservedHeadcountByDateShiftType.get(key) ?? 0) + 1);
  }

  const draftAssignments: DraftAssignment[] = [];
  const shortages: Shortage[] = [];
  const unplaced: UnplacedEmployee[] = [];
  const assignedWithoutPreference: { employeeId: string; workDate: IsoDate; shiftTypeId: string }[] = [];

  for (const date of periodDates) {
    const weekday = weekdayOfIsoDate(date);

    // Required headcount per shift type for this date: an exact workDate
    // rule overrides a weekday rule for the same shift type on the same
    // date; later rows win among rules of equal specificity (deterministic
    // given deterministic input).
    const requiredByShiftType = new Map<string, number>();
    const specificityByShiftType = new Map<string, 'date' | 'weekday'>();
    for (const requirement of staffingRequirements) {
      const matchesDate = requirement.workDate !== undefined && requirement.workDate === date;
      const matchesWeekday =
        requirement.workDate === undefined && requirement.weekday !== undefined && requirement.weekday === weekday;
      if (!matchesDate && !matchesWeekday) continue;

      const specificity: 'date' | 'weekday' = matchesDate ? 'date' : 'weekday';
      const currentSpecificity = specificityByShiftType.get(requirement.shiftTypeId);
      if (currentSpecificity === 'date' && specificity === 'weekday') continue; // never downgrade an exact-date rule

      requiredByShiftType.set(requirement.shiftTypeId, requirement.requiredHeadcount);
      specificityByShiftType.set(requirement.shiftTypeId, specificity);
    }

    // Rule 3: isUnavailable is a hard exclusion, not an "unplaced" outcome.
    // A null shiftTypeId (no concrete choice) is likewise never guessed into
    // a specific shift -- it simply yields no candidate for this date. A
    // non-null shiftTypeId that doesn't resolve to a known, active shift
    // type is a real data problem, though -- it must be surfaced in
    // `unplaced` (never silently dropped, never crash, never a draft).
    const resolvedByEmployeeId = new Map<string, ResolvedPreference>();
    for (const employee of activeEmployees) {
      const preference = preferenceByKey.get(assignmentKey(employee.employeeId, date));
      if (!preference || preference.isUnavailable || preference.shiftTypeId === null) continue;

      const shiftType = shiftTypeById.get(preference.shiftTypeId);
      if (shiftType) {
        resolvedByEmployeeId.set(employee.employeeId, {
          employeeId: employee.employeeId,
          shiftType,
          customStartsAtLocal: preference.customStartsAtLocal,
          customEndsAtLocal: preference.customEndsAtLocal,
        });
        continue;
      }

      const knownShiftType = shiftTypeByIdAll.get(preference.shiftTypeId);
      unplaced.push({
        employeeId: employee.employeeId,
        workDate: date,
        reason: knownShiftType ? 'inactive_shift_type' : 'unknown_shift_type',
      });
    }

    const candidatesByShiftTypeId = new Map<string, ResolvedPreference[]>();
    for (const resolved of resolvedByEmployeeId.values()) {
      const list = candidatesByShiftTypeId.get(resolved.shiftType.shiftTypeId) ?? [];
      list.push(resolved);
      candidatesByShiftTypeId.set(resolved.shiftType.shiftTypeId, list);
    }

    // -- Every active shift type at this location competes for its own
    // per-weekday/per-date required headcount, keyed by shiftTypeId (not by
    // a hardcoded window-code alias -- see module-level fix note).
    for (const shiftType of activeShiftTypesSorted) {
      const required = requiredByShiftType.get(shiftType.shiftTypeId) ?? 0;
      const preservedCount = preservedHeadcountByDateShiftType.get(`${date}|${shiftType.shiftTypeId}`) ?? 0;

      const sorted = [...(candidatesByShiftTypeId.get(shiftType.shiftTypeId) ?? [])].sort((a, b) =>
        compareCandidates(a.employeeId, b.employeeId, employeeById, hoursByEmployee),
      );

      let filled = preservedCount;
      for (const candidate of sorted) {
        if (assignedDateByEmployee.get(candidate.employeeId)?.has(date)) {
          unplaced.push({ employeeId: candidate.employeeId, workDate: date, reason: 'already_assigned' });
          continue;
        }
        if (filled >= required) {
          unplaced.push({
            employeeId: candidate.employeeId,
            workDate: date,
            reason: required === 0 ? 'no_staffing_requirement' : 'headcount_filled',
          });
          continue;
        }

        const startsAtLocal = candidate.customStartsAtLocal ?? candidate.shiftType.startsAtLocal;
        const endsAtLocal = candidate.customEndsAtLocal ?? candidate.shiftType.endsAtLocal;
        const hours = computeDurationHours(startsAtLocal, endsAtLocal, candidate.shiftType.breakMinutes);
        const currentHours = hoursByEmployee.get(candidate.employeeId) ?? 0;
        if (options.maxPeriodHours !== undefined && currentHours + hours > options.maxPeriodHours) {
          unplaced.push({ employeeId: candidate.employeeId, workDate: date, reason: 'max_period_hours_exceeded' });
          continue;
        }

        draftAssignments.push({
          employeeId: candidate.employeeId,
          workDate: date,
          shiftTypeId: candidate.shiftType.shiftTypeId,
          startsAtLocal,
          endsAtLocal,
          breakMinutes: candidate.shiftType.breakMinutes,
          published: false,
          source: 'auto',
        });
        hoursByEmployee.set(candidate.employeeId, currentHours + hours);
        assignedDateByEmployee.get(candidate.employeeId)?.add(date);
        filled += 1;
      }

      // Fallback: a required slot still short after every submitted
      // preference has been honored may be filled by an active employee who
      // submitted NO preference row for this date at all (never someone who
      // explicitly marked unavailable, is already assigned that day, or
      // would exceed the monthly hour cap). "No preference" is a fallback
      // candidate, not a guess at what they'd want -- always reported via
      // `assignedWithoutPreference` so a Manager can see exactly who was
      // placed this way.
      if (filled < required) {
        const fallbackCandidates = activeEmployees
          .filter((employee) => !preferenceByKey.has(assignmentKey(employee.employeeId, date)))
          .filter((employee) => !assignedDateByEmployee.get(employee.employeeId)?.has(date))
          .sort((a, b) => compareCandidates(a.employeeId, b.employeeId, employeeById, hoursByEmployee));

        for (const employee of fallbackCandidates) {
          if (filled >= required) break;

          const hours = computeDurationHours(shiftType.startsAtLocal, shiftType.endsAtLocal, shiftType.breakMinutes);
          const currentHours = hoursByEmployee.get(employee.employeeId) ?? 0;
          if (options.maxPeriodHours !== undefined && currentHours + hours > options.maxPeriodHours) continue;

          draftAssignments.push({
            employeeId: employee.employeeId,
            workDate: date,
            shiftTypeId: shiftType.shiftTypeId,
            startsAtLocal: shiftType.startsAtLocal,
            endsAtLocal: shiftType.endsAtLocal,
            breakMinutes: shiftType.breakMinutes,
            published: false,
            source: 'auto',
          });
          hoursByEmployee.set(employee.employeeId, currentHours + hours);
          assignedDateByEmployee.get(employee.employeeId)?.add(date);
          assignedWithoutPreference.push({ employeeId: employee.employeeId, workDate: date, shiftTypeId: shiftType.shiftTypeId });
          filled += 1;
        }
      }

      if (filled < required) {
        shortages.push({
          workDate: date,
          shiftTypeId: shiftType.shiftTypeId,
          requiredHeadcount: required,
          assignedHeadcount: filled,
          shortage: required - filled,
        });
      }
    }
  }

  // Rule 12: stable, deterministic final ordering, independent of internal
  // construction order.
  draftAssignments.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
  shortages.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.shiftTypeId.localeCompare(b.shiftTypeId));
  unplaced.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
  assignedWithoutPreference.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));

  return { draftAssignments, shortages, unplaced, nonSubmitters, assignedWithoutPreference };
}
