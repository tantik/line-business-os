/**
 * Cafe v0.1 auto-distribution algorithm (Slice 1B).
 *
 * Pure, deterministic, side-effect-free: given a snapshot of employees, shift
 * types, staff shift preferences, staffing requirements, and existing
 * assignments for a period, returns a set of DRAFT (`published: false`)
 * shift assignments plus shortage/unplaced/non-submitter reports.
 *
 * No Supabase client, no DB reads, no env reads, no `Math.random`/`Date.now`
 * dependence on "now". The caller (a later slice's Server Action) is
 * responsible for loading the input snapshot and persisting the output —
 * this module only computes the draft. Manager review/edit/publish is a
 * later slice; staff never see this draft pre-publish (enforced at the RLS
 * layer in Slice 1A, not here).
 */

export type IsoDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:MM, 24h, local to the shift

/** The five staffing-requirement windows this slice supports. CUSTOM shift types intentionally have no window and never compete for a windowed headcount slot. */
export type WindowCode = 'ALL' | 'AM' | 'PM' | 'A-P' | 'SHORT_AM';

export interface AutoDistributeEmployee {
  employeeId: string;
  isActive: boolean;
  /** Ascending tie-break order. Employees without one sort after every employee that has one. */
  displayOrder?: number;
}

export interface AutoDistributeShiftType {
  shiftTypeId: string;
  /** Free text, matching `workforce.shift_types.code` (not a DB enum). Normalized to a WindowCode via a fixed alias table; anything unrecognized (including `CUSTOM`) is treated as a non-windowed shift type. */
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
  /** Only meaningful when shiftTypeId resolves to a non-windowed (e.g. CUSTOM) shift type. */
  customStartsAtLocal?: LocalTime;
  customEndsAtLocal?: LocalTime;
}

export interface AutoDistributeStaffingRequirement {
  /** 0 = Sunday .. 6 = Saturday (native `Date#getUTCDay()` convention). Ignored when `workDate` is set. */
  weekday?: number;
  /** Exact-date override. Takes priority over a `weekday` rule for the same window on the same date. */
  workDate?: IsoDate;
  windowCode: WindowCode;
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
  /** Per-employee cap on total assigned hours across the whole period. */
  maxPeriodHours?: number;
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
  windowCode: WindowCode;
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
}

const KNOWN_WINDOW_CODES: readonly WindowCode[] = ['ALL', 'AM', 'PM', 'A-P', 'SHORT_AM'];

/** Normalizes a free-text shift_type.code to a known WindowCode, or null (non-windowed, e.g. CUSTOM). Case-insensitive; `KONS` is an accepted alias for `SHORT_AM` per the task brief ("SHORT_AM / Kons"). */
const WINDOW_CODE_ALIASES: Readonly<Record<string, WindowCode>> = {
  ALL: 'ALL',
  AM: 'AM',
  PM: 'PM',
  'A-P': 'A-P',
  SHORT_AM: 'SHORT_AM',
  KONS: 'SHORT_AM',
};

function resolveWindowCode(code: string): WindowCode | null {
  return WINDOW_CODE_ALIASES[code.toUpperCase()] ?? null;
}

function parseLocalTimeToMinutes(time: LocalTime): number {
  const parts = time.split(':');
  const hours = Number.parseInt(parts[0] ?? '0', 10);
  const minutes = Number.parseInt(parts[1] ?? '0', 10);
  return hours * 60 + minutes;
}

