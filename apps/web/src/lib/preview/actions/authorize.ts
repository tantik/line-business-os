import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { resolvePreviewTenantContext } from '../tenant';
import { resolvePreviewWorkforceModule } from '../module-guard';
import { resolveManagerLocation, resolveStaffLocation } from '../location';
import { getMyWorkforceStaffProfile, type WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import {
  mapPreviewTenantFailure,
  mapPreviewModuleFailure,
  mapManagerLocationFailure,
  mapWorkforceWriteResult,
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
export type ManagerPermission =
  | 'workforce.staff.manage'
  | 'workforce.shift.write'
  | 'workforce.request.manage'
  | 'workforce.recipe.manage';

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

/**
 * Phase 1N-4C Slice B2b - shared staff write security sequence (B2b Section
 * 2/7), used by every `previewSubmitXxx` staff Server Action. Unlike the
 * manager sequence above, staff authorization is primarily self-binding plus
 * RLS, not a permission-key pre-check - there is no `has_permission` RPC call
 * here because no manager permission governs a staff self-submission (the
 * dashboard's own `submitShiftPreference`/`submitWorkReport`/
 * `submitCorrectionRequest` in `schedule-actions.ts`/`attendance-actions.ts`
 * rely on the same self-scope RLS policies with no separate pre-check).
 */
export interface PreviewStaffContext {
  supabase: SupabaseClient;
  tenantId: string;
  /** The caller's own resolved employee profile - never another employee's. */
  profile: WorkforceMyStaffProfile;
  /** Always `profile.staffId` - never a client-supplied value. */
  employeeId: string;
  /** The bound employee's own resolved active location - never a client-supplied value. */
  locationId: string;
  /** The resolved location's own time zone - needed by every local->UTC conversion. */
  timeZone: string;
}

export type PreviewStaffContextResult =
  | { status: 'ok'; context: PreviewStaffContext }
  | { status: 'fail'; result: PreviewWriteResult<never> };

/**
 * Runs the full B2b staff write security sequence: authenticate + resolve
 * strict tenant membership, recheck Workforce entitlement, resolve the
 * caller's own employee binding, then resolve that employee's own active
 * location via `resolveStaffLocation` (architecture plan Section F2, already
 * fail-closed on absent/inactive/foreign location - never falls back to any
 * other location). Every step short-circuits to a neutral `PreviewWriteResult`
 * failure on the first non-`ok` outcome; callers must not proceed past a
 * `'fail'` result.
 */
export async function resolvePreviewStaffContext(): Promise<PreviewStaffContextResult> {
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

  const profileResult = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (profileResult.status !== 'success') {
    return { status: 'fail', result: mapWorkforceWriteResult(profileResult) };
  }
  if (!profileResult.data) {
    return { status: 'fail', result: { status: 'no_profile' } };
  }
  const profile = profileResult.data;

  const locationsResult = await listTenantLocations(supabase);
  if (locationsResult.status !== 'success') {
    return { status: 'fail', result: { status: 'unexpected_error' } };
  }
  const tenantLocations = locationsResult.data.filter((l) => l.tenantId === tenantId);

  // Same fail-closed convention as the read page (`staff/page.tsx`): a
  // mismatched/inactive/foreign bound location is indistinguishable from "no
  // profile" to the caller - never location_blocked (that status is reserved
  // for the manager sequence's none/ambiguous tenant-wide location states).
  const location = resolveStaffLocation(profile, tenantLocations);
  if (!location) {
    return { status: 'fail', result: { status: 'no_profile' } };
  }

  return {
    status: 'ok',
    context: {
      supabase,
      tenantId,
      profile,
      employeeId: profile.staffId,
      locationId: location.locationId,
      timeZone: location.timezone,
    },
  };
}
