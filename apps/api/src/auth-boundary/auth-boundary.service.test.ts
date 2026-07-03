import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { createUserClient } from '@line-os/db/client';
import { evaluateAuthBoundaryRequest } from './auth-boundary.service.js';

const TENANT_ID = 'a1111111-1111-1111-1111-111111111111';
const LOCATION_ID = 'b2222222-2222-2222-2222-222222222222';
const PERMISSION = 'core.audit.read';

interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * Stubs the shape `createUserClient(token)` returns, so the service is
 * unit-tested without a live Supabase instance (mirrors the existing
 * apps/web pattern, e.g. apps/web/src/lib/tenant/admin-members.test.ts).
 */
function stubCreateClient(opts: {
  authUser?: { id: string } | null;
  authError?: unknown;
  rpcData?: unknown;
  rpcError?: { message: string } | null;
}) {
  const calls: RecordedCall[] = [];

  const createClient = (token: string) => {
    calls.push({ method: 'createClient', args: [token] });
    return {
      auth: {
        getUser: async () => {
          calls.push({ method: 'auth.getUser', args: [] });
          if (opts.authError) return { data: { user: null }, error: opts.authError };
          return { data: { user: opts.authUser === undefined ? { id: 'user-1' } : opts.authUser }, error: null };
        },
      },
      schema: (name: string) => {
        calls.push({ method: 'schema', args: [name] });
        return {
          rpc: async (fn: string, params: unknown) => {
            calls.push({ method: 'rpc', args: [fn, params] });
            return { data: opts.rpcData ?? true, error: opts.rpcError ?? null };
          },
        };
      },
    };
  };

  return { createClient: createClient as unknown as typeof createUserClient, calls };
}

test('missing Authorization header -> unauthorized, no client created', async () => {
  const { createClient, calls } = stubCreateClient({});
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: undefined, tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'unauthorized' });
  assert.equal(calls.length, 0);
});

test('malformed Authorization header -> unauthorized, no client created', async () => {
  const { createClient, calls } = stubCreateClient({});
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Basic abc123', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'unauthorized' });
  assert.equal(calls.length, 0);
});

test('auth.getUser returns an error -> unauthorized', async () => {
  const { createClient } = stubCreateClient({ authError: { message: 'invalid token' } });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'unauthorized' });
});

test('auth.getUser returns no user -> unauthorized', async () => {
  const { createClient } = stubCreateClient({ authUser: null });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'unauthorized' });
});

test('missing tenant_id -> bad_request (after successful auth)', async () => {
  const { createClient, calls } = stubCreateClient({});
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: undefined, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'bad_request', field: 'tenant_id' });
  // auth was verified before the tenant_id shape check, but the RPC was never reached.
  assert.ok(calls.some((c) => c.method === 'auth.getUser'));
  assert.ok(!calls.some((c) => c.method === 'rpc'));
});

test('invalid tenant_id -> bad_request', async () => {
  const { createClient } = stubCreateClient({});
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: 'not-a-uuid', locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'bad_request', field: 'tenant_id' });
});

test('invalid location_id -> bad_request', async () => {
  const { createClient } = stubCreateClient({});
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: 'garbage' },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'bad_request', field: 'location_id' });
});

test('omitted location_id is treated as null, not an error', async () => {
  const { createClient } = stubCreateClient({ rpcData: true });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'ok', tenantId: TENANT_ID, locationId: null });
});

test('permission false -> forbidden', async () => {
  const { createClient } = stubCreateClient({ rpcData: false });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'forbidden' });
});

test('permission true -> ok, with tenantId/locationId echoed back', async () => {
  const { createClient } = stubCreateClient({ rpcData: true });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: LOCATION_ID },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'ok', tenantId: TENANT_ID, locationId: LOCATION_ID });
});

test('RPC error maps to unexpected_error and never carries the raw error text', async () => {
  const { createClient } = stubCreateClient({ rpcError: { message: 'relation "core.role_assignments" does not exist' } });
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );
  assert.deepEqual(result, { status: 'unexpected_error' });
  assert.ok(!JSON.stringify(result).includes('role_assignments'));
});

test('thrown error (e.g. createClient/network failure) maps to unexpected_error, not a crash', async () => {
  const throwingCreateClient: typeof createUserClient = () => {
    throw new Error('ECONNREFUSED 127.0.0.1:54321');
  };
  const result = await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer good.shape.token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    throwingCreateClient,
  );
  assert.deepEqual(result, { status: 'unexpected_error' });
  assert.ok(!JSON.stringify(result).includes('ECONNREFUSED'));
});

test('calls api.has_permission with exactly the expected RPC contract shape', async () => {
  const { createClient, calls } = stubCreateClient({ rpcData: true });
  await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer my-token', tenantIdParam: TENANT_ID, locationIdParam: LOCATION_ID },
    PERMISSION,
    createClient,
  );

  assert.deepEqual(calls.find((c) => c.method === 'createClient')?.args, ['my-token']);
  assert.deepEqual(calls.find((c) => c.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((c) => c.method === 'rpc')?.args, [
    'has_permission',
    { p_tenant_id: TENANT_ID, p_permission: PERMISSION, p_location_id: LOCATION_ID },
  ]);
});

test('the has_permission RPC call always includes p_tenant_id set to the validated tenant_id', async () => {
  const { createClient, calls } = stubCreateClient({ rpcData: true });
  await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer my-token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );

  const rpcCall = calls.find((c) => c.method === 'rpc');
  assert.ok(rpcCall, 'expected the has_permission RPC to be called');
  const params = rpcCall?.args[1] as Record<string, unknown>;

  // Regression guard: the RPC must never be called without p_tenant_id (a
  // permission check with no tenant scope is not a valid authorization
  // decision - core.has_permission requires it).
  assert.ok('p_tenant_id' in params, 'has_permission RPC call is missing p_tenant_id');
  assert.equal(params.p_tenant_id, TENANT_ID);
  assert.deepEqual(Object.keys(params).sort(), ['p_location_id', 'p_permission', 'p_tenant_id']);
});

test('never calls .schema("core") or .schema("audit")', async () => {
  const { createClient, calls } = stubCreateClient({ rpcData: true });
  await evaluateAuthBoundaryRequest(
    { authorizationHeader: 'Bearer my-token', tenantIdParam: TENANT_ID, locationIdParam: undefined },
    PERMISSION,
    createClient,
  );

  const schemaTargets = calls.filter((c) => c.method === 'schema').flatMap((c) => c.args);
  assert.ok(!schemaTargets.includes('core'));
  assert.ok(!schemaTargets.includes('audit'));
});
