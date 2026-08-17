import { isTranslationStale } from './translations';
import type { ContentSourceEntityType, ContentSourceField, ContentTranslation } from './translations';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';

/**
 * Pure data-shaping layer that turns a `WorkforceRecipeDetail` (human source
 * content in whichever `*_ja`/`*_en` column pair matches the recipe's
 * `originalLanguage`, plus the recipe's `content.translations` rows) into
 * one flat, per-field structure. Both the Manager translation panel and
 * Staff rendering (`recipe-display.ts`) build on this same shape, so the
 * "what are this recipe's translatable fields" list is defined exactly
 * once.
 *
 * Direction is resolved ONCE per recipe (`recipe.originalLanguage`), never
 * guessed per field -- mixed JA/EN content within one recipe (brand names,
 * measurements) is normal and must not flip direction field-by-field.
 */
export interface RecipeTranslationField {
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
  /** Stable key for list rendering: `${sourceEntityType}:${sourceEntityId}:${sourceField}`. */
  key: string;
  /** This recipe's original/source language -- same value for every field of a given recipe. */
  originalLanguage: 'ja' | 'en';
  /** The human-authored text in `originalLanguage`. */
  sourceText: string;
  /** Whatever raw value already sits in the OTHER language's column (pre-content.translations legacy value, or an en-original recipe's not-yet-translated ja column, etc.) -- an honest fallback only, never fabricated. */
  legacyOtherLanguageText: string | null;
  existing: ContentTranslation | null;
  isStale: boolean;
}

export interface RecipeTranslationSection {
  section: 'title' | 'description' | 'ingredients' | 'steps' | 'notes';
  fields: RecipeTranslationField[];
}

export interface RecipeTranslationWorkspace {
  recipeId: string;
  sections: RecipeTranslationSection[];
}

function otherLanguage(lang: 'ja' | 'en'): 'ja' | 'en' {
  return lang === 'ja' ? 'en' : 'ja';
}

function findTranslation(
  translations: ContentTranslation[],
  sourceEntityType: ContentSourceEntityType,
  sourceEntityId: string,
  sourceField: ContentSourceField,
  targetLanguage: 'ja' | 'en',
): ContentTranslation | null {
  return (
    translations.find(
      (t) =>
        t.sourceEntityType === sourceEntityType &&
        t.sourceEntityId === sourceEntityId &&
        t.sourceField === sourceField &&
        t.targetLanguage === targetLanguage,
    ) ?? null
  );
}

/**
 * Builds one `RecipeTranslationField` from a single source field's raw
 * values. Exported so a caller that only needs one or two fields (e.g. a
 * recipe list's title, without loading the whole recipe detail) can reuse
 * the exact same existing/staleness resolution as the full workspace below,
 * rather than re-deriving it.
 */
export function buildRecipeTranslationField(
  sourceEntityType: ContentSourceEntityType,
  sourceEntityId: string,
  sourceField: ContentSourceField,
  originalLanguage: 'ja' | 'en',
  sourceText: string,
  legacyOtherLanguageText: string | null,
  translations: ContentTranslation[],
): RecipeTranslationField {
  const existing = findTranslation(
    translations,
    sourceEntityType,
    sourceEntityId,
    sourceField,
    otherLanguage(originalLanguage),
  );
  const isStale = existing !== null && isTranslationStale(existing, sourceText);
  return {
    sourceEntityType,
    sourceEntityId,
    sourceField,
    key: `${sourceEntityType}:${sourceEntityId}:${sourceField}`,
    originalLanguage,
    sourceText,
    legacyOtherLanguageText,
    existing,
    isStale,
  };
}

export function buildRecipeTranslationWorkspace(
  detail: WorkforceRecipeDetail,
  translations: ContentTranslation[],
): RecipeTranslationWorkspace {
  const { recipe, ingredients, steps, notes } = detail;
  const lang = recipe.originalLanguage;
  const isJa = lang === 'ja';

  const titleSource = (isJa ? recipe.titleJa : recipe.titleEn) ?? '';
  const titleOther = isJa ? recipe.titleEn : recipe.titleJa;
  const descriptionSource = isJa ? recipe.descriptionJa : recipe.descriptionEn;
  const descriptionOther = isJa ? recipe.descriptionEn : recipe.descriptionJa;

  const sections: RecipeTranslationSection[] = [
    {
      section: 'title',
      fields: [buildRecipeTranslationField('workforce_recipe', recipe.recipeId, 'title', lang, titleSource, titleOther, translations)],
    },
    {
      section: 'description',
      fields: descriptionSource
        ? [
            buildRecipeTranslationField(
              'workforce_recipe',
              recipe.recipeId,
              'description',
              lang,
              descriptionSource,
              descriptionOther,
              translations,
            ),
          ]
        : [],
    },
    {
      section: 'ingredients',
      fields: ingredients.map((ingredient) =>
        buildRecipeTranslationField(
          'workforce_recipe_ingredient',
          ingredient.ingredientId,
          'label',
          lang,
          (isJa ? ingredient.labelJa : ingredient.labelEn) ?? '',
          isJa ? ingredient.labelEn : ingredient.labelJa,
          translations,
        ),
      ),
    },
    {
      section: 'steps',
      fields: steps.map((step) =>
        buildRecipeTranslationField(
          'workforce_recipe_step',
          step.stepId,
          'instruction',
          lang,
          (isJa ? step.instructionJa : step.instructionEn) ?? '',
          isJa ? step.instructionEn : step.instructionJa,
          translations,
        ),
      ),
    },
    {
      section: 'notes',
      fields: notes.flatMap((note) => [
        buildRecipeTranslationField(
          'workforce_recipe_note',
          note.noteId,
          'note_title',
          lang,
          (isJa ? note.titleJa : note.titleEn) ?? '',
          isJa ? note.titleEn : note.titleJa,
          translations,
        ),
        buildRecipeTranslationField(
          'workforce_recipe_note',
          note.noteId,
          'note_body',
          lang,
          (isJa ? note.bodyJa : note.bodyEn) ?? '',
          isJa ? note.bodyEn : note.bodyJa,
          translations,
        ),
      ]),
    },
  ];

  return { recipeId: recipe.recipeId, sections };
}

/** Flat list of every field across all sections -- convenient for building a translation batch request. */
export function flattenRecipeTranslationFields(workspace: RecipeTranslationWorkspace): RecipeTranslationField[] {
  return workspace.sections.flatMap((section) => section.fields);
}
