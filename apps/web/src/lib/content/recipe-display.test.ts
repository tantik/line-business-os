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
    originalLanguage: 'ja',
    sourceText,
    legacyOtherLanguageText: null,
    existing,
    isStale: existing ? existing.sourceContentHash !== hashSourceText(sourceText) : false,
    ...overrides,
  };
}

test('lang matching the recipe original_language always shows the human source, no marker, regardless of any translation', () => {
  const field = makeField({ existing: makeTranslation(), legacyOtherLanguageText: 'Legacy Matcha' });
  const display = resolveFieldDisplay(field, 'ja');
  assert.deepEqual(display, { text: '抹茶ラテ', marker: null });
});

test('the OTHER language with a current (non-stale) machine translation shows it with a machine marker', () => {
  const field = makeField({ existing: makeTranslation({ status: 'machine' }) });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Matcha latte', marker: 'machine' });
});

test('the OTHER language with a current (non-stale) reviewed translation shows it with a reviewed marker', () => {
  const field = makeField({ existing: makeTranslation({ status: 'reviewed' }) });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Matcha latte', marker: 'reviewed' });
});

test('the OTHER language with a STALE translation falls back to the legacy other-language column, not the stale translation, no marker', () => {
  const field = makeField({
    sourceText: '抹茶ラテ（アイス）', // source changed since translation
    existing: makeTranslation({ sourceContentHash: hashSourceText('抹茶ラテ') }),
    legacyOtherLanguageText: 'Legacy Iced Matcha Latte',
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Legacy Iced Matcha Latte', marker: null });
});

test('the OTHER language with a STALE translation and no legacy fallback shows the source text with an "original" marker', () => {
  const field = makeField({
    sourceText: '抹茶ラテ（アイス）',
    existing: makeTranslation({ sourceContentHash: hashSourceText('抹茶ラテ') }),
    legacyOtherLanguageText: null,
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: '抹茶ラテ（アイス）', marker: 'original' });
});

test('the OTHER language with no translation at all falls back to the legacy other-language column, no marker', () => {
  const field = makeField({ existing: null, legacyOtherLanguageText: 'Legacy Matcha Latte' });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Legacy Matcha Latte', marker: null });
});

test('the OTHER language with no translation and no legacy value shows the source text with an "original" marker', () => {
  const field = makeField({ existing: null, legacyOtherLanguageText: null });
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

// -- en-original recipes: symmetric behavior ---------------------------------

test('an en-original field: lang=en (matching original_language) shows the human EN source directly, no marker', () => {
  const field = makeField({
    originalLanguage: 'en',
    sourceText: 'Matcha Latte',
    existing: makeTranslation({ targetLanguage: 'ja', translatedText: '抹茶ラテ' }),
  });
  const display = resolveFieldDisplay(field, 'en');
  assert.deepEqual(display, { text: 'Matcha Latte', marker: null });
});

test('an en-original field: lang=ja (the OTHER language) shows the persisted machine JA translation', () => {
  const field = makeField({
    originalLanguage: 'en',
    sourceText: 'Matcha Latte',
    existing: makeTranslation({
      targetLanguage: 'ja',
      translatedText: '抹茶ラテ',
      status: 'machine',
      sourceContentHash: hashSourceText('Matcha Latte'),
    }),
  });
  const display = resolveFieldDisplay(field, 'ja');
  assert.deepEqual(display, { text: '抹茶ラテ', marker: 'machine' });
});

test('an en-original field with no JA translation yet shows the EN source with an "original" marker for JA viewers -- never a fabricated translation', () => {
  const field = makeField({ originalLanguage: 'en', sourceText: 'Matcha Latte', existing: null, legacyOtherLanguageText: null });
  const display = resolveFieldDisplay(field, 'ja');
  assert.deepEqual(display, { text: 'Matcha Latte', marker: 'original' });
});
