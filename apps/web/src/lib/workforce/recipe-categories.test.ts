import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listWorkforceRecipeCategories } from './recipe-categories.js';

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

const TENANT_ID = 'tenant-a';

const row = {
  category_id: 'cat-1',
  tenant_id: TENANT_ID,
  label_ja: '前菜',
  label_en: 'Appetizers',
  sort_order: 1,
  is_active: true,
};

const EXPECTED_SELECT = 'category_id, tenant_id, label_ja, label_en, sort_order, is_active';

test('listWorkforceRecipeCategories maps flat api rows to typed categories on success', async () => {
  const { client } = recordingClient({ data: [row], error: null });
  const result = await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, [
      {
        categoryId: 'cat-1',
        tenantId: TENANT_ID,
        labelJa: row.label_ja,
        labelEn: 'Appetizers',
        sortOrder: 1,
        isActive: true,
      },
    ]);
  }
});

test('listWorkforceRecipeCategories returns empty success for an empty result', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, []);
});

test('listWorkforceRecipeCategories returns categories in deterministic sorted order', async () => {
  const { client } = recordingClient({
    data: [
      { ...row, category_id: 'cat-3', sort_order: 2, label_ja: 'C' },
      { ...row, category_id: 'cat-1', sort_order: 1, label_ja: 'B' },
      { ...row, category_id: 'cat-2', sort_order: 1, label_ja: 'A' },
    ],
    error: null,
  });
  const result = await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((category) => category.categoryId),
      ['cat-2', 'cat-1', 'cat-3'],
    );
  }
});

test('listWorkforceRecipeCategories maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.equal(result.status, 'unauthorized');
});

test('listWorkforceRecipeCategories maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('listWorkforceRecipeCategories reads through the api facade view with the exact projection and tenant filter', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listWorkforceRecipeCategories(client, TENANT_ID);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['workforce_recipe_categories']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [EXPECTED_SELECT]);
  assert.deepEqual(calls.find((call) => call.method === 'eq')?.args, ['tenant_id', TENANT_ID]);
});

test('listWorkforceRecipeCategories never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listWorkforceRecipeCategories(client, TENANT_ID);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('core'));
  assert.ok(!schemaTargets.includes('workforce'));

  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('recipe_categories'));

  assert.equal(calls.filter((call) => call.method === 'schema').length, 1);
  assert.equal(calls.filter((call) => call.method === 'from').length, 1);
  assert.equal(calls.filter((call) => call.method === 'select').length, 1);
  assert.equal(calls.filter((call) => call.method === 'eq').length, 1);
  assert.equal(calls.filter((call) => call.method === 'order').length, 0);
});

test('recipe-categories.ts source uses only the anon/RLS client path and exposes no service-role/apps-api access', () => {
  const source = readFileSync(new URL('./recipe-categories.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp('create' + 'ServiceRoleClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]workforce['"]\s*\)`).test(source));
  assert.ok(!/apps\/api/.test(source));
});
