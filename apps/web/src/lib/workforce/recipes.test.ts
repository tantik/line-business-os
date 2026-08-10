import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getWorkforceRecipeDetail,
  groupRecipesByCategory,
  listWorkforceRecipes,
  permanentlyDeleteRecipe,
  setWorkforceRecipeArchived,
  updateWorkforceRecipeContentKind,
} from './recipes.js';
import type { WorkforceRecipe } from './recipes.js';
import type { WorkforceRecipeCategory } from './recipe-categories.js';

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Single-table stub matching the existing `lib/tenant/*.test.ts` convention. */
function recordingClient(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'select', 'update', 'eq', 'order', 'rpc']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  builder.maybeSingle = () => Promise.resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

/**
 * Multi-table stub for `getWorkforceRecipeDetail`, which queries 4 different
 * views (`workforce_recipes` via `.maybeSingle()`, then 3 child views in
 * parallel). Each `.from(table)` call gets its own response, keyed by table
 * name.
 */
function multiTableRecordingClient(responses: Record<string, { data: unknown; error: unknown }>): {
  client: SupabaseClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  function makeQueryBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['schema', 'select', 'eq', 'order']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }
    const respond = () => responses[table] ?? { data: null, error: null };
    builder.maybeSingle = () => {
      calls.push({ method: 'maybeSingle', args: [] });
      return Promise.resolve(respond());
    };
    builder.then = (resolve: (value: unknown) => unknown) => resolve(respond());
    return builder;
  }

  const root: Record<string, unknown> = {
    schema: (...args: unknown[]) => {
      calls.push({ method: 'schema', args });
      return root;
    },
    from: (...args: unknown[]) => {
      calls.push({ method: 'from', args });
      return makeQueryBuilder(args[0] as string);
    },
  };

  return { client: root as unknown as SupabaseClient, calls };
}

const TENANT_ID = 'tenant-a';
const RECIPE_ID = 'recipe-1';

const recipeRow = {
  recipe_id: RECIPE_ID,
  tenant_id: TENANT_ID,
  location_id: null,
  recipe_category_id: 'cat-1',
  title_ja: '肉じゃが',
  title_en: 'Nikujaga',
  description_ja: null,
  description_en: null,
  content_kind: 'recipe',
  is_popular: true,
  status: 'published',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  media_path: null,
};

const baseRecipe: WorkforceRecipe = {
  recipeId: RECIPE_ID,
  tenantId: TENANT_ID,
  locationId: null,
  recipeCategoryId: 'cat-1',
  titleJa: '肉じゃが',
  titleEn: 'Nikujaga',
  descriptionJa: null,
  descriptionEn: null,
  contentKind: 'recipe',
  isPopular: true,
  status: 'published',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mediaPath: null,
};

const RECIPE_SELECT =
  'recipe_id, tenant_id, location_id, recipe_category_id, title_ja, title_en, description_ja, description_en, content_kind, is_popular, status, created_at, updated_at, media_path';
const INGREDIENT_SELECT = 'ingredient_id, tenant_id, recipe_id, label_ja, label_en, sort_order';
const STEP_SELECT = 'step_id, tenant_id, recipe_id, step_number, instruction_ja, instruction_en';
const NOTE_SELECT = 'note_id, tenant_id, recipe_id, title_ja, title_en, body_ja, body_en';

// -- listWorkforceRecipes ----------------------------------------------------

test('listWorkforceRecipes maps flat api rows to typed recipes on success', async () => {
  const { client } = recordingClient({ data: [recipeRow], error: null });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, [baseRecipe]);
});

test('listWorkforceRecipes returns empty success for an empty result', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.data, []);
});

test('updateWorkforceRecipeContentKind changes only content_kind and narrows by tenant + recipe id', async () => {
  const { client, calls } = recordingClient({
    data: { ...recipeRow, content_kind: 'instruction' },
    error: null,
  });

  const result = await updateWorkforceRecipeContentKind(client, TENANT_ID, RECIPE_ID, 'instruction');

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data.contentKind, 'instruction');
  assert.deepEqual(calls.find((call) => call.method === 'update')?.args, [{ content_kind: 'instruction' }]);
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'tenant_id' && call.args[1] === TENANT_ID));
  assert.ok(calls.some((call) => call.method === 'eq' && call.args[0] === 'recipe_id' && call.args[1] === RECIPE_ID));
});

test('updateWorkforceRecipeContentKind returns not_found when RLS/filter exposes no target row', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await updateWorkforceRecipeContentKind(client, TENANT_ID, RECIPE_ID, 'instruction');
  assert.deepEqual(result, { status: 'not_found' });
});

