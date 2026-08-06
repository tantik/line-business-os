import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Canonical title resolution for the recipe list row: Japanese in JA mode;
 * in EN mode, the English title unless it's null, undefined, or
 * whitespace-only, in which case falls back to Japanese (the recipe list
 * has no untranslated-title state to show).
 *
 * Kept in its own module (no `server-only` action imports) so it can be
 * exercised directly in tests without pulling in the full client component's
 * module graph.
 */
export function resolveRecipeListTitle(
  recipe: Pick<WorkforceRecipe, 'titleJa' | 'titleEn'>,
  lang: Lang,
): string {
  if (lang !== 'en') return recipe.titleJa;
  const titleEn = recipe.titleEn;
  return titleEn && titleEn.trim() !== '' ? titleEn : recipe.titleJa;
}
