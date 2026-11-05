import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultManagerScope,
  hasRoleManageAccess,
  managerRoleBlockReason,
  managerScopeChoiceAvailable,
  parseManagerScope,
  managerRoleErrorCopyKey,
  mapManagerRoleError,
  parseSetManagerRoleInput,
  setEmployeeManagerRole,
  type ManagerRoleErrorCode,
} from './manager-role.js';
import { recordingClient } from './test-helpers.js';
import { tManagerDashboard } from '../../app/(protected)/manager/manager-dashboard-i18n.js';

const STAFF_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

test('parseSetManagerRoleInput accepts a UUID, an explicit true/false and an explicit scope', () => {
  assert.deepEqual(parseSetManagerRoleInput(form({ staffId: STAFF_ID, isManager: 'true', scope: 'location' })), {
    employeeId: STAFF_ID,
    isManager: true,
    scope: 'location',
  });
  assert.deepEqual(parseSetManagerRoleInput(form({ staffId: STAFF_ID.toUpperCase(), isManager: 'false', scope: 'tenant' })), {
    employeeId: STAFF_ID,
    isManager: false,
    scope: 'tenant',
  });
});

test('parseSetManagerRoleInput rejects a bad id, a missing / fuzzy flag or scope (a missing scope must never widen)', () => {
  assert.equal(parseSetManagerRoleInput(form({ staffId: 'not-a-uuid', isManager: 'true', scope: 'tenant' })), null);
  assert.equal(parseSetManagerRoleInput(form({ staffId: STAFF_ID, scope: 'tenant' })), null);
  assert.equal(parseSetManagerRoleInput(form({ staffId: STAFF_ID, isManager: '1', scope: 'tenant' })), null);
  assert.equal(parseSetManagerRoleInput(form({ staffId: STAFF_ID, isManager: 'TRUE', scope: 'tenant' })), null);
  assert.equal(parseSetManagerRoleInput(form({ isManager: 'true', scope: 'tenant' })), null);
  assert.equal(parseSetManagerRoleInput(form({ staffId: STAFF_ID, isManager: 'true' })), null, 'no scope');
  for (const bad of ['', 'Tenant', 'all', 'store', ' location']) {
    assert.equal(parseSetManagerRoleInput(form({ staffId: STAFF_ID, isManager: 'true', scope: bad })), null, bad);
  }
});

test('parseManagerScope is strict; scope choice only with two or more open stores (default: this store only)', () => {
  assert.equal(parseManagerScope('tenant'), 'tenant');
  assert.equal(parseManagerScope('location'), 'location');
  for (const bad of [null, undefined, '', 'TENANT', 1, {}]) assert.equal(parseManagerScope(bad), null);
  assert.equal(managerScopeChoiceAvailable(0), false);
  assert.equal(managerScopeChoiceAvailable(1), false);
  assert.equal(managerScopeChoiceAvailable(2), true);
  assert.equal(defaultManagerScope(1), 'tenant', 'one store: tenant-wide, as before L3');
  assert.equal(defaultManagerScope(2), 'location');
  assert.equal(defaultManagerScope(3), 'location');
});

test('mapManagerRoleError maps every RPC refusal to its own code', () => {
  assert.equal(mapManagerRoleError({ code: '42501', message: 'permission_denied' }), 'permission_denied');
  assert.equal(mapManagerRoleError({ code: '28000', message: 'not_authenticated' }), 'not_authenticated');
  assert.equal(mapManagerRoleError({ code: 'P0001', message: 'workforce_module_disabled' }), 'module_disabled');
  assert.equal(mapManagerRoleError({ code: 'P0002', message: 'employee_not_found' }), 'employee_not_found');
  assert.equal(mapManagerRoleError({ code: 'P0001', message: 'employee_inactive' }), 'employee_inactive');
  assert.equal(mapManagerRoleError({ code: 'P0001', message: 'employee_has_no_account' }), 'employee_has_no_account');
  assert.equal(mapManagerRoleError({ code: 'P0001', message: 'cannot_change_own_role' }), 'cannot_change_own_role');
  assert.equal(mapManagerRoleError({ code: 'P0001', message: 'employee_has_no_location' }), 'employee_has_no_location');
  assert.equal(mapManagerRoleError({ code: '22004', message: 'invalid_argument: ...' }), 'invalid_input');
  assert.equal(mapManagerRoleError({ code: '22023', message: 'invalid_argument: scope must be tenant or location' }), 'invalid_input');
  assert.equal(mapManagerRoleError({ code: 'XX000', message: 'boom' }), 'unexpected');
  assert.equal(mapManagerRoleError(null), 'unexpected');
});

