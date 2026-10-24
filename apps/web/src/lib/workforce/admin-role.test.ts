import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminRoleBlockReason,
  adminRoleErrorCopyKey,
  isTenantOwner,
  mapAdminRoleError,
  parseSetAdminRoleInput,
  setEmployeeAdminRole,
  type AdminRoleErrorCode,
} from './admin-role.js';
import { recordingClient } from './test-helpers.js';
import { tManagerDashboard } from '../../app/(protected)/manager/manager-dashboard-i18n.js';

const STAFF_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

test('parseSetAdminRoleInput accepts a UUID and an explicit true/false', () => {
  assert.deepEqual(parseSetAdminRoleInput(form({ staffId: STAFF_ID, isAdmin: 'true' })), { employeeId: STAFF_ID, isAdmin: true });
  assert.deepEqual(parseSetAdminRoleInput(form({ staffId: STAFF_ID.toUpperCase(), isAdmin: 'false' })), { employeeId: STAFF_ID, isAdmin: false });
});

test('parseSetAdminRoleInput rejects a bad id or a missing / fuzzy flag (a missing flag must never demote)', () => {
  assert.equal(parseSetAdminRoleInput(form({ staffId: 'not-a-uuid', isAdmin: 'true' })), null);
  assert.equal(parseSetAdminRoleInput(form({ staffId: STAFF_ID })), null);
  assert.equal(parseSetAdminRoleInput(form({ staffId: STAFF_ID, isAdmin: '1' })), null);
  assert.equal(parseSetAdminRoleInput(form({ staffId: STAFF_ID, isAdmin: 'TRUE' })), null);
  assert.equal(parseSetAdminRoleInput(form({ staffId: STAFF_ID, isManager: 'true' })), null, 'the manager flag is not accepted for the admin action');
  assert.equal(parseSetAdminRoleInput(form({ isAdmin: 'true' })), null);
});

test('mapAdminRoleError maps every RPC refusal to its own code', () => {
  assert.equal(mapAdminRoleError({ code: '42501', message: 'permission_denied' }), 'permission_denied');
  assert.equal(mapAdminRoleError({ code: '28000', message: 'not_authenticated' }), 'not_authenticated');
  assert.equal(mapAdminRoleError({ code: 'P0001', message: 'workforce_module_disabled' }), 'module_disabled');
  assert.equal(mapAdminRoleError({ code: 'P0002', message: 'employee_not_found' }), 'employee_not_found');
  assert.equal(mapAdminRoleError({ code: 'P0001', message: 'employee_inactive' }), 'employee_inactive');
  assert.equal(mapAdminRoleError({ code: 'P0001', message: 'employee_has_no_account' }), 'employee_has_no_account');
  assert.equal(mapAdminRoleError({ code: 'P0001', message: 'cannot_change_own_role' }), 'cannot_change_own_role');
  assert.equal(mapAdminRoleError({ code: '22004', message: 'invalid_argument: ...' }), 'invalid_input');
  assert.equal(mapAdminRoleError({ code: 'P0001', message: 'role_missing' }), 'unexpected');
  assert.equal(mapAdminRoleError({ code: 'XX000', message: 'boom' }), 'unexpected');
  assert.equal(mapAdminRoleError(null), 'unexpected');
});

test('every error code has non-empty JA and EN copy, and the agreed JA texts', () => {
  const codes: AdminRoleErrorCode[] = [
    'invalid_input', 'not_authenticated', 'permission_denied', 'module_disabled', 'employee_not_found',
    'employee_inactive', 'employee_has_no_account', 'cannot_change_own_role', 'unexpected',
  ];
  for (const code of codes) {
    const key = adminRoleErrorCopyKey(code);
    assert.ok(tManagerDashboard('ja', key).length > 0, `ja copy for ${code}`);
    assert.ok(tManagerDashboard('en', key).length > 0, `en copy for ${code}`);
    assert.notEqual(tManagerDashboard('ja', key), tManagerDashboard('en', key), `ja and en differ for ${code}`);
  }
  assert.equal(tManagerDashboard('ja', adminRoleErrorCopyKey('permission_denied')), '管理者の任命はオーナーだけができます。');
  assert.equal(tManagerDashboard('ja', 'adminBadge'), '管理者');
  assert.equal(tManagerDashboard('en', 'adminBadge'), 'Admin');
  assert.equal(tManagerDashboard('ja', 'appointAdmin'), '管理者にする');
  assert.equal(tManagerDashboard('ja', 'revokeAdmin'), '管理者から外す');
});

