import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { resolvePreviewTenantContext } from '../tenant';
import { resolvePreviewWorkforceModule } from '../module-guard';
import { resolveManagerLocation } from '../location';
import {
  mapPreviewTenantFailure,
  mapPreviewModuleFailure,
  mapManagerLocationFailure,
  type PreviewWriteResult,
} from '../write-result';

/**
 * Phase 1N-4C Slice B2a - shared manager write security sequence (B2 plan
 * Section 3.1/3.1a), used by every `previewXxx` manager Server Action so the
 * permission-key mapping and the resolve-tenant -> resolve-module ->
 * resolve-location -> check-permission sequence exists in exactly one place,
 * never duplicated across the seven wrapper functions.
 *
 * Every one of the seven B2a mutations' own RLS policy is location-scoped
 * (B2 plan Section 3.1a) - there is no tenant-wide-only permission in this
 * matrix - so every caller of `resolvePreviewManagerContext` passes one of
 * these three exact permission keys, never a role name or a client-supplied
 * value.
 */
export type ManagerPermission = 'workforce.staff.manage' | 'workforce.shift.write' | 'workforce.request.manage';

export interface PreviewManagerContext {
  supabase: SupabaseClient;
  tenantId: string;
  locationId: string;
  /** The resolved active location's own time zone - needed by every schedule mutation's local->UTC conversion; never re-derived from a client-supplied value. */
  timeZone: string;
}

export type PreviewManagerContextResult =
  | { status: 'ok'; context: PreviewManagerContext }
  | { status: 'fail'; result: PreviewWriteResult<never> };

/**
 * Calls `api.has_permission` (0019 facade) exactly as the mutation's own RLS
 * policy would evaluate it - this is a pre-check, not a substitute for RLS,
 * and duplicates zero authorization logic (same predicate, moved earlier).
 * Any RPC error (network, config, unexpected shape) fails closed to `false`,
 * never `true`.
 */
async function checkManagerPermission(
  supabase: SupabaseClient,
  tenantId: string,
  permission: ManagerPermission,
  locationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: permission,
      p_location_id: locationId,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Runs the full B2a manager write security sequence (B2 plan Section 3.1,
 * steps 1-6): authenticate + resolve strict tenant membership, recheck
 * Workforce entitlement, resolve exactly one active location, then verify
 * the caller holds `permission` for that tenant/location via `api.has_permission`.
 *
 * Every step short-circuits to a neutral `PreviewWriteResult` failure on the
 * first non-`ok` outcome - a `false` permission result stops here, before any
 * target-record validation (step 7) or service-layer call (step 8) ever
 * runs. Callers must not proceed past a `'fail'` result.
 */
export async function resolvePreviewManagerContext(permission: ManagerPermission): Promise<PreviewManagerContextResult> {
  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') {
    return { status: 'fail', result: mapPreviewTenantFailure(tenantResult) };
  }
  const tenantId = tenantResult.data.activeTenant.tenantId;
  const supabase = await createClient();

  const moduleResult = await resolvePreviewWorkforceModule(supabase, tenantId);
  if (moduleResult.status !== 'enabled') {
    return { status: 'fail', result: mapPreviewModuleFailure(moduleResult) };
  }

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') {
    return { status: 'fail', result: { status: 'unexpected_error' } };
  }
  const tenantLocations = locationsResult.data.filter((l) => l.tenantId === tenantId);
  const locationResult = resolveManagerLocation(tenantLocations);
  if (locationResult.kind !== 'ok') {
    return { status: 'fail', result: mapManagerLocationFailure(locationResult) };
  }
  const locationId = locationResult.location.locationId;
  const timeZone = locationResult.location.timezone;

  // Step 6 must run after step 5 (location resolution) - every B2a permission
  // is location-scoped by its own RLS policy (Section 3.1a), so `p_location_id`
  // is never undefined here.
  const permitted = await checkManagerPermission(supabase, tenantId, permission, locationId);
  if (!permitted) {
    return { status: 'fail', result: { status: 'no_access' } };
  }

  return { status: 'ok', context: { supabase, tenantId, locationId, timeZone } };
}
