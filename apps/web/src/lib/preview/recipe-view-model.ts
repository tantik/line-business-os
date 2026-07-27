import type { Recipe } from '@/lib/demo/cafe/types';
import type { WorkforceRecipeCategory } from '@/lib/workforce/recipe-categories';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';

export function toPreviewRecipeViewModel(
  detail: WorkforceRecipeDetail,
  categories: WorkforceRecipeCategory[],
): Recipe {
  const { recipe, ingredients, steps, notes } = detail;
  const category = categories.find((item) => item.categoryId === recipe.recipeCategoryId);
  const firstNote = notes[0];

  return {
    id: recipe.recipeId,
    contentKind: recipe.contentKind,
    name: recipe.titleJa || recipe.titleEn || '名称未設定',
    nameEn: recipe.titleEn ?? undefined,
    category: category?.labelJa || category?.labelEn || '未分類',
    badges: recipe.isPopular ? ['人気'] : [],
    icon: recipe.contentKind === 'instruction' ? '🛠️' : '☕',
    description: recipe.descriptionJa || recipe.descriptionEn || '',
    descriptionEn: recipe.descriptionEn ?? undefined,
    ingredients: ingredients.map((item) => item.labelJa || item.labelEn || '').filter(Boolean),
    ingredientsEn: ingredients.map((item) => item.labelEn || item.labelJa || '').filter(Boolean),
    steps: steps.map((item) => item.instructionJa || item.instructionEn || '').filter(Boolean),
    stepsEn: steps.map((item) => item.instructionEn || item.instructionJa || '').filter(Boolean),
    memoTitle: firstNote?.titleJa || firstNote?.titleEn || undefined,
    memoTitleEn: firstNote?.titleEn || firstNote?.titleJa || undefined,
    memo: notes.map((item) => item.bodyJa || item.bodyEn || '').filter(Boolean).join('\n'),
    memoEn: notes.map((item) => item.bodyEn || item.bodyJa || '').filter(Boolean).join('\n'),
  };
}
