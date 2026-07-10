import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import { mapWorkforceReadError } from './pg-error';

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
