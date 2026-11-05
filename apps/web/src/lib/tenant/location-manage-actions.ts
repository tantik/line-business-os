'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from './context';
import { loadPageContext } from './page-context';
import {
  createLocation as createLocationRpc,
  moveEmployeeLocation as moveEmployeeLocationRpc,
  parseCreateLocationInput,
  parseLocationName,
  parseMoveEmployeeInput,
  parseRenameLocationInput,
  parseSetLocationActiveInput,
  renameLocation as renameLocationRpc,
  setLocationActive as setLocationActiveRpc,
  type LocationManageErrorCode,
  type LocationManageResult,
  type MoveEmployeeOutcome,
} from './location-manage';

/**
 * Server Actions of the cabinet 「店舗」 section and the staff move dialog
 * (DEBT-139 L3). Thin controllers: validate the form -> re-resolve the
 * tenant from the session (never the form) -> narrow a submitted location to
 * one of that tenant's stores the caller sees -> call the RPC with the
 * request-scoped (anon key + session) client. The RPCs enforce
 * `core.location.manage` and every rule; no privileged key is used here.
 */

type TenantResolution = { ok: true; tenantId: string } | { ok: false; code: LocationManageErrorCode };

async function resolveTenant(): Promise<TenantResolution> {
  const tenant = await requireTenantContext();
  if (tenant.status === 'success') return { ok: true, tenantId: tenant.data.activeTenant.tenantId };
  if (tenant.status === 'unauthorized' || tenant.status === 'no_membership') return { ok: false, code: 'permission_denied' };
  return { ok: false, code: 'unexpected' };
}

/**
 * The submitted location must be one of the ACTIVE tenant's stores in the
 * caller's `myLocations` (a multi-tenant Owner can never act on another
 * cafe's store from this workspace). Narrowing only -- the RPC re-checks.
 */
async function storeOfTenant(tenantId: string, locationId: string, opts: { activeOnly: boolean }): Promise<boolean> {
  const { myLocations } = await loadPageContext();
  if (myLocations.status !== 'success') return false;
  return myLocations.data.some((l) => l.tenantId === tenantId && l.locationId === locationId && (!opts.activeOnly || l.isActive));
}

function refreshEverywhere(): void {
  // The store list feeds every protected page (switcher, active store).
  revalidatePath('/', 'layout');
}

export async function createStore(formData: FormData): Promise<LocationManageResult<{ locationId: string | null }>> {
  const input = parseCreateLocationInput(formData);
  if (!input) return { status: 'error', code: 'invalid_name' };
  const tenant = await resolveTenant();
  if (!tenant.ok) return { status: 'error', code: tenant.code };

  const supabase = await createClient();
  const result = await createLocationRpc(supabase, tenant.tenantId, input.name);
  if (result.status === 'success') refreshEverywhere();
  return result;
}

export async function renameStore(formData: FormData): Promise<LocationManageResult<{ changed: boolean }>> {
  const input = parseRenameLocationInput(formData);
  if (!input) return { status: 'error', code: parseLocationName(formData.get('name')) === null ? 'invalid_name' : 'invalid_input' };
  const tenant = await resolveTenant();
  if (!tenant.ok) return { status: 'error', code: tenant.code };
  if (!(await storeOfTenant(tenant.tenantId, input.locationId, { activeOnly: false }))) return { status: 'error', code: 'location_not_found' };

  const supabase = await createClient();
  const result = await renameLocationRpc(supabase, input.locationId, input.name);
  if (result.status === 'success') refreshEverywhere();
  return result;
}

export async function setStoreActive(formData: FormData): Promise<LocationManageResult<{ isActive: boolean; changed: boolean }>> {
  const input = parseSetLocationActiveInput(formData);
  if (!input) return { status: 'error', code: 'invalid_input' };
  const tenant = await resolveTenant();
  if (!tenant.ok) return { status: 'error', code: tenant.code };
  if (!(await storeOfTenant(tenant.tenantId, input.locationId, { activeOnly: false }))) return { status: 'error', code: 'location_not_found' };

  const supabase = await createClient();
  const result = await setLocationActiveRpc(supabase, input.locationId, input.isActive);
  if (result.status === 'success') refreshEverywhere();
  return result;
}

/** 「別の店舗へ移動」: the target must be an OPEN store of the active tenant; the RPC checks the employee's tenant, rights, future shifts. */
export async function moveEmployeeToStore(formData: FormData): Promise<LocationManageResult<MoveEmployeeOutcome>> {
  const input = parseMoveEmployeeInput(formData);
  if (!input) return { status: 'error', code: 'invalid_input' };
  const tenant = await resolveTenant();
  if (!tenant.ok) return { status: 'error', code: tenant.code };
  if (!(await storeOfTenant(tenant.tenantId, input.locationId, { activeOnly: true }))) return { status: 'error', code: 'location_not_found' };

  const supabase = await createClient();
  const result = await moveEmployeeLocationRpc(supabase, input.employeeId, input.locationId);
  if (result.status === 'success') refreshEverywhere();
  return result;
}
