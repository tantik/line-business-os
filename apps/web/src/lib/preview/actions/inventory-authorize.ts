import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listTenantModules } from '@/lib/tenant/modules';
import { resolvePreviewTenantContext } from '../tenant';
import { resolveManagerLocation } from '../location';
import { resolvePreviewStaffContext } from './authorize';
import {
  mapPreviewTenantFailure,
  mapManagerLocationFailure,
  type PreviewWriteResult,
} from '../write-result';

/**
 * Inventory-specific preview authorize helpers. Deliberately separate from
 * `authorize.ts`'s `resolvePreviewManagerContext`/`ManagerPermission`, which
 * hardcode a re-check of the *Workforce* module's entitlement
 * (`resolvePreviewWorkforceModule`) -- Inventory is its own top-level module
 * (ADR 0010) with its own `core.tenant_modules` row, so its own manager write
 * sequence re-checks `inventory`'s entitlement, not Workforce's.
 *
 * Location resolution still uses the same `resolveManagerLocation` (Section
 * F2, module-agnostic) as every other manager write sequence in this preview
 * shell -- there is no Inventory-specific location concept.
 */

export type InventoryManagerPermission = 'inventory.item.manage';

export interface PreviewInventoryManagerContext {
  supabase: SupabaseClient;
  tenantId: string;
  locationId: string;
}

export type PreviewInventoryManagerContextResult =
  | { status: 'ok'; context: PreviewInventoryManagerContext }
  | { status: 'fail'; result: PreviewWriteResult<never> };

async function checkPermission(
  supabase: SupabaseClient,
  tenantId: string,
  permission: string,
  locationId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('has_permission', { p_tenant_id: tenantId, p_permission: permission, p_location_id: locationId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function resolvePreviewInventoryManagerContext(
  permission: InventoryManagerPermission,
): Promise<PreviewInventoryManagerContextResult> {
  const tenantResult = await resolvePreviewTenantContext();
  if (tenantResult.status !== 'success') {
    return { status: 'fail', result: mapPreviewTenantFailure(tenantResult) };
  }
  const tenantId = tenantResult.data.activeTenant.tenantId;
  const supabase = await createClient();

  const modulesResult = await listTenantModules(supabase);
  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === tenantId && m.module === 'inventory' && m.isEnabled);
  if (!inventoryEnabled) return { status: 'fail', result: { status: 'module_disabled' } };

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

  const permitted = await checkPermission(supabase, tenantId, permission, locationId);
  if (!permitted) return { status: 'fail', result: { status: 'no_access' } };

  return { status: 'ok', context: { supabase, tenantId, locationId } };
}

export interface PreviewInventoryStaffContext {
  supabase: SupabaseClient;
  tenantId: string;
  locationId: string;
}

export type PreviewInventoryStaffContextResult =
  | { status: 'ok'; context: PreviewInventoryStaffContext }
  | { status: 'fail'; result: PreviewWriteResult<never> };

/**
 * Staff write sequence for Inventory count entry. Reuses
 * `resolvePreviewStaffContext` (Workforce staff-profile-based identity/
 * location resolution) as-is: the preview shell has exactly one staff
 * identity/location mechanism today (the signed-in user's
 * `workforce.employees` binding), and the Staff page Inventory section only
 * ever renders inside that same Workforce-gated page, for that same
 * resolved location -- reusing it keeps this action consistent with every
 * other value the Staff page already shows for this user, rather than
 * inventing a second, parallel location-resolution path. Inventory's own
 * `inv_stock_counts_insert` RLS (tenant_id/location_id/counted_by-matched)
 * remains the actual authorization boundary regardless of how the location
 * was resolved here.
 */
export async function resolvePreviewInventoryStaffContext(): Promise<PreviewInventoryStaffContextResult> {
  const staffResult = await resolvePreviewStaffContext();
  if (staffResult.status !== 'ok') return staffResult;
  const { supabase, tenantId, locationId } = staffResult.context;

  const modulesResult = await listTenantModules(supabase);
  const inventoryEnabled =
    modulesResult.status === 'success' &&
    modulesResult.data.some((m) => m.tenantId === tenantId && m.module === 'inventory' && m.isEnabled);
  if (!inventoryEnabled) return { status: 'fail', result: { status: 'module_disabled' } };

  return { status: 'ok', context: { supabase, tenantId, locationId } };
}
