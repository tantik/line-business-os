import { parseOptionalNumeric, parseOptionalTrimmedString, parseResponseType, parseUuid, type OperationsResponseType } from './validation';
import type { OperationsExceptionSeverity } from './tasks';

/** `FormData` -> typed-input parsers for the Operations Staff task-execution Server Actions, kept out of the `'use server'` module so they stay synchronous and unit-testable, mirroring `schedules-input.ts`'s convention. Every parser returns `null` on any malformed input -- fail closed. */

export interface RecordResponseFormInput {
  scheduleId: string;
  itemId: string;
  responseType: OperationsResponseType;
  responseBool: boolean | null;
  responseNumeric: number | null;
  responseText: string | null;
}

/** `responseType` decides which single field is read from `formData` -- the caller (client component) already knows the item's fixed `response_type` and sets it explicitly, matching exactly one of the RPC's three response params. */
export function parseRecordResponseInput(formData: FormData): RecordResponseFormInput | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  const itemId = parseUuid(formData.get('itemId'));
  if (itemId === null) return null;
  const responseType = parseResponseType(formData.get('responseType'));
  if (responseType === null) return null;

  if (responseType === 'boolean') {
    const raw = formData.get('responseBool');
    const value = typeof raw === 'string' ? raw : null;
    if (value !== 'true' && value !== 'false') return null;
    return { scheduleId, itemId, responseType, responseBool: value === 'true', responseNumeric: null, responseText: null };
  }
  if (responseType === 'numeric') {
    const value = parseOptionalNumeric(formData.get('responseNumeric'));
    if (value === undefined || value === null) return null;
    return { scheduleId, itemId, responseType, responseBool: null, responseNumeric: value, responseText: null };
  }
  const value = parseOptionalTrimmedString(formData.get('responseText'), 2000);
  if (value === undefined || value === null) return null;
  return { scheduleId, itemId, responseType, responseBool: null, responseNumeric: null, responseText: value };
}

export function parseCompleteTaskInput(formData: FormData): { scheduleId: string } | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  return { scheduleId };
}

export interface ReportProblemFormInput {
  scheduleId: string;
  itemId: string | null;
  note: string | null;
  severity: OperationsExceptionSeverity;
}

function parseSeverity(raw: unknown): OperationsExceptionSeverity | null {
  return raw === 'warning' || raw === 'action_required' ? raw : null;
}

export function parseReportProblemInput(formData: FormData): ReportProblemFormInput | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  const severity = parseSeverity(formData.get('severity'));
  if (severity === null) return null;
  const note = parseOptionalTrimmedString(formData.get('note'), 2000);
  if (note === undefined) return null;
  const rawItemId = formData.get('itemId');
  const rawItemIdStr = typeof rawItemId === 'string' ? rawItemId.trim() : '';
  let itemId: string | null = null;
  if (rawItemIdStr.length > 0) {
    itemId = parseUuid(rawItemIdStr);
    if (itemId === null) return null;
  }
  return { scheduleId, itemId, note, severity };
}