test('adminRoleBlockReason mirrors the RPC refusals', () => {
  const base = { staffId: 's1', isActive: true, hasAccountAccess: true, isAdmin: false };
  assert.equal(adminRoleBlockReason(base, null), null);
  assert.equal(adminRoleBlockReason(base, 's1'), 'adminOwnRoleHint');
  assert.equal(adminRoleBlockReason({ ...base, hasAccountAccess: false }, null), 'adminNeedsAccountHint');
  assert.equal(adminRoleBlockReason({ ...base, isActive: false }, null), 'adminInactiveHint');
  assert.equal(adminRoleBlockReason({ ...base, isAdmin: true }, null), null, 'an Admin row can always be revoked');
  assert.equal(adminRoleBlockReason({ ...base, isAdmin: true }, 's1'), 'adminOwnRoleHint');
});

test('setEmployeeAdminRole calls api.set_employee_admin_role and maps the result', async () => {
  const { client, calls } = recordingClient({ data: { employee_id: STAFF_ID, is_admin: true, changed: true }, error: null });
  const result = await setEmployeeAdminRole(client, 'tenant-a', { employeeId: STAFF_ID, isAdmin: true });
  assert.deepEqual(result, { status: 'success', data: { employeeId: STAFF_ID, isAdmin: true, changed: true } });
  assert.deepEqual(calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(calls[1], { method: 'rpc', args: ['set_employee_admin_role', { p_tenant_id: 'tenant-a', p_employee_id: STAFF_ID, p_is_admin: true }] });
});

test('setEmployeeAdminRole maps an RPC error, an empty result and a manager-shaped result', async () => {
  const denied = recordingClient({ data: null, error: { code: '42501', message: 'permission_denied' } });
  assert.deepEqual(await setEmployeeAdminRole(denied.client, 't', { employeeId: STAFF_ID, isAdmin: false }), { status: 'error', code: 'permission_denied' });
  const empty = recordingClient({ data: null, error: null });
  assert.deepEqual(await setEmployeeAdminRole(empty.client, 't', { employeeId: STAFF_ID, isAdmin: false }), { status: 'error', code: 'unexpected' });
  const wrongShape = recordingClient({ data: { employee_id: STAFF_ID, is_manager: true, changed: true }, error: null });
  assert.deepEqual(await setEmployeeAdminRole(wrongShape.client, 't', { employeeId: STAFF_ID, isAdmin: true }), { status: 'error', code: 'unexpected' });
});

test('isTenantOwner calls api.is_tenant_owner and fails closed', async () => {
  const yes = recordingClient({ data: true, error: null });
  assert.equal(await isTenantOwner(yes.client, 'tenant-a'), true);
  assert.deepEqual(yes.calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(yes.calls[1], { method: 'rpc', args: ['is_tenant_owner', { p_tenant_id: 'tenant-a' }] });
  const no = recordingClient({ data: false, error: null });
  assert.equal(await isTenantOwner(no.client, 'tenant-a'), false);
  const err = recordingClient({ data: true, error: { code: 'XX000', message: 'boom' } });
  assert.equal(await isTenantOwner(err.client, 'tenant-a'), false);
  const odd = recordingClient({ data: 'true', error: null });
  assert.equal(await isTenantOwner(odd.client, 'tenant-a'), false, 'only a real boolean true counts');
});
