import type { SupabaseClient } from '@supabase/supabase-js';
import { parseUuid } from './validation';

/**
 * Admin appointment (4B-4b, migration 0140). Only the Owner (holder of the
 * system `tenant_owner` role assignment -- not a permission, since an Admin
 * holds every permission an Owner uses here) appoints or revokes an Admin
 * (管理者) from the staff list. `api.set_employee_admin_role` is the only
 * enforcement point (Owner role, tenant, active employee with an account,
 * never the caller's own row, idempotent, audited); `isTenantOwner` only
 * decides whether the UI offers the action. Mirrors `manager-role.ts`.
 */

export type AdminRoleErrorCode =
  | 'invalid_input'
  | 'not_authenticated'
  | 'permission_denied'
  | 'module_disabled'
  | 'employee_not_found'
  | 'employee_inactive'
  | 'employee_has_no_account'
  | 'cannot_change_own_role'
  | 'unexpected';

export type AdminRoleResult =
  | { status: 'success'; data: { employeeId: string; isAdmin: boolean; changed: boolean } }
  | { status: 'error'; code: AdminRoleErrorCode };

export interface SetAdminRoleInput {
  employeeId: string;
  isAdmin: boolean;
}

/** `staffId` must be a UUID; `isAdmin` must be exactly 'true' or 'false' (no implicit default -- a missing flag must never demote). */
export function parseSetAdminRoleInput(formData: FormData): SetAdminRoleInput | null {
  const employeeId = parseUuid(formData.get('staffId'));
  const raw = formData.get('isAdmin');
  if (!employeeId || (raw !== 'true' && raw !== 'false')) return null;
  return { employeeId, isAdmin: raw === 'true' };
}

/** Maps a PostgREST error from `api.set_employee_admin_role` to a stable code (by SQLSTATE + the function's own message identifiers). */
export function mapAdminRoleError(error: { code?: string | null; message?: string | null } | null | undefined): AdminRoleErrorCode {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  if (code === '28000' || message.includes('not_authenticated')) return 'not_authenticated';
  if (code === '42501' || message.includes('permission_denied')) return 'permission_denied';
  if (message.includes('workforce_module_disabled')) return 'module_disabled';
  if (code === 'P0002' || message.includes('employee_not_found')) return 'employee_not_found';
  if (message.includes('employee_inactive')) return 'employee_inactive';
  if (message.includes('employee_has_no_account')) return 'employee_has_no_account';
  if (message.includes('cannot_change_own_role')) return 'cannot_change_own_role';
  if (code === '22004' || code === '22P02') return 'invalid_input';
  return 'unexpected';
}

type AdminRoleCopyKey =
  | 'adminRoleErrorPermission'
  | 'adminRoleErrorNotFound'
  | 'adminRoleErrorModule'
  | 'adminRoleErrorSession'
  | 'adminRoleErrorUnexpected'
  | 'adminInactiveHint'
  | 'adminNeedsAccountHint'
  | 'adminOwnRoleHint';

/** Dictionary key (manager-dashboard-i18n.ts) for each error code -- every code has user-facing JA/EN copy. */
export function adminRoleErrorCopyKey(code: AdminRoleErrorCode): AdminRoleCopyKey {
  switch (code) {
    case 'permission_denied':
      return 'adminRoleErrorPermission';
    case 'not_authenticated':
      return 'adminRoleErrorSession';
    case 'employee_not_found':
      return 'adminRoleErrorNotFound';
    case 'module_disabled':
      return 'adminRoleErrorModule';
    case 'employee_inactive':
      return 'adminInactiveHint';
    case 'employee_has_no_account':
      return 'adminNeedsAccountHint';
    case 'cannot_change_own_role':
      return 'adminOwnRoleHint';
    case 'invalid_input':
    case 'unexpected':
      return 'adminRoleErrorUnexpected';
  }
}

/**
 * Why the appoint/revoke button is disabled for a row, or null when it is
 * available. Mirrors the RPC's refusals (the RPC stays authoritative). Unlike
 * the Manager role, the RPC refuses an inactive row for revoke too -- but an
 * inactive row never holds the Admin role (deactivation removes it, 0140), so
 * "an Admin row can always be revoked" still holds in practice.
 */
export function adminRoleBlockReason(
  entry: { staffId: string; isActive: boolean; hasAccountAccess: boolean; isAdmin: boolean },
  selfStaffId: string | null,
): 'adminOwnRoleHint' | 'adminNeedsAccountHint' | 'adminInactiveHint' | null {
  if (selfStaffId !== null && entry.staffId === selfStaffId) return 'adminOwnRoleHint';
  if (entry.isAdmin) return null;
  if (!entry.hasAccountAccess) return 'adminNeedsAccountHint';
  if (!entry.isActive) return 'adminInactiveHint';
  return null;
}

export async function setEmployeeAdminRole(
  supabase: SupabaseClient,
  tenantId: string,
  input: SetAdminRoleInput,
): Promise<AdminRoleResult> {
  try {
    const { data, error } = await supabase.schema('api').rpc('set_employee_admin_role', {
      p_tenant_id: tenantId,
      p_employee_id: input.employeeId,
      p_is_admin: input.isAdmin,
    });
    if (error) return { status: 'error', code: mapAdminRoleError(error) };
    const row = data as { employee_id?: string; is_admin?: boolean; changed?: boolean } | null;
    if (!row || typeof row.is_admin !== 'boolean') return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { employeeId: input.employeeId, isAdmin: row.is_admin, changed: row.changed === true } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

/** Server-side pre-check: does the caller hold the `tenant_owner` role in this tenant (`api.is_tenant_owner`)? Same check the RPC makes; fails closed. */
export async function isTenantOwner(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('is_tenant_owner', { p_tenant_id: tenantId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
