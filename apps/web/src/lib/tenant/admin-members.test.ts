import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantAdminMembers } from './admin-members.js';

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
  tenant_slug: 'salon',
  tenant_name: 'Demo Salon',
  tenant_kind: 'demo',
  location_id: null,
  membership_status: 'active',
} as const;

const EXPECTED_SELECT =
  'tenant_id, tenant_slug, tenant_name, tenant_kind, location_id, membership_status';

test('listTenantAdminMembers maps flat api rows to camelCase member objects', async () => {
  const { client } = recordingClient({ data: [row], error: null });
  const result = await listTenantAdminMembers(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, [
      {
        tenantId: 'tenant-b',
        tenantSlug: 'salon',
        tenantName: 'Demo Salon',
        tenantKind: 'demo',
        locationId: null,
        membershipStatus: 'active',
      },
    ]);
  }
});

test('listTenantAdminMembers returns empty success for an empty result', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await listTenantAdminMembers(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, []);
});

test('listTenantAdminMembers returns members in deterministic sorted order', async () => {
  const { client } = recordingClient({
    data: [
      { ...row, tenant_id: 'tenant-b', location_id: 'loc-2', membership_status: 'suspended' },
      { ...row, tenant_id: 'tenant-a', location_id: null, membership_status: 'active' },
      { ...row, tenant_id: 'tenant-a', location_id: 'loc-1', membership_status: 'invited' },
      { ...row, tenant_id: 'tenant-a', location_id: 'loc-1', membership_status: 'active' },
    ],
    error: null,
  });
  const result = await listTenantAdminMembers(client);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((member) => `${member.tenantId}:${member.locationId ?? 'none'}:${member.membershipStatus}`),
      [
        'tenant-a:none:active',
        'tenant-a:loc-1:active',
        'tenant-a:loc-1:invited',
        'tenant-b:loc-2:suspended',
      ],
    );
  }
});

test('listTenantAdminMembers maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await listTenantAdminMembers(client);

  assert.equal(result.status, 'unauthorized');
});

test('listTenantAdminMembers maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await listTenantAdminMembers(client);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('listTenantAdminMembers reads through the api facade view with the exact projection', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantAdminMembers(client);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['my_tenant_admin_members']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [EXPECTED_SELECT]);
});

test('listTenantAdminMembers never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantAdminMembers(client);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('core'));

  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('tenant_memberships'));
  assert.ok(!fromTargets.includes('users'));
  assert.ok(!fromTargets.includes('roles'));
  assert.ok(!fromTargets.includes('role_assignments'));

  assert.ok(!calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id'));
  assert.ok(!calls.some((call) => call.method === 'order'));
  assert.equal(calls.filter((call) => call.method === 'schema').length, 1);
  assert.equal(calls.filter((call) => call.method === 'from').length, 1);
  assert.equal(calls.filter((call) => call.method === 'select').length, 1);
});

test('listTenantAdminMembers source uses only the anon/RLS client path and approved fields', () => {
  const source = readFileSync(new URL('./admin-members.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]tenant_memberships['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]users['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]roles['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.from\(\s*['"]role_assignments['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.eq\(\s*['"]tenant_id['"]`).test(source));
  assert.ok(!new RegExp(String.raw`\.order\(`).test(source));

  for (const forbidden of [
    'email',
    'phone',
    'display_name',
    'user_id',
    'role_id',
    'role_key',
    'role_name',
    'role_keys',
    'role_names',
    'config',
    'metadata',
  ]) {
    assert.ok(!source.includes(forbidden), `admin-members.ts must not reference ${forbidden}`);
  }
});
