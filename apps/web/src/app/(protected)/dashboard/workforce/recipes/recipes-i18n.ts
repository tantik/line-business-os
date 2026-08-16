import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical Recipes/SOP page chrome
 * (`/dashboard/workforce/recipes` and `/dashboard/workforce/recipes/[recipeId]`).
 * Reuses the existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`), the same one the canonical Staff dashboard,
 * Admin page, and Inventory page already use -- a new dictionary, not a new
 * i18n system. Closes the Cafe v2.1 Product/UX Reconciliation Audit's
 * Recipes finding (§8, §14/§16, Part G): recipe *content* is already
 * bilingual by data model (`titleJa`/`titleEn` etc.), but the surrounding
 * page chrome was hardcoded English. Does not modify the recipe
 * translation data architecture -- chrome only.
 */
interface RecipesDict {
  pageTitle: string;
  pageDescription: string;
  backToWorkforce: string;
  backToRecipes: string;
  unavailable: string;
  noRecipesYet: string;
  noRecipesInCategory: string;
  uncategorized: string;
  instructionBadge: string;
  ingredientsHeading: string;
  noIngredients: string;
  stepsHeading: string;
  noSteps: string;
  notesHeading: string;
  noNotes: string;
}

const dictionary: Record<Lang, RecipesDict> = {
  en: {
    pageTitle: 'Recipes',
    pageDescription: 'Published recipes for',
    backToWorkforce: 'Back to Workforce',
    backToRecipes: 'Back to recipes',
    unavailable: 'Recipes are temporarily unavailable.',
    noRecipesYet: 'No recipes available yet.',
    noRecipesInCategory: 'No recipes in this category yet.',
    uncategorized: 'Uncategorized',
    instructionBadge: 'ⓘ Instruction',
    ingredientsHeading: 'Ingredients',
    noIngredients: 'No ingredients listed.',
    stepsHeading: 'Steps',
    noSteps: 'No steps listed.',
    notesHeading: 'Notes',
    noNotes: 'No notes.',
  },
  ja: {
    pageTitle: 'レシピ',
    pageDescription: '公開中のレシピ -',
    backToWorkforce: 'ワークフォースに戻る',
    backToRecipes: 'レシピ一覧に戻る',
    unavailable: 'レシピは一時的に利用できません。',
    noRecipesYet: 'まだ利用可能なレシピがありません。',
    noRecipesInCategory: 'このカテゴリにはまだレシピがありません。',
    uncategorized: '未分類',
    instructionBadge: 'ⓘ 手順書',
    ingredientsHeading: '材料',
    noIngredients: '材料が登録されていません。',
    stepsHeading: '手順',
    noSteps: '手順が登録されていません。',
    notesHeading: 'メモ',
    noNotes: 'メモはありません。',
  },
};

export const tRecipes = makeTranslator(dictionary);
