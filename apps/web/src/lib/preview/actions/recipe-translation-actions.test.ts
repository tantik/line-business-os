import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./recipe-translation-actions.ts', import.meta.url), 'utf8');

test('exports exactly the three manager recipe-translation actions', () => {
  assert.deepEqual(
    [...SOURCE.matchAll(/export async function (preview[A-Za-z]+)\(/g)].map((match) => match[1]),
    ['previewGenerateRecipeTranslation', 'previewSaveManualRecipeTranslation', 'previewMarkRecipeTranslationReviewed'],
  );
});

test('every action resolves the manager context with workforce.recipe.manage -- the same permission that gates content.translations RLS', () => {
  const occurrences = [...SOURCE.matchAll(/resolvePreviewManagerContext\('workforce\.recipe\.manage'\)/g)];
  assert.equal(occurrences.length, 3);
});

test('every action re-validates the recipe belongs to the caller\'s tenant/location via loadOwnedWorkspace before any write', () => {
  const writeFunctionNames = ['previewGenerateRecipeTranslation', 'previewSaveManualRecipeTranslation', 'previewMarkRecipeTranslationReviewed'];
  for (const name of writeFunctionNames) {
    const start = SOURCE.indexOf(`export async function ${name}(`);
    const end = SOURCE.indexOf('\n}', start);
    const body = SOURCE.slice(start, end);
    assert.ok(body.includes('loadOwnedWorkspace('), `${name} must call loadOwnedWorkspace`);
  }
});

test('never accepts a client-supplied source text, hash, tenant id, or location id', () => {
  assert.ok(!SOURCE.includes("formData.get('sourceText')"));
  assert.ok(!SOURCE.includes("formData.get('sourceContentHash')"));
  assert.ok(!SOURCE.includes("formData.get('tenantId')"));
  assert.ok(!SOURCE.includes("formData.get('locationId')"));
});

test('previewGenerateRecipeTranslation never calls the provider before resolveContentTranslationProvider() returns non-null', () => {
  const start = SOURCE.indexOf('export async function previewGenerateRecipeTranslation(');
  const providerCallIndex = SOURCE.indexOf('resolveContentTranslationProvider()', start);
  const notConfiguredIndex = SOURCE.indexOf("'translation_not_configured'", start);
  assert.ok(providerCallIndex >= 0 && notConfiguredIndex > providerCallIndex);
});

test('previewGenerateRecipeTranslation persists the resolved provider\'s own providerId, never a hardcoded literal', () => {
  const start = SOURCE.indexOf('export async function previewGenerateRecipeTranslation(');
  const end = SOURCE.indexOf('\nexport', start + 1);
  const body = SOURCE.slice(start, end);
  assert.ok(body.includes('translationProvider: provider.providerId'));
  assert.ok(!/translationProvider:\s*['"]deepl['"]/.test(body));
  assert.ok(!/translationProvider:\s*['"]openai['"]/.test(body));
});

test('uses no service-role client and never imports a dashboard-only action module', () => {
  assert.ok(!/service_role|createServiceClient|createServiceRoleClient/i.test(SOURCE));
  assert.ok(!SOURCE.includes('workforce/staff-actions'));
  assert.ok(!SOURCE.includes('workforce/schedule-actions'));
  assert.ok(!SOURCE.includes('workforce/attendance-actions'));
});
