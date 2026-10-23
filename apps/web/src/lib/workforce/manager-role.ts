import type { SupabaseClient } from '@supabase/supabase-js';
import { parseUuid } from './validation';

/**
 * Manager appointment (4B-4a, migration 0138, DEBT-091 a). The Owner/Admin
 * (`core.role.manage`, tenant-wide) appoints or revokes a Manager from the
 * staff list. `api.set_employee_manager_role` is the only enforcement point
 * (permission, tenant, active employee with an account, never the caller's own
 * row, idempotent, audited); `hasRoleManageAccess` only decides whether the UI
 * offers the action.
 */

export type ManagerRoleErrorCode =
  | 'invalid_input'
  | 'not_authenticated'
  | 'permission_denied'
  | 'module_disabled'
  | 'employee_not_found'
  | 'employee_inactive'
  | 'employee_has_no_account'
  | 'cannot_change_own_role'
  | 'unexpected';

export type ManagerRoleResult =
  | { status: 'success'; data: { employeeId: string; isManager: boolean; changed: boolean } }
  | { status: 'error'; code: ManagerRoleErrorCode };

export interface SetManagerRoleInput {
  employeeId: string;
  isManager: boolean;
}

/** `staffId` must be a UUID; `isManager` must be exactly 'true' or 'false' (no implicit default -- a missing flag must never demote). */
export function parseSetManagerRoleInput(formData: FormData): SetManagerRoleInput | null {
  const employeeId = parseUuid(formData.get('staffId'));
  const raw = formData.get('isManager');
  if (!employeeId || (raw !== 'true' && raw !== 'false')) return null;
  return { employeeId, isManager: raw === 'true' };
}

/** Maps a PostgREST error from `api.set_employee_manager_role` to a stable code (by SQLSTATE + the function's own message identifiers). */
export function mapManagerRoleError(error: { code?: string | null; message?: string | null } | null | undefined): ManagerRoleErrorCode {
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

type ManagerRoleCopyKey =
  | 'managerRoleErrorPermission'
  | 'managerRoleErrorNotFound'
  | 'managerRoleErrorModule'
  | 'managerRoleErrorUnexpected'
  | 'managerInactiveHint'
  | 'managerNeedsAccountHint'
  | 'managerOwnRoleHint';

/** Dictionary key (manager-dashboard-i18n.ts) for each error code -- every code has user-facing JA/EN copy. */
export function managerRoleErrorCopyKey(code: ManagerRoleErrorCode): ManagerRoleCopyKey {
  switch (code) {
    case 'permission_denied':
    case 'not_authenticated':
      return 'managerRoleErrorPermission';
    case 'employee_not_found':
      return 'managerRoleErrorNotFound';
    case 'module_disabled':
      return 'managerRoleErrorModule';
    case 'employee_inactive':
      return 'managerInactiveHint';
    case 'employee_has_no_account':
      return 'managerNeedsAccountHint';
    case 'cannot_change_own_role':
      return 'managerOwnRoleHint';
    case 'invalid_input':
    case 'unexpected':
      return 'managerRoleErrorUnexpected';
  }
}

/** Why the appoint/revoke button is disabled for a row, or null when it is available. Mirrors the RPC's refusals (the RPC stays authoritative). */
export function managerRoleBlockReason(
  entry: { staffId: string; isActive: boolean; hasAccountAccess: boolean; isManager: boolean },
  selfStaffId: string | null,
): 'managerOwnRoleHint' | 'managerNeedsAccountHint' | 'managerInactiveHint' | null {
  if (selfStaffId !== null && entry.staffId === selfStaffId) return 'managerOwnRoleHint';
  // Revoking is always possible for a Manager row (except one's own); appointing needs an active bound account.
  if (entry.isManager) return null;
  if (!entry.hasAccountAccess) return 'managerNeedsAccountHint';
  if (!entry.isActive) return 'managerInactiveHint';
  return null;
}

export async function setEmployeeManagerRole(
  supabase: SupabaseClient,
  tenantId: string,
  input: SetManagerRoleInput,
): Promise<ManagerRoleResult> {
  try {
    const { data, error } = await supabase.schema('api').rpc('set_employee_manager_role', {
      p_tenant_id: tenantId,
      p_employee_id: input.employeeId,
      p_is_manager: input.isManager,
    });
    if (error) return { status: 'error', code: mapManagerRoleError(error) };
    const row = data as { employee_id?: string; is_manager?: boolean; changed?: boolean } | null;
    if (!row || typeof row.is_manager !== 'boolean') return { status: 'error', code: 'unexpected' };
    return { status: 'success', data: { employeeId: input.employeeId, isManager: row.is_manager, changed: row.changed === true } };
  } catch {
    return { status: 'error', code: 'unexpected' };
  }
}

/** Server-side pre-check: does the caller hold `core.role.manage` tenant-wide (Owner/Admin)? Same check the RPC makes; fails closed. */
export async function hasRoleManageAccess(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.schema('api').rpc('has_permission', {
      p_tenant_id: tenantId,
      p_permission: 'core.role.manage',
      p_location_id: null,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
