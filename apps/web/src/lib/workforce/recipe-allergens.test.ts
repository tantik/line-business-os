import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeRecipeAllergens } from './recipe-allergens.js';
import {
  ALLERGEN_CODE_GROUPS,
  ALLERGEN_CODES,
  ALLERGEN_DISCLAIMER,
  ALLERGEN_LABELS,
  allergenGroupHeading,
  allergenLabel,
} from '../packages/cafe/allergens.js';
import { tRecipes } from '../../app/(protected)/recipes/recipes-i18n.js';
import { tInventoryDashboard } from '../../app/(protected)/inventory/inventory-i18n.js';
import { colors } from '../ui/theme.js';

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
    vocabularySize: ALLERGEN_CODES.length,
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
// Vocabulary parity: the one Cafe-package vocabulary == migration 0124
// ---------------------------------------------------------------------------

function migrationSql(): string {
  return readFileSync(
    new URL('../../../../../supabase/migrations/0124_inventory_allergen_vocabulary_29.sql', import.meta.url),
    'utf8',
  );
}

function migrationArrays(): string[][] {
  const sql = migrationSql();
  const arrays = [...sql.matchAll(/array\[([^\]]*)\]::text\[\]/g)].map((match) =>
    [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((code) => code[1] ?? ''),
  );
  return arrays.filter((codes) => codes.length > 0);
}

test('the vocabulary has 29 unique codes: 9 mandatory then 20 recommended (CAA revision 2026-04-01)', () => {
  assert.equal(ALLERGEN_CODES.length, 29);
  assert.equal(new Set(ALLERGEN_CODES).size, 29);
  assert.deepEqual(ALLERGEN_CODE_GROUPS.map((group) => [group.key, group.codes.length]), [
    ['mandatory', 9],
    ['recommended', 20],
  ]);
  const [mandatory, recommended] = ALLERGEN_CODE_GROUPS;
  assert.ok((mandatory.codes as readonly string[]).includes('cashew'), 'cashew is mandatory since 2026-04-01');
  assert.ok((recommended.codes as readonly string[]).includes('pistachio'), 'pistachio is recommended since 2026-04-01');
});

test('the flat code list is the groups in order (mandatory, then recommended)', () => {
  assert.deepEqual([...ALLERGEN_CODES], ALLERGEN_CODE_GROUPS.flatMap((group) => [...group.codes]));
});

test('migration 0124 constraint and RPC both use exactly the same 29-code array, in the same order', () => {
  const arrays = migrationArrays();
  assert.equal(arrays.length, 2, 'expected the CHECK constraint array and the RPC array');
  for (const codes of arrays) assert.deepEqual(codes, [...ALLERGEN_CODES]);
});

test('Inventory and Recipes keep no copy of their own (one vocabulary, task P6)', () => {
  for (const file of [
    '../../app/(protected)/inventory/inventory-i18n.ts',
    '../../app/(protected)/recipes/recipes-i18n.ts',
    './recipe-allergens.ts',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /'salmon_roe'|salmon_roe:|特定原材料（|同じ厨房/, file);
  }
});

test('migration 0124 resets stale "confirmed none" (\'{}\') to NULL, before widening the vocabulary', () => {
  const sql = migrationSql();
  const reset = sql.search(/^update inventory\.items set allergen_codes = null where allergen_codes = '\{\}';$/m);
  const widen = sql.search(/^alter table inventory\.items$/m);
  assert.ok(reset >= 0, '0124 must reset allergen_codes = \'{}\' to NULL (a 10-code confirmation is not a 29-code claim)');
  assert.ok(widen > reset, 'the reset runs before the constraint is widened');
  assert.doesNotMatch(sql, /^update inventory\.items set allergen_codes = null\s*;/m, 'non-empty code arrays must not be reset');
});

test('item-form hint fills {count} from the Inventory code list', () => {
  const n = ALLERGEN_CODES.length;
  assert.equal(
    tInventoryDashboard('ja', 'allergensNoneSelectedHint').replace('{count}', String(n)),
    `アレルゲンを1つも選ばずに保存すると、「特定原材料等${n}品目を使用していない」と表示されます。`,
  );
  assert.equal(
    tInventoryDashboard('en', 'allergensNoneSelectedHint').replace('{count}', String(n)),
    `If you save without selecting any allergen, recipes will show that none of the ${n} listed allergens is used.`,
  );
});

