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

/**
 * The Manager list row's PRIMARY (bold) title: always the human-authored
 * source text in the recipe's own `originalLanguage`, regardless of which
 * language the Manager's UI chrome is currently set to. `resolveRecipeListTitle`
 * above picks a title by *viewer* language, which for a JA-original recipe
 * viewed with an EN chrome silently substitutes the machine/reviewed EN
 * translation with no marker -- indistinguishable from something the Manager
 * actually typed. This function exists so the list can never show that as
 * the primary title (Founder-approved recipe contract, Part J): "Manager
 * authoring surfaces must make it impossible to think the system changed
 * what I wrote." Falls back to whichever title text is present only for the
 * pathological case of a legacy row missing its own source column.
 */
export function resolveRecipeListSourceTitle(
  recipe: Pick<WorkforceRecipe, 'titleJa' | 'titleEn' | 'originalLanguage'>,
): string {
  const source = recipe.originalLanguage === 'en' ? recipe.titleEn : recipe.titleJa;
  const fallback = recipe.originalLanguage === 'en' ? recipe.titleJa : recipe.titleEn;
  return (source && source.trim() !== '' ? source : fallback) ?? '';
}

/**
 * The Manager list row's SECONDARY (translation) line: only rendered when
 * the Manager's UI chrome language differs from the recipe's own
 * `originalLanguage`, i.e. only when there is in fact a translated (not
 * source) string to show. Returns null when chrome lang matches
 * originalLanguage (nothing to show -- the primary title above already IS
 * that language) or when no translated text is available yet.
 */
export function resolveRecipeListTranslationTitle(
  recipe: Pick<WorkforceRecipe, 'titleJa' | 'titleEn' | 'originalLanguage'>,
  lang: Lang,
): string | null {
  if (lang === recipe.originalLanguage) return null;
  const translated = lang === 'en' ? recipe.titleEn : recipe.titleJa;
  return translated && translated.trim() !== '' ? translated : null;
}