test('setWorkforceRecipeArchived uses the reversible archived/draft lifecycle', async () => {
  const archivedClient = recordingClient({ data: { ...recipeRow, status: 'archived' }, error: null });
  const archived = await setWorkforceRecipeArchived(archivedClient.client, TENANT_ID, RECIPE_ID, true);
  assert.equal(archived.status, 'success');
  assert.deepEqual(archivedClient.calls.find((call) => call.method === 'update')?.args, [{ status: 'archived' }]);

  const restoredClient = recordingClient({ data: { ...recipeRow, status: 'draft' }, error: null });
  const restored = await setWorkforceRecipeArchived(restoredClient.client, TENANT_ID, RECIPE_ID, false);
  assert.equal(restored.status, 'success');
  assert.deepEqual(restoredClient.calls.find((call) => call.method === 'update')?.args, [{ status: 'draft' }]);
});

test('permanentlyDeleteRecipe calls api.permanently_delete_recipe (never a raw DELETE) and returns the media_path on success', async () => {
  const { client, calls } = recordingClient({
    data: [{ deleted: true, blocked_not_archived: false, media_path: 'tenant/loc/recipe-1/photo.jpg' }],
    error: null,
  });
  const result = await permanentlyDeleteRecipe(client, TENANT_ID, RECIPE_ID);
  assert.deepEqual(result, { status: 'success', data: { recipeId: RECIPE_ID, mediaPath: 'tenant/loc/recipe-1/photo.jpg' } });
  const rpcCall = calls.find((call) => call.method === 'rpc');
  assert.deepEqual(rpcCall?.args, ['permanently_delete_recipe', { p_tenant_id: TENANT_ID, p_recipe_id: RECIPE_ID }]);
});

test('permanentlyDeleteRecipe maps blocked_not_archived to its own status, distinct from blocked_by_history', async () => {
  const { client } = recordingClient({ data: [{ deleted: false, blocked_not_archived: true, media_path: null }], error: null });
  const result = await permanentlyDeleteRecipe(client, TENANT_ID, RECIPE_ID);
  assert.deepEqual(result, { status: 'blocked_not_archived' });
});

test('permanentlyDeleteRecipe returns not_found for a zero-row RPC result (not visible/not found/unauthorized), never a fabricated success', async () => {
  const { client } = recordingClient({ data: [], error: null });
  const result = await permanentlyDeleteRecipe(client, TENANT_ID, RECIPE_ID);
  assert.deepEqual(result, { status: 'not_found' });
});

test('listWorkforceRecipes returns recipes in deterministic sorted order', async () => {
  const { client } = recordingClient({
    data: [
      { ...recipeRow, recipe_id: 'r-3', title_ja: 'C' },
      { ...recipeRow, recipe_id: 'r-1', title_ja: 'A' },
      { ...recipeRow, recipe_id: 'r-2', title_ja: 'B' },
    ],
    error: null,
  });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((recipe) => recipe.recipeId),
      ['r-1', 'r-2', 'r-3'],
    );
  }
});

test('listWorkforceRecipes sorts instructions first, then popular recipes, then ordinary recipes', async () => {
  const { client } = recordingClient({
    data: [
      { ...recipeRow, recipe_id: 'ordinary', title_ja: 'A', is_popular: false },
      { ...recipeRow, recipe_id: 'popular', title_ja: 'Z', is_popular: true },
      { ...recipeRow, recipe_id: 'instruction', title_ja: 'Z', content_kind: 'instruction', is_popular: false },
    ],
    error: null,
  });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((recipe) => recipe.recipeId),
      ['instruction', 'popular', 'ordinary'],
    );
  }
});

test('listWorkforceRecipes maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({
    data: null,
    error: { code: '42501', message: 'permission denied for relation' },
  });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'unauthorized');
});