test('EN partial-unrecorded copy is singular for 1 and plural otherwise; JA is the same sentence', () => {
  assert.equal(tRecipes('en', 'allergenPartiallyUnrecordedOne').replace('{n}', '1'), '1 ingredient has no allergen information recorded.');
  assert.equal(tRecipes('en', 'allergenPartiallyUnrecorded').replace('{n}', '3'), '3 ingredients have no allergen information recorded.');
  assert.equal(tRecipes('ja', 'allergenPartiallyUnrecordedOne'), tRecipes('ja', 'allergenPartiallyUnrecorded'));
  assert.equal(tRecipes('en', 'ingredientAllergensNoneChecked'), 'None (checked by the store)');
});

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('allergen disclaimer colour (DS text-muted) on the card surface meets WCAG AA 4.5:1', () => {
  const fg = relativeLuminance(colors.textMuted);
  const bg = relativeLuminance(colors.surface);
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  assert.ok(ratio >= 4.5, `contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
});

test('every code has a JA and EN label; an unknown code falls back to the raw code', () => {
  for (const lang of ['ja', 'en'] as const) {
    assert.deepEqual(Object.keys(ALLERGEN_LABELS[lang]).sort(), [...ALLERGEN_CODES].sort());
    assert.equal(allergenLabel(lang, 'zzz'), 'zzz');
  }
  assert.equal(allergenLabel('ja', 'salmon_roe'), 'いくら');
  assert.equal(allergenLabel('en', 'cashew'), 'Cashew nut');
});

test('kitchen disclaimer copy (JA/EN) is unchanged', () => {
  assert.equal(
    ALLERGEN_DISCLAIMER.ja,
    '同じ厨房で他の食材も扱っています。アレルギーのある方はスタッフにお尋ねください。この情報は店舗が登録した原材料に基づく参考情報であり、アレルゲンが含まれないことを保証するものではありません。',
  );
  assert.equal(
    ALLERGEN_DISCLAIMER.en,
    'Prepared in a kitchen that handles other ingredients. Please ask staff about allergies. This information is based on ingredients recorded by the store, is for reference only, and does not guarantee that a dish is free of allergens.',
  );
});

test('group subheadings carry the count from the code list', () => {
  const [mandatory, recommended] = ALLERGEN_CODE_GROUPS;
  const m = mandatory.codes.length;
  const r = recommended.codes.length;
  assert.equal(allergenGroupHeading('ja', mandatory), `特定原材料（${m}品目）`);
  assert.equal(allergenGroupHeading('ja', recommended), `特定原材料に準ずるもの（${r}品目）`);
  assert.equal(allergenGroupHeading('en', mandatory), `Mandatory allergens (${m})`);
  assert.equal(allergenGroupHeading('en', recommended), `Recommended allergens (${r})`);
});

test('"contains none" copy fills {count} from the vocabulary length', () => {
  const summary = summarizeRecipeAllergens([mapped([])]);
  assert.equal(summary.kind, 'none');
  if (summary.kind !== 'none') return;
  const n = ALLERGEN_CODES.length;
  assert.equal(summary.vocabularySize, n);
  assert.equal(
    tRecipes('ja', 'allergenNoneOfListed').replace('{count}', String(summary.vocabularySize)),
    `この商品には特定原材料等${n}品目は使用していません（店舗確認）`,
  );
  assert.equal(
    tRecipes('en', 'allergenNoneOfListed').replace('{count}', String(summary.vocabularySize)),
    `Contains none of the ${n} listed allergens (checked by the store)`,
  );
});

test('the old over-claiming allergen strings are gone from the Recipes dictionary and detail view', () => {
  for (const file of ['../../app/(protected)/recipes/recipes-i18n.ts', '../../app/(protected)/recipes/[recipeId]/recipe-detail-client.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /アレルゲンなし（確認済み）|No known allergens|アレルゲン未設定|Allergens not set/);
  }
});
