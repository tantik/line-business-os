import { makeTranslator, type Lang } from './i18n';

interface RecipesDict {
  recipeSharing: string;
  ingredients: string;
  steps: string;
}

/** UI-chrome dictionary for `/demo/cafe/recipes`. Static demo copy only. */
const RECIPES_DICT: Record<Lang, RecipesDict> = {
  ja: {
    recipeSharing: 'レシピ共有',
    ingredients: '材料',
    steps: '作り方',
  },
  en: {
    recipeSharing: 'Recipe sharing',
    ingredients: 'Ingredients',
    steps: 'Steps',
  },
};

export type RecipesDictKey = keyof RecipesDict;

export const tRecipes = makeTranslator(RECIPES_DICT);

/** Static demo category labels — recipe.category is stored as JA text; EN mode maps the known values to simple English equivalents. */
const CATEGORY_EN: Record<string, string> = {
  ドリンク: 'Drink',
  デザート: 'Dessert',
  フード: 'Food',
};

export function tRecipeCategory(lang: Lang, category: string): string {
  if (lang !== 'en') return category;
  return CATEGORY_EN[category] ?? category;
}