function computeDurationHours(startsAtLocal: LocalTime, endsAtLocal: LocalTime, breakMinutes: number): number {
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

  // Running per-employee hour totals across the whole period, seeded from
  // preserved assignments so fairness ranking (rule 6/7) and maxPeriodHours
  // (rule 8) both account for hours the algorithm didn't itself just assign.
  const hoursByEmployee = new Map<string, number>();
  for (const employee of activeEmployees) hoursByEmployee.set(employee.employeeId, 0);

  // One shift per employee per day: dates already covered by a preserved
  // assignment are off-limits to the fill loops below.
  const assignedDateByEmployee = new Map<string, Set<IsoDate>>();
  for (const employee of activeEmployees) assignedDateByEmployee.set(employee.employeeId, new Set());

  // Preserved headcount already occupying each (date, windowCode) slot, so
  // the fill loops only need to cover the remainder of requiredHeadcount.
  const preservedHeadcountByDateWindow = new Map<string, number>();

  for (const preserved of preservedByKey.values()) {
    const hours = computeDurationHours(preserved.startsAtLocal, preserved.endsAtLocal, preserved.breakMinutes);
    hoursByEmployee.set(preserved.employeeId, (hoursByEmployee.get(preserved.employeeId) ?? 0) + hours);
    assignedDateByEmployee.get(preserved.employeeId)?.add(preserved.workDate);

    const shiftType = preserved.shiftTypeId ? shiftTypeById.get(preserved.shiftTypeId) : undefined;
    const windowCode = shiftType ? resolveWindowCode(shiftType.code) : null;
    if (!windowCode) continue;
    const key = `${preserved.workDate}|${windowCode}`;
    preservedHeadcountByDateWindow.set(key, (preservedHeadcountByDateWindow.get(key) ?? 0) + 1);
  }

  const draftAssignments: DraftAssignment[] = [];
  const shortages: Shortage[] = [];
  const unplaced: UnplacedEmployee[] = [];

  for (const date of periodDates) {
    const weekday = weekdayOfIsoDate(date);

    // Required headcount per window for this date: an exact workDate rule
    // overrides a weekday rule for the same window; later rows win among
    // rules of equal specificity (deterministic given deterministic input).
    const requiredByWindow = new Map<WindowCode, number>();
    const specificityByWindow = new Map<WindowCode, 'date' | 'weekday'>();
    for (const requirement of staffingRequirements) {
      const matchesDate = requirement.workDate !== undefined && requirement.workDate === date;
      const matchesWeekday =
        requirement.workDate === undefined && requirement.weekday !== undefined && requirement.weekday === weekday;
      if (!matchesDate && !matchesWeekday) continue;

      const specificity: 'date' | 'weekday' = matchesDate ? 'date' : 'weekday';
      const currentSpecificity = specificityByWindow.get(requirement.windowCode);
      if (currentSpecificity === 'date' && specificity === 'weekday') continue; // never downgrade an exact-date rule

      requiredByWindow.set(requirement.windowCode, requirement.requiredHeadcount);
      specificityByWindow.set(requirement.windowCode, specificity);
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

    const windowedByCode = new Map<WindowCode, ResolvedPreference[]>();
    const customCandidates: ResolvedPreference[] = [];
    for (const resolved of resolvedByEmployeeId.values()) {
      const windowCode = resolveWindowCode(resolved.shiftType.code);
      if (windowCode) {
        const list = windowedByCode.get(windowCode) ?? [];
        list.push(resolved);
        windowedByCode.set(windowCode, list);
      } else {
        customCandidates.push(resolved);
      }
    }

    // -- Windowed shift types: compete for requiredHeadcount, in tie-break order.
    for (const windowCode of KNOWN_WINDOW_CODES) {
      const required = requiredByWindow.get(windowCode) ?? 0;
      const preservedCount = preservedHeadcountByDateWindow.get(`${date}|${windowCode}`) ?? 0;

      const sorted = [...(windowedByCode.get(windowCode) ?? [])].sort((a, b) =>
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

        const hours = computeDurationHours(
          candidate.shiftType.startsAtLocal,
          candidate.shiftType.endsAtLocal,
          candidate.shiftType.breakMinutes,
        );
        const currentHours = hoursByEmployee.get(candidate.employeeId) ?? 0;
        if (options.maxPeriodHours !== undefined && currentHours + hours > options.maxPeriodHours) {
          unplaced.push({ employeeId: candidate.employeeId, workDate: date, reason: 'max_period_hours_exceeded' });
          continue;
        }

        draftAssignments.push({
          employeeId: candidate.employeeId,
          workDate: date,
          shiftTypeId: candidate.shiftType.shiftTypeId,
          startsAtLocal: candidate.shiftType.startsAtLocal,
          endsAtLocal: candidate.shiftType.endsAtLocal,
          breakMinutes: candidate.shiftType.breakMinutes,
          published: false,
          source: 'auto',
        });
        hoursByEmployee.set(candidate.employeeId, currentHours + hours);
        assignedDateByEmployee.get(candidate.employeeId)?.add(date);
        filled += 1;
      }

      if (filled < required) {
        shortages.push({
          workDate: date,
          windowCode,
          requiredHeadcount: required,
          assignedHeadcount: filled,
          shortage: required - filled,
        });
      }
    }

    // Rule 11: CUSTOM (or any unrecognized-code) preferences pass through
    // directly using the preference's own custom start/end -- no headcount
    // competition, since no staffing requirement window covers them.
    const sortedCustom = [...customCandidates].sort((a, b) =>
      compareCandidates(a.employeeId, b.employeeId, employeeById, hoursByEmployee),
    );
    for (const candidate of sortedCustom) {
      if (assignedDateByEmployee.get(candidate.employeeId)?.has(date)) {
        unplaced.push({ employeeId: candidate.employeeId, workDate: date, reason: 'already_assigned' });
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
    }
  }

  // Rule 12: stable, deterministic final ordering, independent of internal
  // construction order.
  draftAssignments.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));
  shortages.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.windowCode.localeCompare(b.windowCode));
  unplaced.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId));

  return { draftAssignments, shortages, unplaced, nonSubmitters };
}
