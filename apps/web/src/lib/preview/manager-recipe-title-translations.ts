import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { ContentTranslation } from '@/lib/content/translations';
import { buildRecipeTranslationWorkspace } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';

/**
 * Produces the Manager list's serializable display copy. Manager edits the
 * source in whichever language is the recipe's `originalLanguage`, while
 * current copy in the OTHER language lives in `content.translations`, so
 * neither legacy column alone is sufficient for live data. Reuse the same
 * current-translation -> legacy -> original precedence as the Staff recipe
 * view for BOTH languages, without changing the persisted recipe model --
 * an en-original recipe's `titleJa` can be just as stale as a ja-original
 * recipe's `titleEn`.
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
    return {
      ...recipe,
      titleEn: resolveFieldDisplay(titleField, 'en').text,
      titleJa: resolveFieldDisplay(titleField, 'ja').text,
    };
  });
}
