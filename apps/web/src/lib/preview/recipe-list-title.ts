import type { WorkforceRecipe } from '@/lib/workforce/recipes';
import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Canonical title resolution for the recipe list row: the title in the
 * viewer's language, unless it's null/undefined/whitespace-only (e.g. an
 * en-original recipe has no human titleJa, or a ja-original recipe has no
 * legacy/machine titleEn yet), in which case falls back to whichever title
 * IS present -- the recipe list has no untranslated-title state to show.
 *
 * Kept in its own module (no `server-only` action imports) so it can be
 * exercised directly in tests without pulling in the full client component's
 * module graph.
 */
export function resolveRecipeListTitle(
  recipe: Pick<WorkforceRecipe, 'titleJa' | 'titleEn'>,
  lang: Lang,
): string {
  const preferred = lang === 'en' ? recipe.titleEn : recipe.titleJa;
  const fallback = lang === 'en' ? recipe.titleJa : recipe.titleEn;
  return (preferred && preferred.trim() !== '' ? preferred : fallback) ?? '';
}
