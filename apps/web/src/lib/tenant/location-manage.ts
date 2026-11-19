import type { SupabaseClient } from '@supabase/supabase-js';
import { parseUuid } from '@/lib/workforce/validation';
import { compareLocationsByMainStore, type MyLocation } from './active-location';

/**
 * Owner cabinet store management (DEBT-139 L3, F1/F3): add / rename / archive /
 * restore a store and move a person to another store. Pure parsing, error
 * mapping and the thin RPC calls -- no Next.js here, so it is unit-testable;
 * `location-manage-actions.ts` is the 'use server' entry.
 *
 * The RPCs (0151 `api.create_location` / `rename_location` /
 * `set_location_active` / `move_employee_location`) are the only enforcement
 * point: `core.location.manage` tenant-wide, name rules, the store limit,
 * last-store / active-staff / future-shift guards, audit. Everything here only
 * decides what the UI offers and how a refusal reads.
 */

export const LOCATION_MANAGE_PERMISSION = 'core.location.manage';

/** Same bound as `core.assert_location_name` (0151). */
export const LOCATION_NAME_MAX_LENGTH = 60;

export type LocationManageErrorCode =
  | 'invalid_input'
  | 'invalid_name'
  | 'name_taken'
  | 'limit_reached'
  | 'invalid_timezone'
  | 'tenant_not_active'
  | 'location_not_found'
  | 'last_active_location'
  | 'has_active_staff'
  | 'has_future_shifts'
  | 'employee_inactive'
  | 'employee_has_no_location'
  | 'module_disabled'
  | 'permission_denied'
  | 'not_authenticated'
  | 'unexpected';

/** Every code, for copy-completeness tests and exhaustive UI tables. */
export const LOCATION_MANAGE_ERROR_CODES: readonly LocationManageErrorCode[] = [
  'invalid_input',
  'invalid_name',
  'name_taken',
  'limit_reached',
  'invalid_timezone',
  'tenant_not_active',
  'location_not_found',
  'last_active_location',
  'has_active_staff',
  'has_future_shifts',
  'employee_inactive',
  'employee_has_no_location',
  'module_disabled',
  'permission_denied',
  'not_authenticated',
  'unexpected',
];

export type LocationManageResult<T> = { status: 'success'; data: T } | { status: 'error'; code: LocationManageErrorCode };

// --- input -------------------------------------------------------------------------

// The DB trims ASCII and full-width (U+3000) spaces only (`btrim(p_name, ...)`
// in core.assert_location_name); trimming the same set here keeps the
// client's length check identical.
const NAME_TRIM_RE = new RegExp('^[ \\u3000]+|[ \\u3000]+$', 'g');
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

/** A store name: trimmed (ASCII / full-width spaces), 1-60 characters (code points, like `char_length`), no control characters. */
export function parseLocationName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  const name = raw.replace(NAME_TRIM_RE, '');
  const length = Array.from(name).length;
  if (length < 1 || length > LOCATION_NAME_MAX_LENGTH) return null;
  if (CONTROL_CHAR_RE.test(name)) return null;
  return name;
}

export function parseCreateLocationInput(formData: FormData): { name: string } | null {
  const name = parseLocationName(formData.get('name'));
  return name ? { name } : null;
}

export function parseRenameLocationInput(formData: FormData): { locationId: string; name: string } | null {
  const locationId = parseUuid(formData.get('locationId'));
  const name = parseLocationName(formData.get('name'));
  return locationId && name ? { locationId, name } : null;
}

/** `isActive` must be exactly 'true' or 'false' (a missing flag must never archive). */
export function parseSetLocationActiveInput(formData: FormData): { locationId: string; isActive: boolean } | null {
  const locationId = parseUuid(formData.get('locationId'));
  const raw = formData.get('isActive');
  if (!locationId || (raw !== 'true' && raw !== 'false')) return null;
  return { locationId, isActive: raw === 'true' };
}

export function parseMoveEmployeeInput(formData: FormData): { employeeId: string; locationId: string } | null {
  const employeeId = parseUuid(formData.get('staffId'));
  const locationId = parseUuid(formData.get('locationId'));
  return employeeId && locationId ? { employeeId, locationId } : null;
}

// --- errors ------------------------------------------------------------------------

