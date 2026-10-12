import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECIPE_ALLERGEN_CODES, summarizeRecipeAllergens } from './recipe-allergens.js';
import {
  ALLERGEN_CODE_GROUPS,
  ALLERGEN_CODES as INVENTORY_ALLERGEN_CODES,
  ALLERGEN_LABELS as INVENTORY_ALLERGEN_LABELS,
  allergenGroupHeading,
} from '../../app/(protected)/inventory/inventory-i18n.js';
import { ALLERGEN_LABELS as RECIPE_ALLERGEN_LABELS, tRecipes } from '../../app/(protected)/recipes/recipes-i18n.js';

const mapped = (codes: string[] | null) => ({ inventoryItemId: 'item', allergenCodes: codes });
const unmapped = { inventoryItemId: null, allergenCodes: null };

// ---------------------------------------------------------------------------
// summarizeRecipeAllergens
// ---------------------------------------------------------------------------

test('no ingredients -> unrecorded (never "contains none")', () => {
  assert.deepEqual(summarizeRecipeAllergens([]), { kind: 'unrecorded' });
});

test('every ingredient mapped and confirmed none -> none, with count taken from the vocabulary', () => {
  assert.deepEqual(summarizeRecipeAllergens([mapped([]), mapped([])]), {
    kind: 'none',
    vocabularySize: RECIPE_ALLERGEN_CODES.length,
  });
  assert.deepEqual(summarizeRecipeAllergens([mapped([])], ['a', 'b', 'c']), { kind: 'none', vocabularySize: 3 });
});

test('confirmed none plus one NULL-coded ingredient -> unrecorded', () => {
  assert.deepEqual(summarizeRecipeAllergens([mapped([]), mapped(null)]), { kind: 'unrecorded' });
});

test('confirmed none plus one unmapped ingredient -> unrecorded', () => {
  assert.deepEqual(summarizeRecipeAllergens([mapped([]), unmapped]), { kind: 'unrecorded' });
});

test('all ingredients unmapped -> unrecorded', () => {
  assert.deepEqual(summarizeRecipeAllergens([unmapped, unmapped]), { kind: 'unrecorded' });
});

test('an unmapped ingredient carrying codes is still counted unknown (mapping gates the codes)', () => {
  assert.deepEqual(summarizeRecipeAllergens([{ inventoryItemId: null, allergenCodes: ['egg'] }]), { kind: 'unrecorded' });
});

test('recorded codes: union, deduplicated, in vocabulary order, unknownCount 0', () => {
  const summary = summarizeRecipeAllergens([mapped(['gelatin', 'milk']), mapped(['egg', 'milk']), mapped([])]);
  assert.deepEqual(summary, { kind: 'recorded', codes: ['egg', 'milk', 'gelatin'], unknownCount: 0 });
});

test('recorded codes with unmapped and NULL ingredients -> unknownCount counts both', () => {
  const summary = summarizeRecipeAllergens([mapped(['salmon_roe']), unmapped, mapped(null), { allergenCodes: undefined }]);
  assert.deepEqual(summary, { kind: 'recorded', codes: ['salmon_roe'], unknownCount: 3 });
});

test('a code outside the vocabulary sorts after known codes (defensive; the DB CHECK forbids it)', () => {
  const summary = summarizeRecipeAllergens([mapped(['zzz', 'yyy', 'apple', 'egg'])]);
  assert.deepEqual(summary, { kind: 'recorded', codes: ['egg', 'apple', 'yyy', 'zzz'], unknownCount: 0 });
});

// ---------------------------------------------------------------------------
// Vocabulary parity: Recipes copy == Inventory copy == migration 0124
// ---------------------------------------------------------------------------

function migrationArrays(): string[][] {
  const sql = readFileSync(
    new URL('../../../../../supabase/migrations/0124_inventory_allergen_vocabulary_28.sql', import.meta.url),
    'utf8',
  );
  const arrays = [...sql.matchAll(/array\[([^\]]*)\]::text\[\]/g)].map((match) =>
    [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((code) => code[1] ?? ''),
  );
  return arrays.filter((codes) => codes.length > 0);
}

test('the vocabulary has 28 unique codes: 8 mandatory then 20 recommended', () => {
  assert.equal(RECIPE_ALLERGEN_CODES.length, 28);
  assert.equal(new Set(RECIPE_ALLERGEN_CODES).size, 28);
  assert.deepEqual(ALLERGEN_CODE_GROUPS.map((group) => [group.key, group.codes.length]), [
    ['mandatory', 8],
    ['recommended', 20],
  ]);
});

test('Inventory and Recipes code lists are identical (same codes, same order)', () => {
  assert.deepEqual([...INVENTORY_ALLERGEN_CODES], [...RECIPE_ALLERGEN_CODES]);
});

test('migration 0124 constraint and RPC both use exactly the same 28-code array, in the same order', () => {
  const arrays = migrationArrays();
  assert.equal(arrays.length, 2, 'expected the CHECK constraint array and the RPC array');
  for (const codes of arrays) assert.deepEqual(codes, [...RECIPE_ALLERGEN_CODES]);
});

test('every code has a JA and EN label in both modules, and both modules agree', () => {
  for (const lang of ['ja', 'en'] as const) {
    assert.deepEqual(Object.keys(RECIPE_ALLERGEN_LABELS[lang]).sort(), [...RECIPE_ALLERGEN_CODES].sort());
    assert.deepEqual(INVENTORY_ALLERGEN_LABELS[lang], RECIPE_ALLERGEN_LABELS[lang]);
  }
});

test('group subheadings carry the count from the code list', () => {
  const [mandatory, recommended] = ALLERGEN_CODE_GROUPS;
  assert.equal(allergenGroupHeading('ja', mandatory), '特定原材料（8品目）');
  assert.equal(allergenGroupHeading('ja', recommended), '特定原材料に準ずるもの（20品目）');
  assert.equal(allergenGroupHeading('en', mandatory), 'Mandatory allergens (8)');
  assert.equal(allergenGroupHeading('en', recommended), 'Recommended allergens (20)');
});

test('"contains none" copy fills {count} from the vocabulary length (28)', () => {
  const summary = summarizeRecipeAllergens([mapped([])]);
  assert.equal(summary.kind, 'none');
  if (summary.kind !== 'none') return;
  assert.equal(
    tRecipes('ja', 'allergenNoneOfListed').replace('{count}', String(summary.vocabularySize)),
    'この商品には特定原材料等28品目は使用していません（店舗確認）',
  );
  assert.equal(
    tRecipes('en', 'allergenNoneOfListed').replace('{count}', String(summary.vocabularySize)),
    'Contains none of the 28 listed allergens (checked by the store)',
  );
});

test('the old over-claiming allergen strings are gone from the Recipes dictionary and detail view', () => {
  for (const file of ['../../app/(protected)/recipes/recipes-i18n.ts', '../../app/(protected)/recipes/[recipeId]/recipe-detail-client.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /アレルゲンなし（確認済み）|No known allergens|アレルゲン未設定|Allergens not set/);
  }
});
