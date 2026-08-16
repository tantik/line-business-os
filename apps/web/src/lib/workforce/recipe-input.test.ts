import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpsertRecipeInput } from './recipe-input.js';

function validForm() {
  const form = new FormData();
  form.set('contentKind', 'recipe');
  form.set('originalLanguage', 'ja');
  form.set('title', ' 抹茶ラテ ');
  form.set('description', ' 店の定番 ');
  form.set('status', 'draft');
  form.set('ingredients', '抹茶\n牛乳\n');
  form.set('steps', '混ぜる\n注ぐ');
  form.set('noteTitle', '提供時');
  form.set('noteBody', 'よく混ぜる');
  return form;
}

test('parseUpsertRecipeInput normalizes a complete recipe form', () => {
  assert.deepEqual(parseUpsertRecipeInput(validForm()), {
    recipeId: null, contentKind: 'recipe', title: '抹茶ラテ', description: '店の定番',
    status: 'draft', ingredients: ['抹茶', '牛乳'], steps: ['混ぜる', '注ぐ'],
    noteTitle: '提供時', noteBody: 'よく混ぜる', mediaPath: null,
    originalLanguage: 'ja', confirmLanguageChange: false,
  });
});

test('parseUpsertRecipeInput accepts an en-original recipe and reads generic title/description fields', () => {
  const form = validForm();
  form.set('originalLanguage', 'en');
  form.set('title', ' Matcha Latte ');
  form.set('description', ' House favorite ');
  const result = parseUpsertRecipeInput(form);
  assert.equal(result?.originalLanguage, 'en');
  assert.equal(result?.title, 'Matcha Latte');
  assert.equal(result?.description, 'House favorite');
});

test('parseUpsertRecipeInput rejects a missing/invalid originalLanguage', () => {
  const missing = validForm(); missing.delete('originalLanguage');
  assert.equal(parseUpsertRecipeInput(missing), null);
  const invalid = validForm(); invalid.set('originalLanguage', 'fr');
  assert.equal(parseUpsertRecipeInput(invalid), null);
});

test('parseUpsertRecipeInput reads confirmLanguageChange, defaulting to false', () => {
  assert.equal(parseUpsertRecipeInput(validForm())?.confirmLanguageChange, false);
  const confirmed = validForm(); confirmed.set('confirmLanguageChange', 'true');
  assert.equal(parseUpsertRecipeInput(confirmed)?.confirmLanguageChange, true);
});

test('parseUpsertRecipeInput rejects invalid lifecycle, overlong lines, and heading without a note body', () => {
  // Note: pre-existing behavior (unrelated to this change) -- 'archived' IS
  // a valid status value accepted here, only a status outside
  // draft/published/archived is rejected.
  const invalidStatus = validForm(); invalidStatus.set('status', 'unknown-status');
  assert.equal(parseUpsertRecipeInput(invalidStatus), null);
  const longIngredient = validForm(); longIngredient.set('ingredients', 'x'.repeat(501));
  assert.equal(parseUpsertRecipeInput(longIngredient), null);
  const headingOnly = validForm(); headingOnly.set('noteBody', '');
  assert.equal(parseUpsertRecipeInput(headingOnly), null);
});

test('parseUpsertRecipeInput never trusts a client-supplied media path', () => {
  const form = validForm(); form.set('mediaPath', 'another-tenant/private.jpg');
  assert.equal(parseUpsertRecipeInput(form)?.mediaPath, null);
});
