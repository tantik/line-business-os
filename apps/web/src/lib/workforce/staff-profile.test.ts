import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMyWorkforceStaffProfile } from './staff-profile.js';

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
  for (const method of ['schema', 'from', 'select', 'eq', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

const TENANT_ID = 'tenant-a';

const row = {
  staff_id: 'staff-1',
  tenant_id: TENANT_ID,
  location_id: 'location-1',
  position_label: 'Barista',
  employment_type: 'part_time',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

const EXPECTED_SELECT = 'staff_id, tenant_id, location_id, position_label, employment_type, is_active, created_at';

test('getMyWorkforceStaffProfile maps a flat api row to a typed profile on success', async () => {
  const { client } = recordingClient({ data: row, error: null });
  const result = await getMyWorkforceStaffProfile(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, {
      staffId: 'staff-1',
      tenantId: TENANT_ID,
      locationId: 'location-1',
      positionLabel: 'Barista',
      employmentType: 'part_time',
      isActive: true,
      createdAt: row.created_at,
    });
  }
});

test('getMyWorkforceStaffProfile returns success with null data when no row exists', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await getMyWorkforceStaffProfile(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data, null);
});

test('getMyWorkforceStaffProfile maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await getMyWorkforceStaffProfile(client, TENANT_ID);

  assert.equal(result.status, 'unauthorized');
});

test('getMyWorkforceStaffProfile maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await getMyWorkforceStaffProfile(client, TENANT_ID);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('getMyWorkforceStaffProfile reads through the api facade view with the exact projection and tenant filter', async () => {
  const { client, calls } = recordingClient({ data: row, error: null });
  await getMyWorkforceStaffProfile(client, TENANT_ID);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['workforce_my_staff_profile']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [EXPECTED_SELECT]);
  assert.deepEqual(calls.find((call) => call.method === 'eq')?.args, ['tenant_id', TENANT_ID]);
  assert.equal(calls.some((call) => call.method === 'maybeSingle'), true);
});

test('getMyWorkforceStaffProfile never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: row, error: null });
  await getMyWorkforceStaffProfile(client, TENANT_ID);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('core'));
  assert.ok(!schemaTargets.includes('workforce'));

  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('employees'));

  assert.equal(calls.filter((call) => call.method === 'schema').length, 1);
  assert.equal(calls.filter((call) => call.method === 'from').length, 1);
  assert.equal(calls.filter((call) => call.method === 'select').length, 1);
  assert.equal(calls.filter((call) => call.method === 'eq').length, 1);
  assert.equal(calls.filter((call) => call.method === 'maybeSingle').length, 1);
});

test('staff-profile.ts source uses only the anon/RLS client path and exposes no service-role/apps-api access', () => {
  const source = readFileSync(new URL('./staff-profile.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp('create' + 'ServiceRoleClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]workforce['"]\s*\)`).test(source));
  assert.ok(!/apps\/api/.test(source));
  assert.ok(!/name_encrypted/.test(source));
  assert.ok(!/name_hash/.test(source));
});
