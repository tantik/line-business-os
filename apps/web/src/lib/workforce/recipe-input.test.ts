import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpsertRecipeInput } from './recipe-input.js';

function validForm() {
  const form = new FormData();
  form.set('contentKind', 'recipe');
  form.set('titleJa', ' 抹茶ラテ ');
  form.set('descriptionJa', ' 店の定番 ');
  form.set('status', 'draft');
  form.set('ingredients', '抹茶\n牛乳\n');
  form.set('steps', '混ぜる\n注ぐ');
  form.set('noteTitle', '提供時');
  form.set('noteBody', 'よく混ぜる');
  return form;
}

test('parseUpsertRecipeInput normalizes a complete recipe form', () => {
  assert.deepEqual(parseUpsertRecipeInput(validForm()), {
    recipeId: null, contentKind: 'recipe', titleJa: '抹茶ラテ', descriptionJa: '店の定番',
    status: 'draft', ingredients: ['抹茶', '牛乳'], steps: ['混ぜる', '注ぐ'],
    noteTitle: '提供時', noteBody: 'よく混ぜる', mediaPath: null,
  });
});

test('parseUpsertRecipeInput rejects invalid lifecycle, overlong lines, and heading without a note body', () => {
  const invalidStatus = validForm(); invalidStatus.set('status', 'archived');
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
