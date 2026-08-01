import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './settings-actions.test.ts';

const SOURCE = readFileSync(new URL('./recipe-actions.ts', import.meta.url), 'utf8');

test('exports exactly the reviewed manager recipe actions', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    ['previewListRecipeMediaUrls', 'previewGetRecipeForEdit', 'previewSetRecipeArchived', 'previewUpsertRecipe'],
  );
});

test('uses recipe.manage and validates the visible target location before mutation', () => {
  assert.ok(SOURCE.includes("resolvePreviewManagerContext('workforce.recipe.manage')"));
  assert.ok(SOURCE.includes('detail.data.recipe.locationId !== context.context.locationId'));
  assert.ok(SOURCE.indexOf('detail.data.recipe.locationId') < SOURCE.indexOf('upsertWorkforceRecipe('));
});

test('never reads client-supplied tenant or location authority fields and uses no service role', () => {
  assert.ok(!SOURCE.includes("formData.get('tenantId')"));
  assert.ok(!SOURCE.includes("formData.get('locationId')"));
  assert.ok(!/service_role|createServiceClient/i.test(SOURCE));
});
