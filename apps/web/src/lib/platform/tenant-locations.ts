import type { SupabaseClient } from '@supabase/supabase-js';

/** Row of `api.platform_tenant_locations` (0157). No PII by contract. */
interface ApiTenantLocationRow {
  tenant_id: string | null;
  location_id: string | null;
  location_name: string | null;
  timezone: string | null;
  is_active: boolean | null;
  created_at: string | null;
  active_staff_count: number | null;
}

export interface PlatformLocationRow {
  tenantId: string;
  locationId: string;
  locationName: string;
  timezone: string;
  isActive: boolean;
  createdAt: string | null;
  /** Active employees whose home store this is (archive is refused while > 0). */
  activeStaffCount: number;
}

export type TenantLocationsResult = { status: 'success'; data: PlatformLocationRow[] } | { status: 'unauthorized' } | { status: 'error' };

/** A row without its ids is dropped (cannot be acted on); other gaps get safe defaults. */
export function mapTenantLocationRow(row: ApiTenantLocationRow): PlatformLocationRow | null {
  if (!row.tenant_id || !row.location_id) return null;
  const count = row.active_staff_count;
  return {
    tenantId: row.tenant_id,
    locationId: row.location_id,
    locationName: row.location_name ?? '',
    timezone: row.timezone ?? '',
    isActive: row.is_active === true,
    createdAt: row.created_at,
    activeStaffCount: typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : 0,
  };
}

function createdMs(row: PlatformLocationRow): number {
  const ms = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * One tenant's stores for the console: open stores oldest first (the first one
 * is the main store, same rule as the cabinet's `compareLocationsByMainStore`),
 * archived stores in their own group, same order.
 */
export function tenantLocationGroups(
  rows: readonly PlatformLocationRow[],
  tenantId: string,
): { active: PlatformLocationRow[]; archived: PlatformLocationRow[] } {
  const own = rows
    .filter((r) => r.tenantId === tenantId)
    .sort((a, b) => createdMs(a) - createdMs(b) || a.locationName.localeCompare(b.locationName, 'ja') || a.locationId.localeCompare(b.locationId));
  return { active: own.filter((r) => r.isActive), archived: own.filter((r) => !r.isActive) };
}

/**
 * Platform-staff read for the admin console (0157), through the CALLER'S OWN
 * session (request-scoped anon-key client; the SQL function checks
 * `is_platform_staff` from the JWT and raises 42501 otherwise). One call for
 * every tenant (`p_tenant_id: null`). Raw DB error text never leaves here.
 */
export async function listPlatformTenantLocations(supabase: SupabaseClient): Promise<TenantLocationsResult> {
  try {
    const { data, error } = await supabase.schema('api').rpc('platform_tenant_locations', { p_tenant_id: null });
    if (error) return error.code === '42501' ? { status: 'unauthorized' } : { status: 'error' };
    const rows = (Array.isArray(data) ? data : []) as ApiTenantLocationRow[];
    return { status: 'success', data: rows.map(mapTenantLocationRow).filter((r): r is PlatformLocationRow => r !== null) };
  } catch {
    return { status: 'error' };
  }
}
