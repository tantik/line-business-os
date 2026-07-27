import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { mapWorkforceReadError } from './pg-error';
import { mapWorkforceWriteError } from './pg-error';
import type { WorkforceWriteResult } from './result-types';

/** Flat row shape returned by `api.workforce_shift_types`. */
interface ApiWorkforceShiftTypeRow {
  shift_type_id: string;
  tenant_id: string;
  location_id: string;
  code: string;
  label_ja: string;
  label_en: string | null;
  starts_at_local: string;
  ends_at_local: string;
  break_minutes: number;
  is_custom: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface WorkforceShiftType {
  shiftTypeId: string;
  tenantId: string;
  locationId: string;
  code: string;
  labelJa: string;
  labelEn: string | null;
  startsAtLocal: string;
  endsAtLocal: string;
  breakMinutes: number;
  isCustom: boolean;
  sortOrder: number;
  isActive: boolean;
}

const SHIFT_TYPE_SELECT =
  'shift_type_id, tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local, break_minutes, is_custom, sort_order, is_active';

function mapShiftTypeRow(row: ApiWorkforceShiftTypeRow): WorkforceShiftType {
  return {
    shiftTypeId: row.shift_type_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    code: row.code,
    labelJa: row.label_ja,
    labelEn: row.label_en,
    startsAtLocal: row.starts_at_local,
    endsAtLocal: row.ends_at_local,
    breakMinutes: row.break_minutes,
    isCustom: row.is_custom,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

/**
 * Read shift-type templates through `api.workforce_shift_types`. Visible to
 * both `workforce.shift.read` and `workforce.shift.write` holders (RLS,
 * unchanged) -- staff and managers both see the tenant's shift legend.
 */
export async function listWorkforceShiftTypes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceShiftType[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_types')
      .select(SHIFT_TYPE_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read shift types');

    const rows = (data ?? []) as ApiWorkforceShiftTypeRow[];
    const shiftTypes = rows.map(mapShiftTypeRow).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    return { status: 'success', data: shiftTypes };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading shift types.',
    };
  }
}

export interface UpsertWorkforceShiftTypeInput {
  shiftTypeId?: string;
  tenantId: string;
  locationId: string;
  labelJa: string;
  startsAtLocal: string;
  endsAtLocal: string;
}

export async function upsertWorkforceShiftType(
  supabase: SupabaseClient,
  input: UpsertWorkforceShiftTypeInput,
): Promise<WorkforceWriteResult<WorkforceShiftType>> {
  const values = {
    tenant_id: input.tenantId,
    location_id: input.locationId,
    code: input.shiftTypeId ? undefined : `CUSTOM_${Date.now()}`,
    label_ja: input.labelJa,
    starts_at_local: input.startsAtLocal,
    ends_at_local: input.endsAtLocal,
    break_minutes: 0,
    is_custom: true,
    is_active: true,
  };
  const query = input.shiftTypeId
    ? supabase.schema('api').from('workforce_shift_types').update(values).eq('shift_type_id', input.shiftTypeId)
    : supabase.schema('api').from('workforce_shift_types').insert(values);
  const { data, error } = await query.select(SHIFT_TYPE_SELECT).single();
  if (error) return mapWorkforceWriteError(error, 'save shift type');
  return { status: 'success', data: mapShiftTypeRow(data as ApiWorkforceShiftTypeRow) };
}

export async function setWorkforceShiftTypeActive(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  shiftTypeId: string,
  isActive: boolean,
): Promise<WorkforceWriteResult<{ shiftTypeId: string; isActive: boolean }>> {
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_shift_types')
    .update({ is_active: isActive })
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .eq('shift_type_id', shiftTypeId)
    .select('shift_type_id, is_active')
    .maybeSingle();
  if (error) return mapWorkforceWriteError(error, 'update shift type');
  if (!data) return { status: 'not_found' };
  return { status: 'success', data: { shiftTypeId: data.shift_type_id as string, isActive: data.is_active as boolean } };
}
