import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runContentTranslationBatch, type TranslationCandidateField } from './translation-orchestrator.js';
import { hashSourceText } from './translations.js';
import type { ContentTranslation } from './translations.js';
import type { ContentTranslationProvider, TranslateBatchInput, TranslateBatchResult } from './translation-provider.js';

function makeTranslation(overrides: Partial<ContentTranslation> = {}): ContentTranslation {
  return {
    translationId: 't-1',
    tenantId: 'tenant-a',
    sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-1',
    sourceField: 'title',
    sourceLanguage: 'ja',
    targetLanguage: 'en',
    translatedText: 'Matcha latte',
    status: 'machine',
    provider: 'deepl',
    sourceContentHash: hashSourceText('抹茶ラテ'),
    machineGenerated: true,
    reviewedAt: null,
    translatedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function field(overrides: Partial<TranslationCandidateField>): TranslationCandidateField {
  return {
    sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-1',
    sourceField: 'title',
    sourceText: '抹茶ラテ',
    existing: null,
    ...overrides,
  };
}

function fakeProvider(fn: (input: TranslateBatchInput) => TranslateBatchResult): ContentTranslationProvider {
  return {
    providerId: 'fake',
    translateBatch: async (input) => fn(input),
  };
}

function providerThatMustNotRun(): ContentTranslationProvider {
  return {
    providerId: 'fake',
    translateBatch: async () => {
      throw new Error('provider must not be called');
    },
  };
}

test('a field with no existing translation is sent to the provider', async () => {
  const provider = fakeProvider((input) => ({ ok: true, translations: input.texts.map((t) => `EN:${t}`) }));
  const result = await runContentTranslationBatch([field({})], provider);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.translatedText, 'EN:抹茶ラテ');
});

test('a field whose current (non-stale) translation already exists is never sent to the provider', async () => {
  const existing = makeTranslation({ sourceContentHash: hashSourceText('抹茶ラテ'), status: 'machine' });
  const result = await runContentTranslationBatch([field({ existing })], providerThatMustNotRun());
  assert.equal(result.accepted.length, 0);
  assert.equal(result.skippedCurrent.length, 1);
});

test('a stale, non-reviewed translation IS sent to the provider (regenerated)', async () => {
  const existing = makeTranslation({ sourceContentHash: hashSourceText('OLD TEXT'), status: 'machine' });
  const provider = fakeProvider((input) => ({ ok: true, translations: input.texts.map((t) => `EN:${t}`) }));
  const result = await runContentTranslationBatch([field({ existing })], provider);
  assert.equal(result.accepted.length, 1);
});

test('a reviewed translation is NEVER sent to the provider, even if stale', async () => {
  const existing = makeTranslation({ sourceContentHash: hashSourceText('OLD TEXT'), status: 'reviewed' });
  const result = await runContentTranslationBatch([field({ existing })], providerThatMustNotRun());
  assert.equal(result.accepted.length, 0);
  assert.equal(result.skippedReviewed.length, 1);
});

test('a stale reviewed translation is sent only after explicit replacement confirmation', async () => {
  const candidate = field({
    sourceText: '変更後',
    existing: makeTranslation({ status: 'reviewed', sourceContentHash: hashSourceText('変更前') }),
  });
  const provider = fakeProvider(() => ({ ok: true, translations: ['Changed'] }));

  const result = await runContentTranslationBatch([candidate], provider, { replaceStaleReviewed: true });

  assert.equal(result.accepted.length, 1);
  assert.equal(result.skippedReviewed.length, 0);
});

test('an empty/whitespace-only source field is never sent to the provider', async () => {
  const result = await runContentTranslationBatch([field({ sourceText: '   ' })], providerThatMustNotRun());
  assert.equal(result.accepted.length, 0);
  assert.equal(result.skippedEmpty.length, 1);
});

test('a multi-field batch maps provider responses back to the correct field by index', async () => {
  const fields = [
    field({ sourceEntityType: 'workforce_recipe', sourceEntityId: 'r-1', sourceField: 'title', sourceText: 'A' }),
    field({ sourceEntityType: 'workforce_recipe_step', sourceEntityId: 's-1', sourceField: 'instruction', sourceText: 'B' }),
    field({ sourceEntityType: 'workforce_recipe_note', sourceEntityId: 'n-1', sourceField: 'note_body', sourceText: 'C' }),
  ];
  const provider = fakeProvider((input) => ({ ok: true, translations: input.texts.map((t) => `${t}-EN`) }));
  const result = await runContentTranslationBatch(fields, provider);

  assert.equal(result.accepted.length, 3);
  const byId = new Map(result.accepted.map((a) => [a.sourceEntityId, a.translatedText]));
  assert.equal(byId.get('r-1'), 'A-EN');
  assert.equal(byId.get('s-1'), 'B-EN');
  assert.equal(byId.get('n-1'), 'C-EN');
});

test('a provider error is surfaced without partial acceptance', async () => {
  const provider = fakeProvider(() => ({ ok: false, error: { code: 'translation_quota_exceeded' } }));
  const result = await runContentTranslationBatch([field({})], provider);
  assert.equal(result.accepted.length, 0);
  assert.deepEqual(result.error, { code: 'translation_quota_exceeded' });
});

test('a field longer than the per-field limit is skipped without calling the provider', async () => {
  const result = await runContentTranslationBatch(
    [field({ sourceText: 'あ'.repeat(2_001) })],
    providerThatMustNotRun(),
  );
  assert.equal(result.accepted.length, 0);
  assert.equal(result.skippedOverLimit.length, 1);
});

test('fields beyond the batch size cap are skipped, not silently dropped', async () => {
  const fields = Array.from({ length: 51 }, (_, i) =>
    field({ sourceEntityType: 'workforce_recipe_ingredient', sourceEntityId: `ing-${i}`, sourceField: 'label', sourceText: `材料${i}` }),
  );
  const provider = fakeProvider((input) => ({ ok: true, translations: input.texts.map((t) => `EN:${t}`) }));
  const result = await runContentTranslationBatch(fields, provider);
  assert.equal(result.accepted.length, 50);
  assert.equal(result.skippedOverLimit.length, 1);
});

test('original field objects passed in are never mutated', async () => {
  const original = field({ sourceText: '抹茶ラテ' });
  const snapshot = JSON.parse(JSON.stringify(original));
  const provider = fakeProvider((input) => ({ ok: true, translations: input.texts.map((t) => `EN:${t}`) }));
  await runContentTranslationBatch([original], provider);
  assert.deepEqual(JSON.parse(JSON.stringify(original)), snapshot);
});
