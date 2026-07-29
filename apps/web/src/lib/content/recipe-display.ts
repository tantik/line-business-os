import type { RecipeTranslationField } from './recipe-translation-workspace';

/**
 * Staff-facing display resolution -- the ONE place that decides which text
 * to show for a field, given the viewer's chosen content language. Never
 * touches the network/DB; pure function over already-loaded data.
 *
 * Confirmed precedence (see plan / implementation report for the full
 * rationale) for `lang: 'en'`:
 *   1. A current (non-stale) `content.translations` row -- shown with a
 *      `machine` or `reviewed` marker (only these rows carry that
 *      metadata).
 *   2. Else the legacy `*_en` column, if set -- covers both "never
 *      translated" and "translation is stale": a stale row never overrides
 *      a valid legacy value, it's simply treated the same as absent. No
 *      marker (legacy values have no provider/review metadata to report).
 *   3. Else the Japanese original, with an `original` marker.
 * `lang: 'ja'` always shows the Japanese original, no marker.
 */
export type RecipeFieldDisplayMarker = 'machine' | 'reviewed' | 'original' | null;

export interface RecipeFieldDisplay {
  text: string;
  marker: RecipeFieldDisplayMarker;
}

export function resolveFieldDisplay(field: RecipeTranslationField, lang: 'ja' | 'en'): RecipeFieldDisplay {
  if (lang === 'ja') {
    return { text: field.sourceText, marker: null };
  }

  if (field.existing && !field.isStale) {
    return {
      text: field.existing.translatedText,
      marker: field.existing.status === 'reviewed' ? 'reviewed' : 'machine',
    };
  }

  if (field.legacyEnText) {
    return { text: field.legacyEnText, marker: null };
  }

  return { text: field.sourceText, marker: 'original' };
}
