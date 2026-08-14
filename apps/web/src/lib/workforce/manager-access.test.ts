import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasManagerAccess } from './manager-access.js';

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
const LOCATION_ID = 'location-1';

test('hasManagerAccess returns true when api.has_permission reports the caller holds workforce.staff.manage', async () => {
  const { client } = recordingClient({ data: true, error: null });
  const result = await hasManagerAccess(client, TENANT_ID, LOCATION_ID);
  assert.equal(result, true);
});

test('hasManagerAccess returns false when api.has_permission reports the caller does not hold the permission (Staff)', async () => {
  const { client } = recordingClient({ data: false, error: null });
  const result = await hasManagerAccess(client, TENANT_ID, LOCATION_ID);
  assert.equal(result, false);
});

test('hasManagerAccess fails closed to false on an RPC error', async () => {
  const { client } = recordingClient({ data: null, error: { code: 'XX000', message: 'boom' } });
  const result = await hasManagerAccess(client, TENANT_ID, LOCATION_ID);
  assert.equal(result, false);
});

test('hasManagerAccess fails closed to false when the RPC call throws', async () => {
  const result = await hasManagerAccess(throwingClient(), TENANT_ID, LOCATION_ID);
  assert.equal(result, false);
});

test('hasManagerAccess calls api.has_permission with the workforce.staff.manage key, tenant, and location scoped exactly as supplied', async () => {
  const { client, calls } = recordingClient({ data: true, error: null });
  await hasManagerAccess(client, TENANT_ID, LOCATION_ID);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  const rpcCall = calls.find((call) => call.method === 'rpc');
  assert.equal(rpcCall?.args[0], 'has_permission');
  assert.deepEqual(rpcCall?.args[1], {
    p_tenant_id: TENANT_ID,
    p_permission: 'workforce.staff.manage',
    p_location_id: LOCATION_ID,
  });
});
