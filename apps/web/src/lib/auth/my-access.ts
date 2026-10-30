import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Which checks a page needs, answered by ONE `api.my_access` RPC (0142,
 * DEBT-124/135) instead of one round trip per check:
 *   - `location`:    `api.has_permission(tenant, perm, locationId)`
 *   - `tenant`:      `api.has_permission(tenant, perm, null)` -- tenant-wide
 *                    assignment only
 *   - `anyLocation`: `api.has_permission_in_tenant(tenant, perm)`
 * `isTenantOwner` (`api.is_tenant_owner`) is always answered.
 */
export type MyAccessSpec = {
  location?: readonly string[];
  tenant?: readonly string[];
  anyLocation?: readonly string[];
};

export type MyAccess = {
  location: (permission: string) => boolean;
  tenant: (permission: string) => boolean;
  anyLocation: (permission: string) => boolean;
  isTenantOwner: boolean;
};

const DENY_ALL: MyAccess = {
  location: () => false,
  tenant: () => false,
  anyLocation: () => false,
  isTenantOwner: false,
};

function readGroup(value: unknown): (permission: string) => boolean {
  if (!value || typeof value !== 'object') return () => false;
  const group = value as Record<string, unknown>;
  return (permission) => Object.hasOwn(group, permission) && group[permission] === true;
}

/**
 * Pre-checks for a page, never the security boundary: RLS and the write RPCs
 * re-check every permission themselves. Fails closed -- any RPC error,
 * unexpected shape, or a permission that was not asked for reads as `false`.
 */
export async function loadMyAccess(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string | null,
  spec: MyAccessSpec,
): Promise<MyAccess> {
  try {
    const { data, error } = await supabase.schema('api').rpc('my_access', {
      p_tenant_id: tenantId,
      p_location_id: locationId,
      p_location_permissions: spec.location ?? [],
      p_tenant_permissions: spec.tenant ?? [],
      p_any_location_permissions: spec.anyLocation ?? [],
    });
    if (error || !data || typeof data !== 'object') return DENY_ALL;
    const result = data as Record<string, unknown>;
    return {
      location: readGroup(result.location),
      tenant: readGroup(result.tenant),
      anyLocation: readGroup(result.anyLocation),
      isTenantOwner: result.isTenantOwner === true,
    };
  } catch {
    return DENY_ALL;
  }
}
