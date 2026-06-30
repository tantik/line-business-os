import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantModules } from './modules.js';

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
  module: 'booking',
  is_enabled: true,
};

const EXPECTED_SELECT = 'tenant_id, module, is_enabled';

test('listTenantModules maps flat api rows to typed modules on success', async () => {
  const { client } = recordingClient({ data: [row], error: null });
  const result = await listTenantModules(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, [
      {
        tenantId: 'tenant-b',
        module: 'booking',
        isEnabled: true,
      },
    ]);
  }
});

test('listTenantModules returns empty success for an empty result', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await listTenantModules(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, []);
});

test('listTenantModules returns modules in deterministic sorted order', async () => {
  const { client } = recordingClient({
    data: [
      { ...row, tenant_id: 'tenant-b', module: 'workforce' },
      { ...row, tenant_id: 'tenant-a', module: 'inventory' },
      { ...row, tenant_id: 'tenant-a', module: 'booking' },
    ],
    error: null,
  });
  const result = await listTenantModules(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((module) => `${module.tenantId}:${module.module}`),
      ['tenant-a:booking', 'tenant-a:inventory', 'tenant-b:workforce'],
    );
  }
});

test('listTenantModules maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await listTenantModules(client);

  assert.equal(result.status, 'unauthorized');
});

test('listTenantModules maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await listTenantModules(client);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('listTenantModules reads through the api facade view with the exact projection', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantModules(client);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['my_tenant_modules']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [EXPECTED_SELECT]);
});

test('listTenantModules never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantModules(client);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('core'));

  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('tenant_modules'));
  assert.ok(!fromTargets.includes('locations'));

  assert.ok(!calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id'));
  assert.ok(!calls.some((call) => call.method === 'order'));
  assert.equal(calls.filter((call) => call.method === 'schema').length, 1);
  assert.equal(calls.filter((call) => call.method === 'from').length, 1);
  assert.equal(calls.filter((call) => call.method === 'select').length, 1);
});

test('listTenantModules source uses only the anon/RLS client path and exposes no config', () => {
  const source = readFileSync(new URL('./modules.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]tenant_modules['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]locations['"]\s*\)`).test(source));
  assert.ok(!/\bconfig\b/.test(source));
});
