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
 * Resolves the EN text for one field via `resolveFieldDisplay` (current
 * `content.translations` row -> legacy `*_en` column -> Japanese original,
 * per the documented precedence) when a workspace is supplied. Without a
 * workspace, falls back to the legacy `*_en`-or-`undefined` behavior this
 * function had before `content.translations` existed -- kept only so any
 * future caller that hasn't loaded a workspace yet doesn't regress.
 */
function resolveEnText(
  fieldByKey: Map<string, RecipeTranslationField>,
  key: string,
  legacyEnFallback: string | null,
): string | undefined {
  const field = fieldByKey.get(key);
  if (!field) return legacyEnFallback ?? undefined;
  return resolveFieldDisplay(field, 'en').text;
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
  const englishMarkers = [...fieldByKey.values()].map((field) => resolveFieldDisplay(field, 'en').marker);
  const translationNotice = englishMarkers.includes('original')
    ? 'original'
    : englishMarkers.includes('machine')
      ? 'machine'
      : englishMarkers.includes('reviewed')
        ? 'reviewed'
        : undefined;

  return {
    id: recipe.recipeId,
    contentKind: recipe.contentKind,
    name: recipe.titleJa || recipe.titleEn || '名称未設定',
    nameEn: resolveEnText(fieldByKey, `workforce_recipe:${recipe.recipeId}:title`, recipe.titleEn),
    category: category?.labelJa || category?.labelEn || '未分類',
    badges: recipe.isPopular ? ['人気'] : [],
    icon: recipe.contentKind === 'instruction' ? '🛠️' : '☕',
    image,
    description: recipe.descriptionJa || recipe.descriptionEn || '',
    descriptionEn: recipe.descriptionJa
      ? resolveEnText(fieldByKey, `workforce_recipe:${recipe.recipeId}:description`, recipe.descriptionEn)
      : undefined,
    ingredients: ingredients.map((item) => item.labelJa || item.labelEn || '').filter(Boolean),
    ingredientsEn: ingredients
      .map((item) => resolveEnText(fieldByKey, `workforce_recipe_ingredient:${item.ingredientId}:label`, item.labelEn) ?? '')
      .filter(Boolean),
    steps: steps.map((item) => item.instructionJa || item.instructionEn || '').filter(Boolean),
    stepsEn: steps
      .map((item) => resolveEnText(fieldByKey, `workforce_recipe_step:${item.stepId}:instruction`, item.instructionEn) ?? '')
      .filter(Boolean),
    memoTitle: firstNote?.titleJa || firstNote?.titleEn || undefined,
    memoTitleEn: firstNote
      ? resolveEnText(fieldByKey, `workforce_recipe_note:${firstNote.noteId}:note_title`, firstNote.titleEn)
      : undefined,
    memo: notes.map((item) => item.bodyJa || item.bodyEn || '').filter(Boolean).join('\n'),
    memoEn: notes
      .map((item) => resolveEnText(fieldByKey, `workforce_recipe_note:${item.noteId}:note_body`, item.bodyEn) ?? '')
      .filter(Boolean)
      .join('\n'),
    translationNotice,
  };
}
