import {
  parseLocalTime,
  parseOptionalIsoDate,
  parseOptionalLocalTime,
  parseRecurrenceKind,
  parseUuid,
  parseWeekdays,
  type OperationsRecurrenceKind,
} from './validation';

/** `FormData` -> typed-input parsers for the Operations scheduling Server Actions, kept out of the `'use server'` module so they stay synchronous and unit-testable, mirroring `templates-input.ts`'s convention. Every parser returns `null` on any malformed input -- fail closed. */

export interface CreateScheduleInput {
  locationId: string;
  templateId: string;
  recurrenceKind: OperationsRecurrenceKind;
  dueTime: string;
  weekdays: number[] | null;
  windowEndTime: string | null;
  effectiveFrom: string | null;
}

export function parseCreateScheduleInput(formData: FormData): CreateScheduleInput | null {
  const locationId = parseUuid(formData.get('locationId'));
  if (locationId === null) return null;
  const templateId = parseUuid(formData.get('templateId'));
  if (templateId === null) return null;
  const recurrenceKind = parseRecurrenceKind(formData.get('recurrenceKind'));
  if (recurrenceKind === null) return null;
  const dueTime = parseLocalTime(formData.get('dueTime'));
  if (dueTime === null) return null;
  const weekdays = parseWeekdays(formData.getAll('weekdays'), recurrenceKind === 'weekdays');
  if (weekdays === undefined) return null;
  const windowEndTime = parseOptionalLocalTime(formData.get('windowEndTime'));
  if (windowEndTime === undefined) return null;
  const effectiveFrom = parseOptionalIsoDate(formData.get('effectiveFrom'));
  if (effectiveFrom === undefined) return null;
  return { locationId, templateId, recurrenceKind, dueTime, weekdays, windowEndTime, effectiveFrom };
}

export interface ReviseScheduleInput {
  scheduleId: string;
  recurrenceKind: OperationsRecurrenceKind;
  weekdays: number[] | null;
  dueTime: string | null;
  windowEndTime: string | null;
  effectiveFrom: string | null;
}

export function parseReviseScheduleInput(formData: FormData): ReviseScheduleInput | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  const recurrenceKind = parseRecurrenceKind(formData.get('recurrenceKind'));
  if (recurrenceKind === null) return null;
  const dueTime = parseOptionalLocalTime(formData.get('dueTime'));
  if (dueTime === undefined) return null;
  const weekdays = parseWeekdays(formData.getAll('weekdays'), recurrenceKind === 'weekdays');
  if (weekdays === undefined) return null;
  const windowEndTime = parseOptionalLocalTime(formData.get('windowEndTime'));
  if (windowEndTime === undefined) return null;
  const effectiveFrom = parseOptionalIsoDate(formData.get('effectiveFrom'));
  if (effectiveFrom === undefined) return null;
  return { scheduleId, recurrenceKind, weekdays, dueTime, windowEndTime, effectiveFrom };
}

export interface DeactivateScheduleInput {
  scheduleId: string;
  effectiveTo: string | null;
}

export function parseDeactivateScheduleInput(formData: FormData): DeactivateScheduleInput | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  const effectiveTo = parseOptionalIsoDate(formData.get('effectiveTo'));
  if (effectiveTo === undefined) return null;
  return { scheduleId, effectiveTo };
}

export function parseCancelScheduledRevisionInput(formData: FormData): { scheduleId: string } | null {
  const scheduleId = parseUuid(formData.get('scheduleId'));
  if (scheduleId === null) return null;
  return { scheduleId };
}
