import { parseBooleanFlag, parseOptionalTrimmedString, parseTrimmedString, parseUuid } from './validation';

const NAME_MAX_LENGTH = 120;
const POSITION_MAX_LENGTH = 60;
const EMPLOYMENT_TYPE_MAX_LENGTH = 40;
const PERSON_NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const NOTES_MAX_LENGTH = 1000;
/** Format-only bound. LINE user ids are ~33 chars ("U" + 32 hex), but this is never trusted as authentication -- only sized to reject obviously-wrong input. */
const LINE_USER_ID_MAX_LENGTH = 128;

export interface UpsertEmployeeFormInput {
  id: string | null;
  locationId: string;
  name: string;
  familyName: string;
  givenName: string;
  email: string;
  notes: string | null;
  positionLabel: string | null;
  employmentType: string | null;
  /** `undefined` on create (defaults to active at the DB layer); on edit, `undefined` means "leave unchanged". */
  isActive: boolean | undefined;
  hourlyWageYen: number | null;
}

/** `id` field absent/blank -> create; present -> edit that employee. */
export function parseUpsertEmployeeInput(formData: FormData): UpsertEmployeeFormInput | null {
  const rawId = formData.get('id');
  const id = typeof rawId === 'string' && rawId.trim().length > 0 ? parseUuid(rawId) : null;
  if (typeof rawId === 'string' && rawId.trim().length > 0 && id === null) return null; // malformed, non-blank id

  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return null;

  const name = parseTrimmedString(formData.get('name'), NAME_MAX_LENGTH);
  if (!name) return null;
  const familyName = parseTrimmedString(formData.get('familyName'), PERSON_NAME_MAX_LENGTH);
  const givenName = parseTrimmedString(formData.get('givenName'), PERSON_NAME_MAX_LENGTH);
  const email = parseTrimmedString(formData.get('email'), EMAIL_MAX_LENGTH)?.toLowerCase() ?? null;
  if (!familyName || !givenName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const notes = parseOptionalTrimmedString(formData.get('notes'), NOTES_MAX_LENGTH);
  if (!notes.ok) return null;

  const positionLabel = parseOptionalTrimmedString(formData.get('positionLabel'), POSITION_MAX_LENGTH);
  if (!positionLabel.ok) return null;

  const employmentType = parseOptionalTrimmedString(formData.get('employmentType'), EMPLOYMENT_TYPE_MAX_LENGTH);
  if (!employmentType.ok) return null;

  const hasActiveField = formData.has('isActive');
  const rawHourlyWage = formData.get('hourlyWageYen');
  const hourlyWageYen = rawHourlyWage === null || rawHourlyWage === '' ? null : Number(rawHourlyWage);
  if (hourlyWageYen !== null && (!Number.isInteger(hourlyWageYen) || hourlyWageYen < 0 || hourlyWageYen > 1_000_000)) return null;

  return {
    id,
    locationId,
    name,
    familyName,
    givenName,
    email,
    notes: notes.value,
    positionLabel: positionLabel.value,
    employmentType: employmentType.value,
    isActive: hasActiveField ? parseBooleanFlag(formData.get('isActive')) : undefined,
    hourlyWageYen,
  };
}

export interface SetEmployeeActiveFormInput {
  staffId: string;
  isActive: boolean;
}

export function parseSetEmployeeActiveInput(formData: FormData): SetEmployeeActiveFormInput | null {
  const staffId = parseUuid(formData.get('staffId'));
  if (!staffId) return null;
  return { staffId, isActive: parseBooleanFlag(formData.get('isActive')) };
}

export interface BindEmployeeLineUserFormInput {
  employeeId: string;
  rawLineUserId: string;
}

/**
 * `rawLineUserId` is format-only validated (non-empty, length-capped) --
 * NEVER treated as authentication. It is manager-entered data (e.g. copied
 * from the LINE Official Account admin panel), encrypted immediately by the
 * write helper, and used only as a lookup key for a later, separate LIFF
 * verification flow.
 */
export function parseBindEmployeeLineUserInput(formData: FormData): BindEmployeeLineUserFormInput | null {
  const employeeId = parseUuid(formData.get('employeeId'));
  if (!employeeId) return null;

  const rawLineUserId = parseTrimmedString(formData.get('rawLineUserId'), LINE_USER_ID_MAX_LENGTH);
  if (!rawLineUserId) return null;

  return { employeeId, rawLineUserId };
}

export interface UnbindEmployeeLineUserFormInput {
  employeeId: string;
}

export function parseUnbindEmployeeLineUserInput(formData: FormData): UnbindEmployeeLineUserFormInput | null {
  const employeeId = parseUuid(formData.get('employeeId'));
  if (!employeeId) return null;
  return { employeeId };
}
