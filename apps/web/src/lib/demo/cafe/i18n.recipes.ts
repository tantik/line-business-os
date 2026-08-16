import { makeTranslator, type Lang } from './i18n';

interface RecipesDict {
  recipeSharing: string;
  ingredients: string;
  steps: string;
  noPublishedRecipes: string;
  backToRecipeList: string;
  instructionBadge: string;
  notes: string;
  noIngredients: string;
  noSteps: string;
  noNotes: string;
}

/** UI-chrome dictionary for `/demo/cafe/recipes` and the DB-backed preview recipe browser/detail. Static system-chrome copy only -- NOT for user-authored recipe content (title/description/ingredients/steps/notes text), which is a separate concern (see docs/phase-1o's "User-generated content translation" section). */
const RECIPES_DICT: Record<Lang, RecipesDict> = {
  ja: {
    recipeSharing: 'レシピ共有',
    ingredients: '材料',
    steps: '作り方',
    noPublishedRecipes: '公開中のレシピはありません。',
    backToRecipeList: 'レシピ一覧に戻る',
    instructionBadge: 'ⓘ インストラクション',
    notes: 'メモ',
    noIngredients: '材料の記載はありません。',
    noSteps: '手順の記載はありません。',
    noNotes: 'メモはありません。',
  },
  en: {
    recipeSharing: 'Recipe sharing',
    ingredients: 'Ingredients',
    steps: 'Steps',
    noPublishedRecipes: 'No published recipes yet.',
    backToRecipeList: 'Back to recipe list',
    instructionBadge: 'ⓘ Instruction',
    notes: 'Notes',
    noIngredients: 'No ingredients listed.',
    noSteps: 'No steps listed.',
    noNotes: 'No notes.',
  },
};

export type RecipesDictKey = keyof RecipesDict;

export const tRecipes = makeTranslator(RECIPES_DICT);

/**
 * Static category labels — recipe.category is stored as JA text; EN mode maps
 * known values to simple English equivalents. NOT machine-translated and NOT
 * part of the `content.translations` Recipe Translation Workspace (recipe
 * categories are a separate entity, `workforce_recipe_categories`, outside
 * `ContentSourceEntityType`) — this is a deliberately small, hand-maintained
 * lookup, same as the original demo categories below. Includes both the
 * original demo set (`ドリンク`/`デザート`/`フード`) and the real Mame To Cha
 * showcase/fixture categories (`packages/db/scripts/mame-to-cha-showcase.ts`,
 * `mame-to-cha-fixture.ts`) so no known category falls through to Japanese in
 * English mode. Also covers `recipe-view-model.ts`'s own hardcoded `'未分類'`
 * fallback (shown when a recipe has no category at all), so the "no
 * category" empty state is translated too. Add an entry here whenever a new
 * category label is introduced anywhere in demo or fixture data.
 */
const CATEGORY_EN: Record<string, string> = {
  ドリンク: 'Drink',
  デザート: 'Dessert',
  フード: 'Food',
  業務マニュアル: 'Business Manual',
  未分類: 'Uncategorized',
  'カクテル・ドリンク': 'Cocktails & Drinks',
};

export function tRecipeCategory(lang: Lang, category: string): string {
  if (lang !== 'en') return category;
  return CATEGORY_EN[category] ?? category;
}
