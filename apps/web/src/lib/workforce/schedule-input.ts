import {
  parseBooleanFlag,
  parseIsoDate,
  parseLocalTime,
  parseNonNegativeInt,
  parseOptionalTrimmedString,
  parseUuid,
} from './validation';
import type { WindowCode } from './auto-distribute';

const ROLE_MAX_LENGTH = 60;
const NOTES_MAX_LENGTH = 500;
const MAX_BREAK_MINUTES = 480;
/** Sanity cap, not a business rule: 31 days * 24h. */
const MAX_PERIOD_HOURS_CAP = 744;
const MAX_REQUIRED_HEADCOUNT = 100;

// ============================================================================
// submitShiftPreference (FormData)
// ============================================================================

export interface SubmitShiftPreferenceFormInput {
  workDate: string;
  shiftTypeId: string | null;
  isUnavailable: boolean;
}

/** Requires at least one of {a chosen shift type, marked unavailable} -- a blank submission would just occupy the one-preference-per-day slot (INSERT-only, see shift-requests.ts) with no usable information. */
export function parseSubmitShiftPreferenceInput(formData: FormData): SubmitShiftPreferenceFormInput | null {
  const workDate = parseIsoDate(formData.get('workDate'));
  if (!workDate) return null;

  const rawShiftTypeId = formData.get('shiftTypeId');
  let shiftTypeId: string | null = null;
  if (typeof rawShiftTypeId === 'string' && rawShiftTypeId.trim().length > 0) {
    shiftTypeId = parseUuid(rawShiftTypeId);
    if (!shiftTypeId) return null;
  }

  const isUnavailable = parseBooleanFlag(formData.get('isUnavailable'));
  if (!isUnavailable && !shiftTypeId) return null;

  return { workDate, shiftTypeId, isUnavailable };
}

// ============================================================================
// updateShiftAssignment (FormData) -- full-replace edit, not a partial patch
// ============================================================================

export interface UpdateShiftAssignmentFormInput {
  assignmentId: string;
  /** The assignment's own (unchanged-by-this-form) location, needed to resolve the time zone for `startsAtLocal`/`endsAtLocal` conversion -- carried as a hidden field rather than re-read from the DB. */
  locationId: string;
  /** `null` = unassign (leave the shift slot open). */
  employeeId: string | null;
  shiftTypeId: string | null;
  workDate: string;
  startsAtLocal: string;
  endsAtLocal: string;
  breakMinutes: number;
  role: string | null;
  notes: string | null;
  published: boolean;
}

export function parseUpdateShiftAssignmentInput(formData: FormData): UpdateShiftAssignmentFormInput | null {
  const assignmentId = parseUuid(formData.get('assignmentId'));
  if (!assignmentId) return null;

  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const rawEmployeeId = formData.get('employeeId');
  let employeeId: string | null = null;
  if (typeof rawEmployeeId === 'string' && rawEmployeeId.trim().length > 0) {
    employeeId = parseUuid(rawEmployeeId);
    if (!employeeId) return null;
  }

  const rawShiftTypeId = formData.get('shiftTypeId');
  let shiftTypeId: string | null = null;
  if (typeof rawShiftTypeId === 'string' && rawShiftTypeId.trim().length > 0) {
    shiftTypeId = parseUuid(rawShiftTypeId);
    if (!shiftTypeId) return null;
  }

  const workDate = parseIsoDate(formData.get('workDate'));
  if (!workDate) return null;

  const startsAtLocal = parseLocalTime(formData.get('startsAtLocal'));
  const endsAtLocal = parseLocalTime(formData.get('endsAtLocal'));
  if (!startsAtLocal || !endsAtLocal || endsAtLocal <= startsAtLocal) return null;

  const rawBreakMinutes = formData.get('breakMinutes');
  const breakMinutes =
    rawBreakMinutes === null || rawBreakMinutes === '' ? 0 : parseNonNegativeInt(rawBreakMinutes, MAX_BREAK_MINUTES);
  if (breakMinutes === null) return null;

  const role = parseOptionalTrimmedString(formData.get('role'), ROLE_MAX_LENGTH);
  if (!role.ok) return null;

  const notes = parseOptionalTrimmedString(formData.get('notes'), NOTES_MAX_LENGTH);
  if (!notes.ok) return null;

  const published = parseBooleanFlag(formData.get('published'));

  return {
    assignmentId,
    locationId,
    employeeId,
    shiftTypeId,
    workDate,
    startsAtLocal,
    endsAtLocal,
    breakMinutes,
    role: role.value,
    notes: notes.value,
    published,
  };
}

// ============================================================================
// createShiftAssignment (FormData) -- new single-row assignment into a
// previously-empty grid cell, not an edit of an existing one. Mirrors
// UpdateShiftAssignmentFormInput minus assignmentId; employeeId is mandatory
// (non-null) since the whole point of this action is picking someone --
// unassigning has its own dedicated action (updateShiftAssignment with a
// blank employeeId).
// ============================================================================

export interface CreateShiftAssignmentFormInput {
  locationId: string;
  employeeId: string;
  shiftTypeId: string | null;
  workDate: string;
  startsAtLocal: string;
  endsAtLocal: string;
  breakMinutes: number;
  role: string | null;
  notes: string | null;
}

