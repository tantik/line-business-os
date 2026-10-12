/**
 * Recipe-level allergen summary (Copy Audit A-09 / DEBT-053, Founder
 * decision 2026-10-12).
 *
 * `RECIPE_ALLERGEN_CODES` is the 28-code vocabulary from migration 0124 in
 * canonical display order (8 特定原材料, then 20 特定原材料に準ずるもの).
 * Inventory keeps its own copy (`inventory/inventory-i18n.ts`) on purpose --
 * the Workforce/Recipes and Inventory modules do not import from each other.
 * `recipe-allergens.test.ts` asserts both copies equal the array in the
 * migration file.
 */
export const RECIPE_ALLERGEN_CODES = [
  // 特定原材料 (8)
  'egg', 'milk', 'wheat', 'buckwheat', 'peanut', 'shrimp', 'crab', 'walnut',
  // 特定原材料に準ずるもの (20)
  'almond', 'abalone', 'squid', 'salmon_roe', 'orange', 'cashew', 'kiwi', 'beef', 'sesame', 'salmon',
  'mackerel', 'soy', 'chicken', 'banana', 'pork', 'macadamia', 'peach', 'yam', 'apple', 'gelatin',
] as const;

/** The subset of a recipe ingredient this summary needs (see `WorkforceRecipeIngredient`). */
export interface AllergenSummaryIngredient {
  inventoryItemId?: string | null;
  /** null/undefined = not recorded (or unmapped); [] = store confirmed none. */
  allergenCodes?: readonly string[] | null;
}

export type RecipeAllergenSummary =
  /** At least one allergen recorded. `unknownCount` > 0 means some ingredients are not recorded. */
  | { kind: 'recorded'; codes: string[]; unknownCount: number }
  /** Every ingredient is mapped and confirmed none; `vocabularySize` is the number of listed items. */
  | { kind: 'none'; vocabularySize: number }
  /** No ingredients, or no allergen recorded anywhere and at least one ingredient unrecorded. */
  | { kind: 'unrecorded' };

/**
 * Union of allergen codes over all ingredients, ordered by vocabulary order
 * (any code outside the vocabulary -- impossible while the DB CHECK holds --
 * sorts after, alphabetically). An ingredient counts as unknown when it is
 * not mapped to an Inventory item or its item's codes are NULL.
 * "Contains none" is only claimed when there is at least one ingredient and
 * every one of them is mapped and confirmed none -- never inferred from
 * missing data.
 */
export function summarizeRecipeAllergens(
  ingredients: readonly AllergenSummaryIngredient[],
  vocabulary: readonly string[] = RECIPE_ALLERGEN_CODES,
): RecipeAllergenSummary {
  const found = new Set<string>();
  let unknownCount = 0;
  for (const ingredient of ingredients) {
    const codes = ingredient.inventoryItemId ? ingredient.allergenCodes : null;
    if (codes === null || codes === undefined) {
      unknownCount += 1;
      continue;
    }
    for (const code of codes) found.add(code);
  }

  if (found.size > 0) {
    const order = new Map(vocabulary.map((code, index) => [code, index]));
    const codes = [...found].sort((a, b) => {
      const ia = order.get(a);
      const ib = order.get(b);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.localeCompare(b);
    });
    return { kind: 'recorded', codes, unknownCount };
  }

  if (ingredients.length > 0 && unknownCount === 0) {
    return { kind: 'none', vocabularySize: vocabulary.length };
  }

  return { kind: 'unrecorded' };
}
