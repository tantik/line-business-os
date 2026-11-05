'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { requireLocationChoice } from '@/lib/tenant/active-location.server';
import { getWorkforceScheduleSettings, upsertWorkforceScheduleSettings, type WorkforceScheduleSettings } from './schedule-settings';
import {
  listWorkforceShiftTypes,
  permanentlyDeleteWorkforceShiftType,
  setWorkforceShiftTypeActive,
  upsertWorkforceShiftType,
  type WorkforceShiftType,
} from './shift-types';
import { parseLocalTime, parseTrimmedString, parseUuid } from './validation';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for the Manager dashboard's Settings section (WP A8):
 * per-weekday staffing requirements, max monthly hours, and shift-type CRUD.
 * Same shape/precedent as `preview/actions/settings-actions.ts` (this
 * mission's Surface A reference), but against the canonical service layer
 * and RLS-backed `requireTenantContext()`, not the preview auth stub. A
 * client-supplied `locationId` is never trusted on its own -- every action
 * re-verifies it is one of the caller's active stores of the resolved tenant
 * (`getActiveLocation` choices, DEBT-139 L2) before using it, same pattern as
 * `schedule-actions.ts`'s `runAutoDistribution`.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

async function resolveTenantAndLocation(locationIdRaw: unknown) {
  const locationId = parseUuid(locationIdRaw);
  if (!locationId) return { ok: false as const, result: INVALID_INPUT_RESULT };

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return { ok: false as const, result: tenantContext };

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  // DEBT-139 L2: the store must be one of the caller's active stores of this
  // request (`getActiveLocation` choices) -- narrowing only; RLS stays the boundary.
  const locationResult = await requireLocationChoice(tenantId, tenantContext.data.activeTenant.locationId, locationId);
  if (locationResult.status !== 'success') return { ok: false as const, result: locationResult };

  return { ok: true as const, supabase, tenantId, locationId };
}

export async function getScheduleSettings(locationIdRaw: unknown): Promise<WorkforceWriteResult<WorkforceScheduleSettings | null>> {
  const resolved = await resolveTenantAndLocation(locationIdRaw);
  if (!resolved.ok) return resolved.result;
  return getWorkforceScheduleSettings(resolved.supabase, resolved.tenantId, resolved.locationId);
}

export interface SaveScheduleSettingsInput {
  locationId: string;
  requiredHeadcountByWeekday: number[];
  maxMonthlyHours: number;
  /** Weekly labour limits (0126): hours 1-168, days 1-7. Omit to leave the stored value untouched. */
  maxWeeklyHours?: number;
  maxDaysPerWeek?: number;
  autoCreateDayOfMonth: number;
  /** Manager ON/OFF opt-in for scheduled monthly auto-create. Omit to leave the stored value untouched (mirrors `autoCreateDayOfMonth`'s existing optionality). */
  autoCreateEnabled?: boolean;
}

export async function saveScheduleSettings(input: unknown): Promise<WorkforceWriteResult<WorkforceScheduleSettings>> {
  if (!input || typeof input !== 'object') return INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const required = value.requiredHeadcountByWeekday;
  const maxHours = value.maxMonthlyHours;
  const autoCreateDayOfMonth = value.autoCreateDayOfMonth;
  const autoCreateEnabled = value.autoCreateEnabled;
  const maxWeeklyHours = value.maxWeeklyHours;
  const maxDaysPerWeek = value.maxDaysPerWeek;
  // Same bounds as the DB CHECK constraints (migration 0126).
  const isOptionalIntInRange = (raw: unknown, min: number, max: number) =>
    raw === undefined || (Number.isInteger(raw) && (raw as number) >= min && (raw as number) <= max);
  if (
    !isOptionalIntInRange(maxWeeklyHours, 1, 168) ||
    !isOptionalIntInRange(maxDaysPerWeek, 1, 7)
  ) {
    return INVALID_INPUT_RESULT;
  }
  if (
    !Array.isArray(required) ||
    required.length !== 7 ||
    required.some((item) => !Number.isInteger(item) || (item as number) < 0 || (item as number) > 100) ||
    !Number.isInteger(maxHours) ||
    (maxHours as number) < 0 ||
    (maxHours as number) > 744 ||
    !Number.isInteger(autoCreateDayOfMonth) ||
    (autoCreateDayOfMonth as number) < 1 ||
    (autoCreateDayOfMonth as number) > 28 ||
    (autoCreateEnabled !== undefined && typeof autoCreateEnabled !== 'boolean')
  ) {
    return INVALID_INPUT_RESULT;
  }

  const resolved = await resolveTenantAndLocation(value.locationId);
  if (!resolved.ok) return resolved.result;

  return upsertWorkforceScheduleSettings(resolved.supabase, {
    tenantId: resolved.tenantId,
    locationId: resolved.locationId,
    requiredHeadcountByWeekday: required as number[],
    maxMonthlyHours: maxHours as number,
    ...(maxWeeklyHours !== undefined ? { maxWeeklyHours: maxWeeklyHours as number } : {}),
    ...(maxDaysPerWeek !== undefined ? { maxDaysPerWeek: maxDaysPerWeek as number } : {}),
    autoCreateDayOfMonth: autoCreateDayOfMonth as number,
    ...(autoCreateEnabled !== undefined ? { autoCreateEnabled: autoCreateEnabled as boolean } : {}),
  });
}

export async function listShiftTypesForSettings(): Promise<WorkforceWriteResult<WorkforceShiftType[]>> {
  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;
  const supabase = await createClient();
  return listWorkforceShiftTypes(supabase, tenantContext.data.activeTenant.tenantId);
}

export async function upsertShiftType(input: unknown): Promise<WorkforceWriteResult<WorkforceShiftType>> {
  if (!input || typeof input !== 'object') return INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const shiftTypeId = value.shiftTypeId === undefined ? undefined : (parseUuid(value.shiftTypeId) ?? undefined);
  if (value.shiftTypeId !== undefined && shiftTypeId === undefined) return INVALID_INPUT_RESULT;
  const labelJa = parseTrimmedString(value.labelJa, 80);
  const startsAtLocal = parseLocalTime(value.startsAtLocal);
  const endsAtLocal = parseLocalTime(value.endsAtLocal);
  if (!labelJa || !startsAtLocal || !endsAtLocal || endsAtLocal <= startsAtLocal) return INVALID_INPUT_RESULT;

  const resolved = await resolveTenantAndLocation(value.locationId);
  if (!resolved.ok) return resolved.result;

  if (shiftTypeId) {
    const visible = await listWorkforceShiftTypes(resolved.supabase, resolved.tenantId);
    if (visible.status !== 'success') return visible;
    if (!visible.data.some((item) => item.shiftTypeId === shiftTypeId && item.locationId === resolved.locationId)) {
      return { status: 'not_found' };
    }
  }

  return upsertWorkforceShiftType(resolved.supabase, {
    shiftTypeId,
    tenantId: resolved.tenantId,
    locationId: resolved.locationId,
    labelJa,
    startsAtLocal,
    endsAtLocal,
  });
}

export async function setShiftTypeActive(input: unknown): Promise<WorkforceWriteResult<{ shiftTypeId: string; isActive: boolean }>> {
  if (!input || typeof input !== 'object') return INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const shiftTypeId = parseUuid(value.shiftTypeId);
  if (!shiftTypeId || typeof value.isActive !== 'boolean') return INVALID_INPUT_RESULT;

  const resolved = await resolveTenantAndLocation(value.locationId);
  if (!resolved.ok) return resolved.result;

  return setWorkforceShiftTypeActive(resolved.supabase, resolved.tenantId, resolved.locationId, shiftTypeId, value.isActive);
}

export async function deleteShiftType(input: unknown): Promise<WorkforceWriteResult<{ shiftTypeId: string }>> {
  if (!input || typeof input !== 'object') return INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const shiftTypeId = parseUuid(value.shiftTypeId);
  if (!shiftTypeId) return INVALID_INPUT_RESULT;

  const resolved = await resolveTenantAndLocation(value.locationId);
  if (!resolved.ok) return resolved.result;

  return permanentlyDeleteWorkforceShiftType(resolved.supabase, resolved.tenantId, resolved.locationId, shiftTypeId);
}