/** PostgREST error of one of the store RPCs -> a stable code (the functions' own message identifiers first, then SQLSTATE). */
export function mapLocationManageError(error: { code?: string | null; message?: string | null } | null | undefined): LocationManageErrorCode {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '28000' || message.includes('not_authenticated')) return 'not_authenticated';
  if (code === '42501' || message.includes('permission_denied')) return 'permission_denied';
  if (message.includes('invalid_location_name')) return 'invalid_name';
  if (message.includes('location_name_taken')) return 'name_taken';
  if (message.includes('location_limit_reached')) return 'limit_reached';
  if (message.includes('invalid_timezone')) return 'invalid_timezone';
  if (message.includes('tenant_not_active')) return 'tenant_not_active';
  if (message.includes('location_not_found')) return 'location_not_found';
  if (message.includes('last_active_location')) return 'last_active_location';
  if (message.includes('location_has_active_staff')) return 'has_active_staff';
  if (message.includes('employee_has_future_shifts')) return 'has_future_shifts';
  if (message.includes('employee_inactive')) return 'employee_inactive';
  if (message.includes('employee_has_no_location')) return 'employee_has_no_location';
  if (message.includes('workforce_module_disabled')) return 'module_disabled';
  if (code === '22004' || code === '22P02' || code === '22023') return 'invalid_input';
  return 'unexpected';
}

// --- store lists -------------------------------------------------------------------

export interface TenantStoreRow {
  locationId: string;
  locationName: string;
  isActive: boolean;
  createdAt: string | null;
}

/**
 * The cabinet 「店舗」 list of ONE tenant from the caller's `myLocations`
 * (access 'all' lists archived stores too): open stores main store first,
 * archived ones in their own group, same order.
 */
export function tenantStoreGroups(locations: readonly MyLocation[], tenantId: string): { active: TenantStoreRow[]; archived: TenantStoreRow[] } {
  const own = locations.filter((l) => l.tenantId === tenantId).sort(compareLocationsByMainStore);
  const toRow = (l: MyLocation): TenantStoreRow => ({ locationId: l.locationId, locationName: l.locationName, isActive: l.isActive, createdAt: l.createdAt });
  return { active: own.filter((l) => l.isActive).map(toRow), archived: own.filter((l) => !l.isActive).map(toRow) };
}

/** Targets of 「別の店舗へ移動」: every open store of the list except the person's current one. */
export function moveTargets(activeStores: readonly TenantStoreRow[], fromLocationId: string | null): TenantStoreRow[] {
  return activeStores.filter((s) => s.isActive && s.locationId !== fromLocationId);
}

// --- RPC calls -----------------------------------------------------------------------

function readObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

/** `api.create_location` with the default timezone (Asia/Tokyo) and source (the oldest open store). */
export async function createLocation(
  supabase: SupabaseClient,
  tenantId: string,
  name: string,
): Promise<LocationManageResult<{ locationId: string | null }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('create_location', { p_tenant_id: tenantId, p_name: name });
    if (error) return { status: 'error', code: mapLocationManageError(error) };
    const row = readObject(data);
    if (!row) return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { locationId: parseUuid(row.location_id) } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

export async function renameLocation(
  supabase: SupabaseClient,
  locationId: string,
  name: string,
): Promise<LocationManageResult<{ changed: boolean }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('rename_location', { p_location_id: locationId, p_name: name });
    if (error) return { status: 'error', code: mapLocationManageError(error) };
    const row = readObject(data);
    if (!row) return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { changed: row.changed === true } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

export async function setLocationActive(
  supabase: SupabaseClient,
  locationId: string,
  isActive: boolean,
): Promise<LocationManageResult<{ isActive: boolean; changed: boolean }>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('set_location_active', { p_location_id: locationId, p_is_active: isActive });
    if (error) return { status: 'error', code: mapLocationManageError(error) };
    const row = readObject(data);
    if (!row) return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { isActive: typeof row.is_active === 'boolean' ? row.is_active : isActive, changed: row.changed === true } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

export interface MoveEmployeeOutcome {
  changed: boolean;
  /** 0156: the person's pending shift / leave / exchange requests at the old store the move cancelled (0 when absent). */
  cancelledRequests: number;
}

/** Non-negative integer, else 0 (tolerant: an older payload has no count). */
function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export async function moveEmployeeLocation(
  supabase: SupabaseClient,
  employeeId: string,
  locationId: string,
): Promise<LocationManageResult<MoveEmployeeOutcome>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('move_employee_location', { p_employee_id: employeeId, p_location_id: locationId });
    if (error) return { status: 'error', code: mapLocationManageError(error) };
    const row = readObject(data);
    if (!row) return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { changed: row.changed === true, cancelledRequests: readCount(row.cancelled_requests) } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

/** Server-side pre-check: does the caller hold `core.location.manage` tenant-wide (Owner / Admin)? Same check the RPCs make; fails closed. */
export async function hasLocationManageAccess(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: LOCATION_MANAGE_PERMISSION,
      p_location_id: null,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
