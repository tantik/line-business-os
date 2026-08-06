import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { ContentTranslation } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';

/**
 * Produces the Manager list's serializable display copy. Manager edits the
 * Japanese source while current English copy lives in `content.translations`,
 * so the legacy `titleEn` column alone is not sufficient for live data.
 * Reuse the same current-translation -> legacy -> original precedence as the
 * Staff recipe view, without changing the persisted recipe model.
 *
 * This module is server-side by import boundary because the translation
 * service hashes source text with node:crypto. Never import it from the
 * client list component (guarded by the language-toggle regression test and
 * the production build).
 */
export function withResolvedRecipeListTitles(
  recipes: WorkforceRecipe[],
  translations: ContentTranslation[],
): WorkforceRecipe[] {
  return recipes.map((recipe) => {
    const workspace = buildRecipeTranslationWorkspace(
      { recipe, ingredients: [], steps: [], notes: [] },
      translations,
    );
    const titleField = workspace.sections[0]?.fields[0];
    if (!titleField) return recipe;
    return { ...recipe, titleEn: resolveFieldDisplay(titleField, 'en').text };
  });
}
