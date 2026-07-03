import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAuthBoundaryResultToHttpResponse } from './auth-boundary.response.js';
import type { AuthBoundaryResult } from './auth-boundary.service.js';

const PERMISSION = 'core.audit.read';
const TENANT_ID = 'a1111111-1111-1111-1111-111111111111';
const LOCATION_ID = 'b2222222-2222-2222-2222-222222222222';

const FORBIDDEN_KEYS = [
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'email',
  'userId',
  'user_id',
  'authUserId',
  'membershipId',
  'membership_id',
  'role',
  'roles',
  'permissions',
  'isPlatformStaff',
  'hash',
  'stack',
];

function assertNoForbiddenKeys(body: Record<string, unknown>) {
  for (const key of FORBIDDEN_KEYS) {
    assert.ok(!(key in body), `response body must not contain "${key}"`);
  }
}

test('unauthorized -> 401 { error: "unauthorized" }, nothing else', () => {
  const result: AuthBoundaryResult = { status: 'unauthorized' };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 401);
  assert.deepEqual(body, { error: 'unauthorized' });
  assertNoForbiddenKeys(body);
});

test('bad_request (tenant_id) -> 400 { error: "bad_request" }, no field-specific leak', () => {
  const result: AuthBoundaryResult = { status: 'bad_request', field: 'tenant_id' };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 400);
  assert.deepEqual(body, { error: 'bad_request' });
});

test('bad_request (location_id) -> 400 { error: "bad_request" }', () => {
  const result: AuthBoundaryResult = { status: 'bad_request', field: 'location_id' };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 400);
  assert.deepEqual(body, { error: 'bad_request' });
});

test('forbidden -> 403 { error: "forbidden" }, no tenant/permission echoed', () => {
  const result: AuthBoundaryResult = { status: 'forbidden' };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 403);
  assert.deepEqual(body, { error: 'forbidden' });
  assert.ok(!('tenantId' in body));
  assert.ok(!('permission' in body));
});

test('unexpected_error -> 500 { error: "unexpected_error" }, no raw error text', () => {
  const result: AuthBoundaryResult = { status: 'unexpected_error' };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 500);
  assert.deepEqual(body, { error: 'unexpected_error' });
});

test('ok -> 200 with exactly the suggested safe shape', () => {
  const result: AuthBoundaryResult = { status: 'ok', tenantId: TENANT_ID, locationId: LOCATION_ID };
  const { status, body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    status: 'ok',
    authenticated: true,
    permissionChecked: true,
    permission: PERMISSION,
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
  });
  assertNoForbiddenKeys(body);
});

test('ok with null locationId -> locationId is null, not omitted', () => {
  const result: AuthBoundaryResult = { status: 'ok', tenantId: TENANT_ID, locationId: null };
  const { body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
  assert.equal(body.locationId, null);
});

test('every error-status body is exactly { error: <code> } and nothing more', () => {
  const cases: AuthBoundaryResult[] = [
    { status: 'unauthorized' },
    { status: 'bad_request', field: 'tenant_id' },
    { status: 'forbidden' },
    { status: 'unexpected_error' },
  ];
  for (const result of cases) {
    const { body } = mapAuthBoundaryResultToHttpResponse(result, PERMISSION);
    assert.equal(Object.keys(body).length, 1);
    assert.ok('error' in body);
  }
});
