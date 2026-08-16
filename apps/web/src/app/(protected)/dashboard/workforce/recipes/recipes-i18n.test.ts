import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tRecipes } from './recipes-i18n.js';

/**
 * Cafe v2.1 Mission 1 (Product/UX Reconciliation Audit §8/§14/§16, Part G):
 * Recipe content is already bilingual by data model (`titleJa`/`titleEn`
 * etc.), but the surrounding page chrome was hardcoded English. Closed by
 * reusing the existing `LangProvider`/`makeTranslator` mechanism.
 */
const LANGS = ['ja', 'en'] as const;
const KEYS: Parameters<typeof tRecipes>[1][] = [
  'pageTitle', 'pageDescription', 'backToWorkforce', 'backToRecipes', 'unavailable', 'noRecipesYet',
  'noRecipesInCategory', 'uncategorized', 'instructionBadge', 'ingredientsHeading', 'noIngredients',
  'stepsHeading', 'noSteps', 'notesHeading', 'noNotes',
];

test('tRecipes returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const value = tRecipes(lang, key);
      assert.equal(typeof value, 'string', `tRecipes(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tRecipes(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tRecipes ja/en copy differs for every key', () => {
  for (const key of KEYS) {
    assert.notEqual(tRecipes('ja', key), tRecipes('en', key), `key ${key} should have distinct ja/en copy`);
  }
});
