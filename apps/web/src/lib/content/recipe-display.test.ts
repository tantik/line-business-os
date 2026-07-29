import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFieldDisplay } from './recipe-display.js';
import { hashSourceText } from './translations.js';
import type { ContentTranslation } from './translations.js';
import type { RecipeTranslationField } from './recipe-translation-workspace.js';

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

function makeField(overrides: Partial<RecipeTranslationField> = {}): RecipeTranslationField {
  const sourceText = overrides.sourceText ?? '抹茶ラテ';
  const existing = overrides.existing ?? null;
  return {
    sourceEntityType: 'workforce_recipe',
    sourceEntityId: 'recipe-1',
    sourceField: 'title',
    key: 'workforce_recipe:recipe-1:title',
    sourceText,
    legacyEnText: null,
    existing,
    isStale: existing ? existing.sourceContentHash !== hashSourceText(sourceText) : false,
    ...overrides,
  };
}

test('lang=ja always shows the Japanese original, no marker, regardless of any translation', () => {
  const field = makeField({ existing: makeTranslation(), legacyEnText: 'Legacy Matcha' });
  const display = resolveFieldDisplay(field, 'ja');
  assert.deepEqual(display, { text: '抹茶ラテ', marker: null });
});

test('lang=en with a current (non-stale) machine translation shows it with a machine marker', () => {
  const field = makeField({ existing: makeTranslation({ status: 'machine' }) });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Matcha latte', marker: 'machine' });
});

test('lang=en with a current (non-stale) reviewed translation shows it with a reviewed marker', () => {
  const field = makeField({ existing: makeTranslation({ status: 'reviewed' }) });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Matcha latte', marker: 'reviewed' });
});

test('lang=en with a STALE translation falls back to the legacy *_en column, not the stale translation, no marker', () => {
  const field = makeField({
    sourceText: '抹茶ラテ（アイス）', // source changed since translation
    existing: makeTranslation({ sourceContentHash: hashSourceText('抹茶ラテ') }),
    legacyEnText: 'Legacy Iced Matcha Latte',
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Legacy Iced Matcha Latte', marker: null });
});

test('lang=en with a STALE translation and no legacy fallback shows the Japanese original with an "original" marker', () => {
  const field = makeField({
    sourceText: '抹茶ラテ（アイス）',
    existing: makeTranslation({ sourceContentHash: hashSourceText('抹茶ラテ') }),
    legacyEnText: null,
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: '抹茶ラテ（アイス）', marker: 'original' });
});

test('lang=en with no translation at all falls back to the legacy *_en column, no marker', () => {
  const field = makeField({ existing: null, legacyEnText: 'Legacy Matcha Latte' });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Legacy Matcha Latte', marker: null });
});

test('lang=en with no translation and no legacy value shows the Japanese original with an "original" marker', () => {
  const field = makeField({ existing: null, legacyEnText: null });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: '抹茶ラテ', marker: 'original' });
});

test('numeric/unit fragments in the source text are never altered by display resolution (selection only, not transformation)', () => {
  const field = makeField({
    sourceText: '牛乳を200ml入れて、よく混ぜる',
    existing: makeTranslation({
      translatedText: 'Add 200ml of milk and mix well',
      sourceContentHash: hashSourceText('牛乳を200ml入れて、よく混ぜる'),
    }),
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.ok(display.text.includes('200ml'));
});
