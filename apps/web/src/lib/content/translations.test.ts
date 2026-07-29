import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashSourceText, isTranslationStale, listContentTranslationsForEntities, type ContentTranslation } from './translations.js';

test('hashSourceText is deterministic for the same text', () => {
  assert.equal(hashSourceText('牛乳を200ml入れて、よく混ぜる'), hashSourceText('牛乳を200ml入れて、よく混ぜる'));
});

test('hashSourceText trims surrounding whitespace before hashing (cosmetic edits do not cause false staleness)', () => {
  assert.equal(hashSourceText('  牛乳を200ml入れて、よく混ぜる  '), hashSourceText('牛乳を200ml入れて、よく混ぜる'));
});

test('hashSourceText differs for different text', () => {
  assert.notEqual(hashSourceText('牛乳を200ml入れて、よく混ぜる'), hashSourceText('牛乳を300ml入れて、よく混ぜる'));
});

function makeTranslation(sourceContentHash: string): ContentTranslation {
  return {
    translationId: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    sourceEntityType: 'workforce_recipe',
    sourceEntityId: '33333333-3333-3333-3333-333333333333',
    sourceField: 'title',
    sourceLanguage: 'ja',
    targetLanguage: 'en',
    translatedText: 'Matcha latte',
    status: 'reviewed',
    provider: 'manual',
    sourceContentHash,
    machineGenerated: false,
    reviewedAt: '2026-01-01T00:00:00Z',
    translatedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

test('isTranslationStale is false when the stored hash still matches the current source text', () => {
  const translation = makeTranslation(hashSourceText('抹茶ラテ'));
  assert.equal(isTranslationStale(translation, '抹茶ラテ'), false);
});

test('isTranslationStale is true once the source text has changed since translation', () => {
  const translation = makeTranslation(hashSourceText('抹茶ラテ'));
  assert.equal(isTranslationStale(translation, '抹茶ラテ（アイス）'), true);
});

// -- listContentTranslationsForEntities --------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

function recordingClient(result: { data: unknown; error: unknown }): { client: SupabaseClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'select', 'eq', 'in']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

const TRANSLATION_ROW = {
  translation_id: 't-1',
  tenant_id: 'tenant-a',
  source_entity_type: 'workforce_recipe',
  source_entity_id: 'recipe-1',
  source_field: 'title',
  source_language: 'ja',
  target_language: 'en',
  translated_text: 'Matcha latte',
  translation_status: 'machine',
  translation_provider: 'deepl',
  source_content_hash: 'deadbeef',
  machine_generated: true,
  reviewed_at: null,
  translated_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

test('listContentTranslationsForEntities returns success with empty data and makes no query for an empty ref list', async () => {
  const { client, calls } = recordingClient({ data: [TRANSLATION_ROW], error: null });
  const result = await listContentTranslationsForEntities(client, 'tenant-a', []);
  assert.deepEqual(result, { status: 'success', data: [] });
  assert.equal(calls.length, 0);
});

test('listContentTranslationsForEntities queries once with .in() across all requested entity ids', async () => {
  const { client, calls } = recordingClient({ data: [TRANSLATION_ROW], error: null });
  await listContentTranslationsForEntities(client, 'tenant-a', [
    { sourceEntityType: 'workforce_recipe', sourceEntityId: 'recipe-1' },
    { sourceEntityType: 'workforce_recipe_step', sourceEntityId: 'step-1' },
  ]);
  assert.deepEqual(calls.find((c) => c.method === 'schema')?.args, ['api']);
  assert.deepEqual(calls.find((c) => c.method === 'from')?.args, ['content_translations']);
  assert.deepEqual(calls.find((c) => c.method === 'eq')?.args, ['tenant_id', 'tenant-a']);
  assert.deepEqual(calls.find((c) => c.method === 'in')?.args, ['source_entity_id', ['recipe-1', 'step-1']]);
});

test('listContentTranslationsForEntities filters out rows whose (type, id) pair was not actually requested', async () => {
  const unrequestedRow = { ...TRANSLATION_ROW, translation_id: 't-2', source_entity_id: 'recipe-999' };
  const { client } = recordingClient({ data: [TRANSLATION_ROW, unrequestedRow], error: null });
  const result = await listContentTranslationsForEntities(client, 'tenant-a', [
    { sourceEntityType: 'workforce_recipe', sourceEntityId: 'recipe-1' },
  ]);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data.map((t) => t.translationId), ['t-1']);
  }
});

test('listContentTranslationsForEntities maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied for relation' } });
  const result = await listContentTranslationsForEntities(client, 'tenant-a', [
    { sourceEntityType: 'workforce_recipe', sourceEntityId: 'recipe-1' },
  ]);
  assert.equal(result.status, 'unauthorized');
});
