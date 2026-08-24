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

/**
 * Canonical customer-facing label for a shift type -- never render `code`
 * directly (an auto-generated custom shift type's `code` is an internal
 * `CUSTOM_<timestamp>` identifier, never a display label; see
 * `upsertWorkforceShiftType` below). Every Staff/Manager selector must
 * resolve through this instead of its own ad-hoc `labelJa || labelEn || code`
 * chain.
 *
 * Weekly Schedule Founder Review Round 2 (2026-08-22): the last-resort
 * fallback used to be `code` itself -- for any row that genuinely has no
 * `labelJa`/`labelEn` (seed/fixture data, or any future write path that
 * doesn't apply the same "default the name to the time range" convention
 * `settings-section.tsx`'s own create form already does at entry time),
 * that still rendered the raw internal id. The true last resort now is the
 * shift's own time range -- always meaningful to a Manager/Staff member,
 * never an internal identifier -- so this function is safe regardless of
 * how a given row was created, not just for rows created through the one
 * UI path that happens to default the label correctly.
 */
export function shiftTypeDisplayLabel(
  shiftType: Pick<WorkforceShiftType, 'labelJa' | 'labelEn' | 'code' | 'startsAtLocal' | 'endsAtLocal'>,
): string {
  return shiftType.labelJa || shiftType.labelEn || `${shiftType.startsAtLocal}-${shiftType.endsAtLocal}`;
}

/**
 * Shift types to show in a week's legend: every currently-active type, plus
 * any type actually used by an assignment in that week even if it has since
 * been deactivated (an old assignment referencing a now-inactive type must
 * still be explainable, not show an unlabeled chip). Pure/sync -- callers
 * already have `activeTypes` (their own `isActive` filter), the week's
 * assignments (just the `shiftTypeId`s), and a full id-keyed map to resolve a
 * used-but-inactive type's own record.
 */
export function shiftTypesForWeekLegend(
  activeTypes: WorkforceShiftType[],
  weekAssignments: { shiftTypeId: string | null }[],
  allTypesById: Map<string, WorkforceShiftType>,
): WorkforceShiftType[] {
  const byId = new Map<string, WorkforceShiftType>();
  for (const st of activeTypes) byId.set(st.shiftTypeId, st);
  for (const a of weekAssignments) {
    if (!a.shiftTypeId || byId.has(a.shiftTypeId)) continue;
    const st = allTypesById.get(a.shiftTypeId);
    if (st) byId.set(a.shiftTypeId, st);
  }
  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
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
    // PostgreSQL `time` values arrive as HH:MM:SS, while HTML time inputs and
    // the shared schedule parser intentionally use minute precision (HH:MM).
    startsAtLocal: row.starts_at_local.slice(0, 5),
    endsAtLocal: row.ends_at_local.slice(0, 5),
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

/** Read one RLS-visible shift type without loading every template. */
export async function getWorkforceShiftTypeById(
  supabase: SupabaseClient,
  tenantId: string,
  shiftTypeId: string,
): Promise<TenantAccessResult<WorkforceShiftType | null>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_shift_types')
      .select(SHIFT_TYPE_SELECT)
      .eq('tenant_id', tenantId)
      .eq('shift_type_id', shiftTypeId)
      .maybeSingle();
    if (error) return mapWorkforceReadError(error, 'read shift type');
    return { status: 'success', data: data ? mapShiftTypeRow(data as ApiWorkforceShiftTypeRow) : null };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading shift type.' };
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

/**
 * A shift type's own `labelJa` is what a Manager actually recognizes it by
 * (`shiftTypeDisplayLabel`'s primary field) -- two active types with the
 * same trimmed, case-folded label are indistinguishable in every selector/
 * legend in this app. Checked application-side (no DB unique constraint,
 * matching the plan's "cheap check, not a DB constraint" framing) against
 * only the OTHER active types in the same tenant/location -- re-saving a
 * type's own unchanged label, or reusing a deactivated type's old label,
 * must never self-reject. WP A8.
 */
async function findDuplicateActiveLabel(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  labelJa: string,
  excludeShiftTypeId: string | undefined,
): Promise<boolean> {
  const normalized = labelJa.trim().toLowerCase();
  if (!normalized) return false;
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_shift_types')
    .select('shift_type_id, label_ja')
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .eq('is_active', true);
  if (error || !data) return false;
  return (data as { shift_type_id: string; label_ja: string }[]).some(
    (row) => row.shift_type_id !== excludeShiftTypeId && row.label_ja.trim().toLowerCase() === normalized,
  );
}

export async function upsertWorkforceShiftType(
  supabase: SupabaseClient,
  input: UpsertWorkforceShiftTypeInput,
): Promise<WorkforceWriteResult<WorkforceShiftType>> {
  const isDuplicate = await findDuplicateActiveLabel(supabase, input.tenantId, input.locationId, input.labelJa, input.shiftTypeId);
  if (isDuplicate) {
    return { status: 'duplicate', message: 'An active shift type with this name already exists.' };
  }

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

/**
 * Permanent delete for a deactivated shift type. A plain `DELETE`, not a
 * guarded RPC like `permanentlyDeleteEmployee` -- unlike an employee's
 * multi-table history, a shift type has exactly one referencing FK
 * (`workforce.shifts.shift_type_id` / `workforce.shift_requests.shift_type_id`,
 * both plain `NO ACTION`, see 0026/0028), so Postgres' own referential
 * integrity is already the guard: a type that was ever assigned or requested
 * fails with `23503` and is mapped straight to `blocked_by_history`, matching
 * the `employee-line-links.ts`/`shift-assignments.ts` precedent for this same
 * error code. Only offered from the UI for an already-deactivated type.
 */
export async function permanentlyDeleteWorkforceShiftType(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  shiftTypeId: string,
): Promise<WorkforceWriteResult<{ shiftTypeId: string }>> {
  const { data, error } = await supabase
    .schema('api')
    .from('workforce_shift_types')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('location_id', locationId)
    .eq('shift_type_id', shiftTypeId)
    .select('shift_type_id')
    .maybeSingle();
  if (error) {
    if (error.code === '23503') return { status: 'blocked_by_history' };
    return mapWorkforceWriteError(error, 'delete shift type');
  }
  if (!data) return { status: 'not_found' };
  return { status: 'success', data: { shiftTypeId: data.shift_type_id as string } };
}
