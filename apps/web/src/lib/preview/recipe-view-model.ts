import type { Recipe } from '@/lib/demo/cafe/types';
import type { WorkforceRecipeCategory } from '@/lib/workforce/recipe-categories';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import {
  flattenRecipeTranslationFields,
  type RecipeTranslationField,
  type RecipeTranslationWorkspace,
} from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';

/**
 * Resolves either display language through the same symmetric translation
 * precedence. Without a workspace, falls back to the corresponding legacy
 * language column so demo/static callers do not regress.
 */
function resolveText(
  fieldByKey: Map<string, RecipeTranslationField>,
  key: string,
  lang: 'ja' | 'en',
  fallback: string | null,
): string | undefined {
  const field = fieldByKey.get(key);
  if (!field) return fallback ?? undefined;
  return resolveFieldDisplay(field, lang).text;
}

export function toPreviewRecipeViewModel(
  detail: WorkforceRecipeDetail,
  categories: WorkforceRecipeCategory[],
  workspace?: RecipeTranslationWorkspace,
  image?: string,
): Recipe {
  const { recipe, ingredients, steps, notes } = detail;
  const category = categories.find((item) => item.categoryId === recipe.recipeCategoryId);
  const firstNote = notes[0];

  const fieldByKey = new Map(
    workspace ? flattenRecipeTranslationFields(workspace).map((field) => [field.key, field]) : [],
  );
  function noticeFor(lang: 'ja' | 'en') {
    const markers = [...fieldByKey.values()].map((field) => resolveFieldDisplay(field, lang).marker);
    return markers.includes('original')
      ? 'original'
      : markers.includes('machine')
        ? 'machine'
        : markers.includes('reviewed')
          ? 'reviewed'
          : undefined;
  }
  const translationNotice = noticeFor('en');
  const translationNoticeJa = noticeFor('ja');

  const titleKey = `workforce_recipe:${recipe.recipeId}:title`;
  const descriptionKey = `workforce_recipe:${recipe.recipeId}:description`;

  return {
    id: recipe.recipeId,
    contentKind: recipe.contentKind,
    name: resolveText(fieldByKey, titleKey, 'ja', recipe.titleJa) ?? recipe.titleEn ?? '名称未設定',
    nameEn: resolveText(fieldByKey, titleKey, 'en', recipe.titleEn),
    category: category?.labelJa || category?.labelEn || '未分類',
    badges: recipe.isPopular ? ['人気'] : [],
    icon: recipe.contentKind === 'instruction' ? '🛠️' : '☕',
    image,
    description: resolveText(fieldByKey, descriptionKey, 'ja', recipe.descriptionJa) ?? recipe.descriptionEn ?? '',
    descriptionEn: resolveText(fieldByKey, descriptionKey, 'en', recipe.descriptionEn),
    ingredients: ingredients
      .map((item) => resolveText(fieldByKey, `workforce_recipe_ingredient:${item.ingredientId}:label`, 'ja', item.labelJa) ?? item.labelEn ?? '')
      .filter(Boolean),
    ingredientsEn: ingredients
      .map((item) => resolveText(fieldByKey, `workforce_recipe_ingredient:${item.ingredientId}:label`, 'en', item.labelEn) ?? '')
      .filter(Boolean),
    steps: steps
      .map((item) => resolveText(fieldByKey, `workforce_recipe_step:${item.stepId}:instruction`, 'ja', item.instructionJa) ?? item.instructionEn ?? '')
      .filter(Boolean),
    stepsEn: steps
      .map((item) => resolveText(fieldByKey, `workforce_recipe_step:${item.stepId}:instruction`, 'en', item.instructionEn) ?? '')
      .filter(Boolean),
    memoTitle: firstNote
      ? resolveText(fieldByKey, `workforce_recipe_note:${firstNote.noteId}:note_title`, 'ja', firstNote.titleJa) ?? firstNote.titleEn ?? undefined
      : undefined,
    memoTitleEn: firstNote
      ? resolveText(fieldByKey, `workforce_recipe_note:${firstNote.noteId}:note_title`, 'en', firstNote.titleEn)
      : undefined,
    memo: notes
      .map((item) => resolveText(fieldByKey, `workforce_recipe_note:${item.noteId}:note_body`, 'ja', item.bodyJa) ?? item.bodyEn ?? '')
      .filter(Boolean)
      .join('\n'),
    memoEn: notes
      .map((item) => resolveText(fieldByKey, `workforce_recipe_note:${item.noteId}:note_body`, 'en', item.bodyEn) ?? '')
      .filter(Boolean)
      .join('\n'),
    translationNotice,
    translationNoticeJa,
  };
}
