import type { RecipeTranslationField } from './recipe-translation-workspace';

/**
 * Staff-facing display resolution -- the ONE place that decides which text
 * to show for a field, given the viewer's chosen content language. Never
 * touches the network/DB; pure function over already-loaded data.
 *
 * Symmetric by construction: when `lang` equals the recipe's
 * `originalLanguage`, the persisted human original is shown directly (no
 * translation lookup at all). When `lang` is the OTHER language:
 *   1. A current (non-stale) `content.translations` row -- shown with a
 *      `machine` or `reviewed` marker (only these rows carry that
 *      metadata).
 *   2. Else the legacy other-language column, if set -- covers both "never
 *      translated" and "translation is stale": a stale row never overrides
 *      a valid legacy value, it's simply treated the same as absent. No
 *      marker (legacy values have no provider/review metadata to report).
 *   3. Else the source text itself, with an `original` marker -- an honest
 *      fallback, never a fabricated translation.
 */
export type RecipeFieldDisplayMarker = 'machine' | 'reviewed' | 'original' | null;

export interface RecipeFieldDisplay {
  text: string;
  marker: RecipeFieldDisplayMarker;
}

export function resolveFieldDisplay(field: RecipeTranslationField, lang: 'ja' | 'en'): RecipeFieldDisplay {
  if (lang === field.originalLanguage) {
    return { text: field.sourceText, marker: null };
  }

  if (field.existing && !field.isStale) {
    return {
      text: field.existing.translatedText,
      marker: field.existing.status === 'reviewed' ? 'reviewed' : 'machine',
    };
  }

  if (field.legacyOtherLanguageText) {
    return { text: field.legacyOtherLanguageText, marker: null };
  }

  return { text: field.sourceText, marker: 'original' };
}
