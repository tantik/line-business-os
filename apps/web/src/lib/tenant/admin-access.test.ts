import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasTenantAdminAccess } from './admin-access.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

function recordingClient(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['schema', 'rpc']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

function throwingClient(): SupabaseClient {
  const builder: Record<string, unknown> = {};
  builder.schema = () => builder;
  builder.rpc = () => {
    throw new Error('network error');
  };
  return builder as unknown as SupabaseClient;
}

const TENANT_ID = 'tenant-a';

test('hasTenantAdminAccess returns true when api.has_permission reports the caller holds core.member.invite', async () => {
  const { client } = recordingClient({ data: true, error: null });
  const result = await hasTenantAdminAccess(client, TENANT_ID);
  assert.equal(result, true);
});

test('hasTenantAdminAccess returns false when api.has_permission reports the caller does not hold the permission (Staff)', async () => {
  const { client } = recordingClient({ data: false, error: null });
  const result = await hasTenantAdminAccess(client, TENANT_ID);
  assert.equal(result, false);
});

test('hasTenantAdminAccess fails closed to false on an RPC error', async () => {
  const { client } = recordingClient({ data: null, error: { code: 'XX000', message: 'boom' } });
  const result = await hasTenantAdminAccess(client, TENANT_ID);
  assert.equal(result, false);
});

test('hasTenantAdminAccess fails closed to false when the RPC call throws', async () => {
  const result = await hasTenantAdminAccess(throwingClient(), TENANT_ID);
  assert.equal(result, false);
});

test('hasTenantAdminAccess calls api.has_permission with the core.member.invite key, tenant-scoped with no location', async () => {
  const { client, calls } = recordingClient({ data: true, error: null });
  await hasTenantAdminAccess(client, TENANT_ID);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  const rpcCall = calls.find((call) => call.method === 'rpc');
  assert.equal(rpcCall?.args[0], 'has_permission');
  assert.deepEqual(rpcCall?.args[1], {
    p_tenant_id: TENANT_ID,
    p_permission: 'core.member.invite',
  });
});
