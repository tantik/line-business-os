import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantLocations } from './locations.js';

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
  for (const method of ['schema', 'from', 'select', 'eq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

const row = {
  tenant_id: 'tenant-b',
  location_id: 'loc-2',
  location_name: 'Main Store',
  timezone: 'Asia/Tokyo',
  is_active: true,
};

const EXPECTED_SELECT = 'tenant_id, location_id, location_name, timezone, is_active';

test('listTenantLocations maps flat api rows to typed locations on success', async () => {
  const { client } = recordingClient({ data: [row], error: null });
  const result = await listTenantLocations(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, [
      {
        tenantId: 'tenant-b',
        locationId: 'loc-2',
        locationName: 'Main Store',
        timezone: 'Asia/Tokyo',
        isActive: true,
      },
    ]);
  }
});

test('listTenantLocations returns empty success for an empty result', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await listTenantLocations(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, []);
});

test('listTenantLocations returns locations in deterministic sorted order', async () => {
  const { client } = recordingClient({
    data: [
      { ...row, tenant_id: 'tenant-b', location_name: 'Zeta', location_id: 'loc-3' },
      { ...row, tenant_id: 'tenant-a', location_name: 'Beta', location_id: 'loc-2' },
      { ...row, tenant_id: 'tenant-a', location_name: 'Alpha', location_id: 'loc-9' },
      { ...row, tenant_id: 'tenant-a', location_name: 'Alpha', location_id: 'loc-1' },
    ],
    error: null,
  });
  const result = await listTenantLocations(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((location) => location.locationId),
      ['loc-1', 'loc-9', 'loc-2', 'loc-3'],
    );
  }
});

test('listTenantLocations maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await listTenantLocations(client);

  assert.equal(result.status, 'unauthorized');
});

test('listTenantLocations maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await listTenantLocations(client);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('listTenantLocations reads through the api facade view with the exact projection', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantLocations(client);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['my_tenant_locations']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [EXPECTED_SELECT]);
});

test('listTenantLocations never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantLocations(client);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('core'));

  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('locations'));
  assert.ok(!fromTargets.includes('tenant_modules'));

  assert.ok(!calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id'));
  assert.ok(!calls.some((call) => call.method === 'order'));
  assert.equal(calls.filter((call) => call.method === 'schema').length, 1);
  assert.equal(calls.filter((call) => call.method === 'from').length, 1);
  assert.equal(calls.filter((call) => call.method === 'select').length, 1);
});

test('listTenantLocations source uses only the anon/RLS client path', () => {
  const source = readFileSync(new URL('./locations.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]locations['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]tenant_modules['"]\s*\)`).test(source));
});
