import { parseIsoDate, parseLocalTime, parseNonNegativeInt, parseOptionalTrimmedString, parseUuid } from './validation';
import type { ShiftRequestDecision } from './shift-requests';

const DAILY_MESSAGE_MAX_LENGTH = 500;
const CORRECTION_DETAILS_MAX_LENGTH = 500;
/** Sanity cap on transportation cost (tenant's local currency minor-unit-free integer, e.g. yen) -- not a business limit. */
const MAX_TRANSPORTATION_COST = 1_000_000;
export const CLOCK_OUT_BREAK_MINUTE_OPTIONS = [0, 30, 60] as const;
export type ClockOutBreakMinutes = (typeof CLOCK_OUT_BREAK_MINUTE_OPTIONS)[number];

// ============================================================================
// submitWorkReport (FormData)
// ============================================================================

export interface SubmitWorkReportFormInput {
  workDate: string;
  /** Local `HH:MM` on `workDate`; the action layer resolves the tenant/location time zone to convert to a UTC instant. `undefined` = not reported (leave/clear on the DB side is the action's call). */
  clockInLocal: string | undefined;
  clockOutLocal: string | undefined;
  actualBreakMinutes: number | null;
  transportationCost: number | null;
  dailyMessage: string | null;
}

export function parseSubmitWorkReportInput(formData: FormData): SubmitWorkReportFormInput | null {
  const workDate = parseIsoDate(formData.get('workDate'));
  if (!workDate) return null;

  const rawClockIn = formData.get('clockInLocal');
  let clockInLocal: string | undefined;
  if (typeof rawClockIn === 'string' && rawClockIn.trim().length > 0) {
    clockInLocal = parseLocalTime(rawClockIn) ?? undefined;
    if (!clockInLocal) return null;
  }

  const rawClockOut = formData.get('clockOutLocal');
  let clockOutLocal: string | undefined;
  if (typeof rawClockOut === 'string' && rawClockOut.trim().length > 0) {
    clockOutLocal = parseLocalTime(rawClockOut) ?? undefined;
    if (!clockOutLocal) return null;
  }

  if (clockInLocal && clockOutLocal && clockOutLocal <= clockInLocal) return null;

  const rawTransportationCost = formData.get('transportationCost');
  let transportationCost: number | null = null;
  if (typeof rawTransportationCost === 'string' && rawTransportationCost.trim().length > 0) {
    transportationCost = parseNonNegativeInt(rawTransportationCost, MAX_TRANSPORTATION_COST);
    if (transportationCost === null) return null;
  }

  const dailyMessage = parseOptionalTrimmedString(formData.get('dailyMessage'), DAILY_MESSAGE_MAX_LENGTH);
  if (!dailyMessage.ok) return null;

  const rawActualBreakMinutes = formData.get('actualBreakMinutes');
  let actualBreakMinutes: number | null = null;
  if (typeof rawActualBreakMinutes === 'string' && rawActualBreakMinutes.trim().length > 0) {
    const parsed = parseNonNegativeInt(rawActualBreakMinutes, 480);
    if (parsed === null) return null;
    actualBreakMinutes = parsed;
  }

  return { workDate, clockInLocal, clockOutLocal, actualBreakMinutes, transportationCost, dailyMessage: dailyMessage.value };
}

// ============================================================================
// submitCorrectionRequest (FormData)
// ============================================================================

export interface SubmitCorrectionRequestFormInput {
  workDate: string;
  attendanceId: string | null;
  message: string | null;
}

export function parseSubmitCorrectionRequestInput(formData: FormData): SubmitCorrectionRequestFormInput | null {
  const workDate = parseIsoDate(formData.get('workDate'));
  if (!workDate) return null;

  const rawAttendanceId = formData.get('attendanceId');
  let attendanceId: string | null = null;
  if (typeof rawAttendanceId === 'string' && rawAttendanceId.trim().length > 0) {
    attendanceId = parseUuid(rawAttendanceId);
    if (!attendanceId) return null;
  }

  const message = parseOptionalTrimmedString(formData.get('message'), CORRECTION_DETAILS_MAX_LENGTH);
  if (!message.ok) return null;

  return { workDate, attendanceId, message: message.value };
}

// ============================================================================
// decideCorrectionRequest (FormData)
// ============================================================================

export interface DecideCorrectionRequestFormInput {
  requestId: string;
  decision: ShiftRequestDecision;
}

export function parseDecideCorrectionRequestInput(formData: FormData): DecideCorrectionRequestFormInput | null {
  const requestId = parseUuid(formData.get('requestId'));
  if (!requestId) return null;

  const rawDecision = formData.get('decision');
  if (rawDecision !== 'approved' && rawDecision !== 'rejected') return null;

  return { requestId, decision: rawDecision };
}