test('every error code has non-empty JA and EN copy, and the no-account hint is the agreed JA text', () => {
  const codes: ManagerRoleErrorCode[] = [
    'invalid_input', 'not_authenticated', 'permission_denied', 'module_disabled', 'employee_not_found',
    'employee_inactive', 'employee_has_no_account', 'employee_has_no_location', 'cannot_change_own_role', 'unexpected',
  ];
  for (const code of codes) {
    const key = managerRoleErrorCopyKey(code);
    assert.ok(tManagerDashboard('ja', key).length > 0, `ja copy for ${code}`);
    assert.ok(tManagerDashboard('en', key).length > 0, `en copy for ${code}`);
    assert.notEqual(tManagerDashboard('ja', key), tManagerDashboard('en', key), `ja and en differ for ${code}`);
  }
  assert.equal(tManagerDashboard('ja', managerRoleErrorCopyKey('employee_has_no_account')), '招待を承認していないスタッフは店長にできません。');
  assert.equal(tManagerDashboard('ja', 'appointManager'), '店長にする');
  assert.equal(tManagerDashboard('ja', 'revokeManager'), '店長から外す');
  assert.equal(tManagerDashboard('ja', 'managerBadge'), '店長');
});

test('managerRoleBlockReason mirrors the RPC refusals', () => {
  const base = { staffId: 's1', isActive: true, hasAccountAccess: true, isManager: false };
  assert.equal(managerRoleBlockReason(base, null), null);
  assert.equal(managerRoleBlockReason(base, 's1'), 'managerOwnRoleHint');
  assert.equal(managerRoleBlockReason({ ...base, hasAccountAccess: false }, null), 'managerNeedsAccountHint');
  assert.equal(managerRoleBlockReason({ ...base, isActive: false }, null), 'managerInactiveHint');
  assert.equal(managerRoleBlockReason({ ...base, isManager: true }, null), null, 'a Manager row can always be revoked');
  assert.equal(managerRoleBlockReason({ ...base, isManager: true }, 's1'), 'managerOwnRoleHint');
});

test('setEmployeeManagerRole always calls the 4-argument api.set_employee_manager_role (p_scope) and maps the result', async () => {
  const { client, calls } = recordingClient({ data: { employee_id: STAFF_ID, is_manager: true, scope: 'location', changed: true }, error: null });
  const result = await setEmployeeManagerRole(client, 'tenant-a', { employeeId: STAFF_ID, isManager: true, scope: 'location' });
  assert.deepEqual(result, { status: 'success', data: { employeeId: STAFF_ID, isManager: true, scope: 'location', changed: true } });
  assert.deepEqual(calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(calls[1], {
    method: 'rpc',
    args: ['set_employee_manager_role', { p_tenant_id: 'tenant-a', p_employee_id: STAFF_ID, p_is_manager: true, p_scope: 'location' }],
  });
  const revoked = recordingClient({ data: { employee_id: STAFF_ID, is_manager: false, scope: null, changed: true }, error: null });
  assert.deepEqual(await setEmployeeManagerRole(revoked.client, 't', { employeeId: STAFF_ID, isManager: false, scope: 'tenant' }), {
    status: 'success',
    data: { employeeId: STAFF_ID, isManager: false, scope: null, changed: true },
  });
});

test('setEmployeeManagerRole maps an RPC error and an empty result', async () => {
  const denied = recordingClient({ data: null, error: { code: '42501', message: 'permission_denied' } });
  assert.deepEqual(await setEmployeeManagerRole(denied.client, 't', { employeeId: STAFF_ID, isManager: false, scope: 'tenant' }), { status: 'error', code: 'permission_denied' });
  const empty = recordingClient({ data: null, error: null });
  assert.deepEqual(await setEmployeeManagerRole(empty.client, 't', { employeeId: STAFF_ID, isManager: false, scope: 'tenant' }), { status: 'error', code: 'unexpected' });
});

test('hasRoleManageAccess checks core.role.manage tenant-wide and fails closed', async () => {
  const yes = recordingClient({ data: true, error: null });
  assert.equal(await hasRoleManageAccess(yes.client, 'tenant-a'), true);
  assert.deepEqual(yes.calls[1], { method: 'rpc', args: ['has_permission', { p_tenant_id: 'tenant-a', p_permission: 'core.role.manage', p_location_id: null }] });
  const err = recordingClient({ data: true, error: { code: 'XX000', message: 'boom' } });
  assert.equal(await hasRoleManageAccess(err.client, 'tenant-a'), false);
});
