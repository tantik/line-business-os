import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './settings-actions.test.ts';

const SOURCE = readFileSync(new URL('./recipe-actions.ts', import.meta.url), 'utf8');

test('exports exactly the manager recipe classification action', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    ['previewSetRecipeContentKind'],
  );
});

test('validates recipe id and exact recipe/instruction kind before resolving manager context', () => {
  const validationIndex = SOURCE.indexOf("rawContentKind !== 'recipe'");
  const contextIndex = SOURCE.indexOf("resolvePreviewManagerContext('workforce.recipe.manage')");
  assert.ok(validationIndex >= 0 && validationIndex < contextIndex);
  assert.ok(SOURCE.includes("rawContentKind !== 'instruction'"));
});

test('uses recipe.manage and validates the visible target location before the narrow write', () => {
  assert.ok(SOURCE.includes("resolvePreviewManagerContext('workforce.recipe.manage')"));
  assert.ok(SOURCE.includes('listWorkforceRecipes(supabase, tenantId)'));
  assert.ok(SOURCE.includes('target.locationId !== null && target.locationId !== locationId'));
  assert.ok(SOURCE.indexOf('target.locationId !== null') < SOURCE.indexOf('updateWorkforceRecipeContentKind('));
});

test('never reads client-supplied tenant or location authority fields and uses no service role', () => {
  assert.ok(!SOURCE.includes("formData.get('tenantId')"));
  assert.ok(!SOURCE.includes("formData.get('locationId')"));
  assert.ok(!/service_role|createServiceClient/i.test(SOURCE));
});