test('listWorkforceRecipes maps an unknown error to unexpected_error', async () => {
  const { client } = recordingClient({ data: null, error: { code: 'XX000', message: 'boom' } });
  const result = await listWorkforceRecipes(client, TENANT_ID);

  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

test('listWorkforceRecipes reads through the api facade view with the exact projection and tenant filter', async () => {
  const { client, calls } = recordingClient({ data: [recipeRow], error: null });
  await listWorkforceRecipes(client, TENANT_ID);

  assert.deepEqual(calls.find((call) => call.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((call) => call.method === 'from')?.args, ['workforce_recipes']);
  assert.deepEqual(calls.find((call) => call.method === 'select')?.args, [RECIPE_SELECT]);
  assert.deepEqual(calls.find((call) => call.method === 'eq')?.args, ['tenant_id', TENANT_ID]);
});

test('listWorkforceRecipes never widens the app-facing query contract', async () => {
  const { client, calls } = recordingClient({ data: [recipeRow], error: null });
  await listWorkforceRecipes(client, TENANT_ID);

  const schemaTargets = calls.filter((call) => call.method === 'schema').flatMap((call) => call.args);
  assert.ok(!schemaTargets.includes('workforce'));
  const fromTargets = calls.filter((call) => call.method === 'from').flatMap((call) => call.args);
  assert.ok(!fromTargets.includes('recipes'));
  assert.equal(calls.filter((call) => call.method === 'eq').length, 1);
  assert.equal(calls.filter((call) => call.method === 'order').length, 0);
});

// -- getWorkforceRecipeDetail -------------------------------------------------

const ingredientRowB = {
  ingredient_id: 'ing-2',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  label_ja: 'じゃがいも',
  label_en: 'Potato',
  sort_order: 2,
};
const ingredientRowA = {
  ingredient_id: 'ing-1',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  label_ja: '肉',
  label_en: 'Meat',
  sort_order: 1,
};
const stepRowB = {
  step_id: 'step-2',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  step_number: 2,
  instruction_ja: '煮込む',
  instruction_en: 'Simmer',
};
const stepRowA = {
  step_id: 'step-1',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  step_number: 1,
  instruction_ja: '切る',
  instruction_en: 'Cut',
};
const noteRowB = {
  note_id: 'note-b',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  title_ja: '保存方法',
  title_en: 'Storage',
  body_ja: '冷蔵庫で保存',
  body_en: 'Refrigerate',
};
const noteRowA = {
  note_id: 'note-a',
  tenant_id: TENANT_ID,
  recipe_id: RECIPE_ID,
  title_ja: 'アレルギー',
  title_en: 'Allergy',
  body_ja: '大豆を含む',
  body_en: 'Contains soy',
};

test('getWorkforceRecipeDetail assembles recipe, ingredients, steps, and notes on success', async () => {
  const { client } = multiTableRecordingClient({
    workforce_recipes: { data: recipeRow, error: null },
    workforce_recipe_ingredients: { data: [ingredientRowB, ingredientRowA], error: null },
    workforce_recipe_steps: { data: [stepRowB, stepRowA], error: null },
    workforce_recipe_notes: { data: [noteRowB, noteRowA], error: null },
  });

  const result = await getWorkforceRecipeDetail(client, TENANT_ID, RECIPE_ID);

  assert.equal(result.status, 'success');
  if (result.status !== 'success' || result.data === null) throw new Error('expected recipe detail');

  assert.deepEqual(result.data.recipe, baseRecipe);
  assert.deepEqual(
    result.data.ingredients.map((ingredient) => ingredient.ingredientId),
    ['ing-1', 'ing-2'],
  );
  assert.deepEqual(
    result.data.steps.map((step) => step.stepId),
    ['step-1', 'step-2'],
  );
  assert.deepEqual(
    result.data.notes.map((note) => note.noteId),
    ['note-a', 'note-b'],
  );
});

test('getWorkforceRecipeDetail returns success with null data when the recipe is not found or not visible', async () => {
  const { client, calls } = multiTableRecordingClient({
    workforce_recipes: { data: null, error: null },
  });

  const result = await getWorkforceRecipeDetail(client, TENANT_ID, RECIPE_ID);

  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.equal(result.data, null);

  // Child views must not be queried once the recipe itself is confirmed absent.
  const fromTargets = calls.filter((call) => call.method === 'from').map((call) => call.args[0]);
  assert.deepEqual(fromTargets, ['workforce_recipes']);
});

test('getWorkforceRecipeDetail maps a permission-denied recipe lookup to unauthorized', async () => {
  const { client } = multiTableRecordingClient({
    workforce_recipes: { data: null, error: { code: '42501', message: 'permission denied for relation' } },
  });

  const result = await getWorkforceRecipeDetail(client, TENANT_ID, RECIPE_ID);
  assert.equal(result.status, 'unauthorized');
});

test('getWorkforceRecipeDetail maps a child-view error to unexpected_error', async () => {
  const { client } = multiTableRecordingClient({
    workforce_recipes: { data: recipeRow, error: null },
    workforce_recipe_ingredients: { data: null, error: { code: 'XX000', message: 'boom' } },
    workforce_recipe_steps: { data: [], error: null },
    workforce_recipe_notes: { data: [], error: null },
  });

  const result = await getWorkforceRecipeDetail(client, TENANT_ID, RECIPE_ID);
  assert.equal(result.status, 'unexpected_error');
});

test('getWorkforceRecipeDetail reads each view with the exact projection and tenant/recipe filters', async () => {
  const { client, calls } = multiTableRecordingClient({
    workforce_recipes: { data: recipeRow, error: null },
    workforce_recipe_ingredients: { data: [], error: null },
    workforce_recipe_steps: { data: [], error: null },
    workforce_recipe_notes: { data: [], error: null },
  });

  await getWorkforceRecipeDetail(client, TENANT_ID, RECIPE_ID);

  const selectCalls = calls.filter((call) => call.method === 'select').map((call) => call.args[0]);
  assert.deepEqual(selectCalls, [RECIPE_SELECT, INGREDIENT_SELECT, STEP_SELECT, NOTE_SELECT]);

  const eqCalls = calls.filter((call) => call.method === 'eq');
  assert.ok(eqCalls.some((call) => call.args[0] === 'recipe_id' && call.args[1] === RECIPE_ID));
  assert.ok(eqCalls.every((call) => call.args[0] !== 'tenant_id' || call.args[1] === TENANT_ID));
  assert.equal(eqCalls.length, 8); // tenant_id + recipe_id, across 4 queries
});

// -- groupRecipesByCategory ---------------------------------------------------

function makeCategory(overrides: Partial<WorkforceRecipeCategory>): WorkforceRecipeCategory {
  return {
    categoryId: 'cat-1',
    tenantId: TENANT_ID,
    labelJa: 'カテゴリ',
    labelEn: null,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

test('groupRecipesByCategory groups recipes under their matching category, in category order', () => {
  const categories = [
    makeCategory({ categoryId: 'cat-1', sortOrder: 1 }),
    makeCategory({ categoryId: 'cat-2', sortOrder: 2 }),
  ];
  const recipes = [
    { ...baseRecipe, recipeId: 'r-1', recipeCategoryId: 'cat-2' },
    { ...baseRecipe, recipeId: 'r-2', recipeCategoryId: 'cat-1' },
  ];

  const groups = groupRecipesByCategory(categories, recipes);

  assert.deepEqual(
    groups.map((group) => group.category?.categoryId),
    ['cat-1', 'cat-2'],
  );
  assert.deepEqual(
    groups[0]?.recipes.map((recipe) => recipe.recipeId),
    ['r-2'],
  );
  assert.deepEqual(
    groups[1]?.recipes.map((recipe) => recipe.recipeId),
    ['r-1'],
  );
});

test('groupRecipesByCategory includes empty categories', () => {
  const categories = [makeCategory({ categoryId: 'cat-1' })];
  const groups = groupRecipesByCategory(categories, []);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.recipes, []);
});

test('groupRecipesByCategory promotes a category containing an instruction', () => {
  const categories = [
    makeCategory({ categoryId: 'cat-1', sortOrder: 1 }),
    makeCategory({ categoryId: 'cat-2', sortOrder: 2 }),
  ];
  const recipes = [
    { ...baseRecipe, recipeId: 'r-1', recipeCategoryId: 'cat-1' },
    { ...baseRecipe, recipeId: 'i-1', recipeCategoryId: 'cat-2', contentKind: 'instruction' as const },
  ];

  const groups = groupRecipesByCategory(categories, recipes);

  assert.deepEqual(
    groups.map((group) => group.category?.categoryId),
    ['cat-2', 'cat-1'],
  );
});

test('groupRecipesByCategory buckets uncategorized/unmatched recipes only when present', () => {
  const categories = [makeCategory({ categoryId: 'cat-1' })];
  const recipes = [
    { ...baseRecipe, recipeId: 'r-1', recipeCategoryId: null },
    { ...baseRecipe, recipeId: 'r-2', recipeCategoryId: 'cat-missing' },
  ];

  const groups = groupRecipesByCategory(categories, recipes);

  assert.equal(groups.length, 2);
  assert.equal(groups[1]?.category, null);
  assert.deepEqual(
    groups[1]?.recipes.map((recipe) => recipe.recipeId),
    ['r-1', 'r-2'],
  );
});

test('groupRecipesByCategory returns no uncategorized bucket when every recipe matches a category', () => {
  const categories = [makeCategory({ categoryId: 'cat-1' })];
  const recipes = [{ ...baseRecipe, recipeId: 'r-1', recipeCategoryId: 'cat-1' }];

  const groups = groupRecipesByCategory(categories, recipes);
  assert.equal(groups.length, 1);
});

test('groupRecipesByCategory handles empty input', () => {
  assert.deepEqual(groupRecipesByCategory([], []), []);
});

// -- source scan ---------------------------------------------------------

test('recipes.ts source uses only the anon/RLS client path and exposes no service-role/apps-api access', () => {
  const source = readFileSync(new URL('./recipes.ts', import.meta.url), 'utf8');
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
  assert.ok(!new RegExp('create' + 'ServiceRoleClient').test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]core['"]\s*\)`).test(source));
  assert.ok(!new RegExp(String.raw`\.schema\(\s*['"]workforce['"]\s*\)`).test(source));
  assert.ok(!/apps\/api/.test(source));
});
