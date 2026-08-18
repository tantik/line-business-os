'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getWorkforceScheduleSettings, upsertWorkforceScheduleSettings, type WorkforceScheduleSettings } from './schedule-settings';
import { listWorkforceShiftTypes, setWorkforceShiftTypeActive, upsertWorkforceShiftType, type WorkforceShiftType } from './shift-types';
import { parseLocalTime, parseTrimmedString, parseUuid } from './validation';
import type { WorkforceWriteResult } from './result-types';

/**
 * Server Actions for the Manager dashboard's Settings section (WP A8):
 * per-weekday staffing requirements, max monthly hours, and shift-type CRUD.
 * Same shape/precedent as `preview/actions/settings-actions.ts` (this
 * mission's Surface A reference), but against the canonical service layer
 * and RLS-backed `requireTenantContext()`, not the preview auth stub. A
 * client-supplied `locationId` is never trusted on its own -- every action
 * re-verifies it belongs to the resolved tenant via `listTenantLocations`
 * before using it, same pattern `schedule-actions.ts`'s `runAutoDistribution`
 * already established.
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;

async function resolveTenantAndLocation(locationIdRaw: unknown) {
  const locationId = parseUuid(locationIdRaw);
  if (!locationId) return { ok: false as const, result: INVALID_INPUT_RESULT };

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return { ok: false as const, result: tenantContext };

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') return { ok: false as const, result: locationsResult };
  const location = locationsResult.data.find((l) => l.tenantId === tenantId && l.locationId === locationId);
  if (!location) return { ok: false as const, result: { status: 'not_found' as const } };

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
}

export async function saveScheduleSettings(input: unknown): Promise<WorkforceWriteResult<WorkforceScheduleSettings>> {
  if (!input || typeof input !== 'object') return INVALID_INPUT_RESULT;
  const value = input as Record<string, unknown>;
  const required = value.requiredHeadcountByWeekday;
  const maxHours = value.maxMonthlyHours;
  if (
    !Array.isArray(required) ||
    required.length !== 7 ||
    required.some((item) => !Number.isInteger(item) || (item as number) < 0 || (item as number) > 100) ||
    !Number.isInteger(maxHours) ||
    (maxHours as number) < 0 ||
    (maxHours as number) > 744
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
