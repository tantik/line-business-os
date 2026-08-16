import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './settings-actions.test.ts';

const SOURCE = readFileSync(new URL('./recipe-actions.ts', import.meta.url), 'utf8');

test('exports exactly the reviewed manager recipe actions', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    [
      'previewListRecipeMediaUrls',
      'previewGetRecipesManagerData',
      'previewGetRecipeForEdit',
      'previewSetRecipeArchived',
      'previewPermanentlyDeleteRecipe',
      'previewUpsertRecipe',
    ],
  );
});

test('previewPermanentlyDeleteRecipe validates the visible target location before deleting, then best-effort removes the old Storage object', () => {
  const body = SOURCE.slice(
    SOURCE.indexOf('export async function previewPermanentlyDeleteRecipe'),
    SOURCE.indexOf('export async function previewUpsertRecipe'),
  );
  assert.ok(body.includes("resolvePreviewManagerContext('workforce.recipe.manage')"));
  assert.ok(body.includes('recipeOutOfManagerScope(detail.data.recipe.locationId, context.context.locationId)'));
  assert.ok(body.indexOf('recipeOutOfManagerScope(detail.data.recipe.locationId') < body.indexOf('permanentlyDeleteRecipe('));
  assert.ok(body.includes("supabase.storage.from('recipe-media').remove(["));
});

test('uses recipe.manage and validates the visible target location before mutation', () => {
  assert.ok(SOURCE.includes("resolvePreviewManagerContext('workforce.recipe.manage')"));
  assert.ok(SOURCE.includes('recipeOutOfManagerScope(detail.data.recipe.locationId, context.context.locationId)'));
  assert.ok(SOURCE.indexOf('recipeOutOfManagerScope(detail.data.recipe.locationId') < SOURCE.indexOf('upsertWorkforceRecipe('));
});

test('recipeOutOfManagerScope treats a tenant-wide (null-location) recipe as in scope, matches only the manager\'s own resolved location otherwise, and rejects every other location', () => {
  const body = SOURCE.slice(
    SOURCE.indexOf('function recipeOutOfManagerScope'),
    SOURCE.indexOf('export type PreviewEditableRecipeDetail'),
  );
  assert.ok(body.includes('recipeLocationId !== null && recipeLocationId !== managerLocationId'));
});

test('Founder QA F07B regression: previewGetRecipeForEdit reports the other language\'s real translation readiness, derived server-side from resolveFieldDisplay (marker !== original), not guessed client-side', () => {
  const body = SOURCE.slice(
    SOURCE.indexOf('async function titleTranslationIsReady'),
  );
  assert.ok(body.includes("resolveFieldDisplay(resolvedTitleField, otherLang).marker !== 'original'"));
  assert.ok(SOURCE.includes('otherLanguageTranslationReady: await titleTranslationIsReady('));
});

test('never reads client-supplied tenant or location authority fields and uses no service role', () => {
  assert.ok(!SOURCE.includes("formData.get('tenantId')"));
  assert.ok(!SOURCE.includes("formData.get('locationId')"));
  assert.ok(!/service_role|createServiceClient/i.test(SOURCE));
});
