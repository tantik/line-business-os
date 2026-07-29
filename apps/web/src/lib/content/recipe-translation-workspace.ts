import { isTranslationStale } from './translations';
import type { ContentSourceEntityType, ContentSourceField, ContentTranslation } from './translations';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';

/**
 * Pure data-shaping layer that turns a `WorkforceRecipeDetail` (Japanese
 * original + legacy `*_en` columns) plus the recipe's `content.translations`
 * rows into one flat, per-field structure. Both the Manager translation
 * panel and Staff rendering (`recipe-display.ts`) build on this same shape,
 * so the "what are this recipe's translatable fields" list is defined
 * exactly once.
 */
export interface RecipeTranslationField {
  sourceEntityType: ContentSourceEntityType;
  sourceEntityId: string;
  sourceField: ContentSourceField;
  /** Stable key for list rendering: `${sourceEntityType}:${sourceEntityId}:${sourceField}`. */
  key: string;
  sourceText: string;
  /** Legacy static English column value (migration 0021), if any -- see recipe-display.ts for how this combines with `existing`. */
  legacyEnText: string | null;
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

function findTranslation(
  translations: ContentTranslation[],
  sourceEntityType: ContentSourceEntityType,
  sourceEntityId: string,
  sourceField: ContentSourceField,
): ContentTranslation | null {
  return (
    translations.find(
      (t) =>
        t.sourceEntityType === sourceEntityType &&
        t.sourceEntityId === sourceEntityId &&
        t.sourceField === sourceField &&
        t.targetLanguage === 'en',
    ) ?? null
  );
}

function makeField(
  sourceEntityType: ContentSourceEntityType,
  sourceEntityId: string,
  sourceField: ContentSourceField,
  sourceText: string,
  legacyEnText: string | null,
  translations: ContentTranslation[],
): RecipeTranslationField {
  const existing = findTranslation(translations, sourceEntityType, sourceEntityId, sourceField);
  const isStale = existing !== null && isTranslationStale(existing, sourceText);
  return {
    sourceEntityType,
    sourceEntityId,
    sourceField,
    key: `${sourceEntityType}:${sourceEntityId}:${sourceField}`,
    sourceText,
    legacyEnText,
    existing,
    isStale,
  };
}

export function buildRecipeTranslationWorkspace(
  detail: WorkforceRecipeDetail,
  translations: ContentTranslation[],
): RecipeTranslationWorkspace {
  const { recipe, ingredients, steps, notes } = detail;

  const sections: RecipeTranslationSection[] = [
    {
      section: 'title',
      fields: [makeField('workforce_recipe', recipe.recipeId, 'title', recipe.titleJa, recipe.titleEn, translations)],
    },
    {
      section: 'description',
      fields: recipe.descriptionJa
        ? [
            makeField(
              'workforce_recipe',
              recipe.recipeId,
              'description',
              recipe.descriptionJa,
              recipe.descriptionEn,
              translations,
            ),
          ]
        : [],
    },
    {
      section: 'ingredients',
      fields: ingredients.map((ingredient) =>
        makeField(
          'workforce_recipe_ingredient',
          ingredient.ingredientId,
          'label',
          ingredient.labelJa,
          ingredient.labelEn,
          translations,
        ),
      ),
    },
    {
      section: 'steps',
      fields: steps.map((step) =>
        makeField('workforce_recipe_step', step.stepId, 'instruction', step.instructionJa, step.instructionEn, translations),
      ),
    },
    {
      section: 'notes',
      fields: notes.flatMap((note) => [
        makeField('workforce_recipe_note', note.noteId, 'note_title', note.titleJa, note.titleEn, translations),
        makeField('workforce_recipe_note', note.noteId, 'note_body', note.bodyJa, note.bodyEn, translations),
      ]),
    },
  ];

  return { recipeId: recipe.recipeId, sections };
}

/** Flat list of every field across all sections -- convenient for building a translation batch request. */
export function flattenRecipeTranslationFields(workspace: RecipeTranslationWorkspace): RecipeTranslationField[] {
  return workspace.sections.flatMap((section) => section.fields);
}
