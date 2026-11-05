import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from './types';
import { mapMyLocationRows, type ApiMyLocationRow, type MyLocation } from './active-location';

/** Flat row shape returned by `api.my_tenant_locations`. */
export interface ApiTenantLocationRow {
  tenant_id: string;
  location_id: string;
  location_name: string;
  timezone: string;
  is_active: boolean;
}

export interface TenantLocation {
  tenantId: string;
  locationId: string;
  locationName: string;
  timezone: string;
  isActive: boolean;
}

function mapPostgrestError(error: PostgrestError): TenantAccessResult<never> {
  // 42501 = insufficient_privilege; PostgREST also surfaces "permission denied".
  if (error.code === '42501' || /permission denied/i.test(error.message)) {
    return { status: 'unauthorized', message: 'Not permitted to read tenant locations.' };
  }
  return { status: 'unexpected_error', message: error.message };
}

function compareTenantLocations(a: TenantLocation, b: TenantLocation): number {
  const byTenant = a.tenantId.localeCompare(b.tenantId);
  if (byTenant !== 0) return byTenant;

  const byName = a.locationName.localeCompare(b.locationName);
  if (byName !== 0) return byName;

  return a.locationId.localeCompare(b.locationId);
}

/** Rows of `api.my_tenant_locations` (direct read or `api.my_page_context`) -> sorted locations. */
export function mapTenantLocationRows(rows: ApiTenantLocationRow[]): TenantLocation[] {
  const locations = rows.map((row) => ({
    tenantId: row.tenant_id,
    locationId: row.location_id,
    locationName: row.location_name,
    timezone: row.timezone,
    isActive: row.is_active,
  }));
  locations.sort(compareTenantLocations);
  return locations;
}

/**
 * The caller's locations with access (`api.my_locations`, 0151) through the
 * given client. Pages use the page context instead (no extra request); this
 * is for flows that hold a client with a session the cookies do not carry
 * yet (post-login redirect).
 */
export async function listMyLocations(supabase: SupabaseClient): Promise<TenantAccessResult<MyLocation[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_locations')
      .select('tenant_id, location_id, location_name, timezone, is_active, access');
    if (error) return mapPostgrestError(error);
    return { status: 'success', data: mapMyLocationRows((data ?? []) as ApiMyLocationRow[]) };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading locations.' };
  }
}

/**
 * Read current-user tenant locations through the app-facing API facade.
 *
 * The view is already self-scoped to the authenticated user's active tenant
 * memberships. This helper accepts no tenant id and adds no client-side tenant
 * filter; tenant isolation remains in the database.
 */
export async function listTenantLocations(
  supabase: SupabaseClient,
): Promise<TenantAccessResult<TenantLocation[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('my_tenant_locations')
      .select('tenant_id, location_id, location_name, timezone, is_active');

    if (error) return mapPostgrestError(error);

    return { status: 'success', data: mapTenantLocationRows((data ?? []) as ApiTenantLocationRow[]) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading tenant locations.',
    };
  }
}