export function parseCreateShiftAssignmentInput(formData: FormData): CreateShiftAssignmentFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const employeeId = parseUuid(formData.get('employeeId'));
  if (!employeeId) return null;

  const rawShiftTypeId = formData.get('shiftTypeId');
  let shiftTypeId: string | null = null;
  if (typeof rawShiftTypeId === 'string' && rawShiftTypeId.trim().length > 0) {
    shiftTypeId = parseUuid(rawShiftTypeId);
    if (!shiftTypeId) return null;
  }

  const workDate = parseIsoDate(formData.get('workDate'));
  if (!workDate) return null;

  const startsAtLocal = parseLocalTime(formData.get('startsAtLocal'));
  const endsAtLocal = parseLocalTime(formData.get('endsAtLocal'));
  if (!startsAtLocal || !endsAtLocal || endsAtLocal <= startsAtLocal) return null;

  const rawBreakMinutes = formData.get('breakMinutes');
  const breakMinutes =
    rawBreakMinutes === null || rawBreakMinutes === '' ? 0 : parseNonNegativeInt(rawBreakMinutes, MAX_BREAK_MINUTES);
  if (breakMinutes === null) return null;

  const role = parseOptionalTrimmedString(formData.get('role'), ROLE_MAX_LENGTH);
  if (!role.ok) return null;

  const notes = parseOptionalTrimmedString(formData.get('notes'), NOTES_MAX_LENGTH);
  if (!notes.ok) return null;

  return {
    locationId,
    employeeId,
    shiftTypeId,
    workDate,
    startsAtLocal,
    endsAtLocal,
    breakMinutes,
    role: role.value,
    notes: notes.value,
  };
}

// ============================================================================
// publishSchedule (FormData)
// ============================================================================

export interface PublishScheduleFormInput {
  locationId: string;
  periodStart: string;
  periodEnd: string;
}

export function parsePublishScheduleInput(formData: FormData): PublishScheduleFormInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const periodStart = parseIsoDate(formData.get('periodStart'));
  const periodEnd = parseIsoDate(formData.get('periodEnd'));
  if (!periodStart || !periodEnd || periodEnd < periodStart) return null;

  return { locationId, periodStart, periodEnd };
}

// ============================================================================
// runAutoDistribution -- plain object input, NOT FormData
// ----------------------------------------------------------------------------
// staffingRequirements is array-shaped and there is no DB table for it in
// this slice (a direct, validated action argument each time -- see the
// accepted Slice 1C plan §5/§8); a <form> post can't naturally carry a
// variable-length array of {weekday|workDate, windowCode, requiredHeadcount}
// rows, so this action takes a plain JSON-serializable object instead of
// FormData, same as any other Next.js Server Action argument.
// ============================================================================

const WINDOW_CODES: ReadonlySet<string> = new Set(['ALL', 'AM', 'PM', 'A-P', 'SHORT_AM']);

export interface RunAutoDistributionRequirementInput {
  weekday?: number;
  workDate?: string;
  windowCode: WindowCode;
  requiredHeadcount: number;
}

export interface RunAutoDistributionActionInput {
  locationId: string;
  periodStart: string;
  periodEnd: string;
  staffingRequirements: RunAutoDistributionRequirementInput[];
  maxPeriodHours?: number;
  overwriteExisting: boolean;
}

function parseStaffingRequirement(raw: unknown): RunAutoDistributionRequirementInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const windowCodeRaw = obj.windowCode;
  if (typeof windowCodeRaw !== 'string') return null;
  const windowCode = windowCodeRaw.toUpperCase();
  if (!WINDOW_CODES.has(windowCode)) return null;

  const requiredHeadcount = parseNonNegativeInt(obj.requiredHeadcount, MAX_REQUIRED_HEADCOUNT);
  if (requiredHeadcount === null) return null;

  const hasWeekday = obj.weekday !== undefined;
  const hasWorkDate = obj.workDate !== undefined;
  if (!hasWeekday && !hasWorkDate) return null; // at least one of weekday/workDate must anchor this rule

  let weekday: number | undefined;
  if (hasWeekday) {
    const n = parseNonNegativeInt(obj.weekday, 6);
    if (n === null) return null;
    weekday = n;
  }

  let workDate: string | undefined;
  if (hasWorkDate) {
    const parsed = parseIsoDate(obj.workDate);
    if (!parsed) return null;
    workDate = parsed;
  }

  return { weekday, workDate, windowCode: windowCode as WindowCode, requiredHeadcount };
}

export function parseRunAutoDistributionInput(raw: unknown): RunAutoDistributionActionInput | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const locationId = parseUuid(obj.locationId);
  if (!locationId) return null;

  const periodStart = parseIsoDate(obj.periodStart);
  const periodEnd = parseIsoDate(obj.periodEnd);
  if (!periodStart || !periodEnd || periodEnd < periodStart) return null;

  if (!Array.isArray(obj.staffingRequirements)) return null;
  const staffingRequirements: RunAutoDistributionRequirementInput[] = [];
  for (const item of obj.staffingRequirements) {
    const parsed = parseStaffingRequirement(item);
    if (!parsed) return null;
    staffingRequirements.push(parsed);
  }

  let maxPeriodHours: number | undefined;
  if (obj.maxPeriodHours !== undefined) {
    const n = parseNonNegativeInt(obj.maxPeriodHours, MAX_PERIOD_HOURS_CAP);
    if (n === null) return null;
    maxPeriodHours = n;
  }

  return {
    locationId,
    periodStart,
    periodEnd,
    staffingRequirements,
    maxPeriodHours,
    overwriteExisting: obj.overwriteExisting === true,
  };
}
