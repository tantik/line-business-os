'use client';

import Link from 'next/link';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { tRecipes } from '../recipes-i18n';

export interface RecipeDetailClientProps {
  recipe: WorkforceRecipeDetail['recipe'];
  ingredients: WorkforceRecipeDetail['ingredients'];
  steps: WorkforceRecipeDetail['steps'];
  notes: WorkforceRecipeDetail['notes'];
  /** Every translatable field this recipe has, keyed for lookup by `field.key` -- see `resolveFieldDisplay`. */
  translationFields: RecipeTranslationField[];
}

/**
 * Outer wrapper: mounts the shared `LangProvider` around the Recipe detail
 * page body, matching the same pattern the canonical Staff dashboard,
 * Admin page, Inventory page, and Recipes list page already use.
 */
export function RecipeDetailClient(props: RecipeDetailClientProps) {
  return (
    <LangProvider>
      <main style={pageStyle(720)}>
        <RecipeDetailBody {...props} />
      </main>
    </LangProvider>
  );
}

function RecipeDetailBody({ recipe, ingredients, steps, notes, translationFields }: RecipeDetailClientProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);

  const fieldByKey = new Map(translationFields.map((field) => [field.key, field]));
  /** Resolves one field's display text for the current `lang` -- falls back to the raw JA/EN column pair if this field somehow has no workspace entry (should not happen; defensive, not load-bearing). */
  function displayText(
    sourceEntityType: RecipeTranslationField['sourceEntityType'],
    sourceEntityId: string,
    sourceField: RecipeTranslationField['sourceField'],
    fallbackJa: string | null,
    fallbackEn: string | null,
  ): string {
    const field = fieldByKey.get(`${sourceEntityType}:${sourceEntityId}:${sourceField}`);
    if (!field) return fallbackJa || fallbackEn || '';
    return resolveFieldDisplay(field, lang).text;
  }

  const title = displayText('workforce_recipe', recipe.recipeId, 'title', recipe.titleJa, recipe.titleEn) || recipe.recipeId;
  const description = displayText('workforce_recipe', recipe.recipeId, 'description', recipe.descriptionJa, recipe.descriptionEn);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard/workforce/recipes" style={{ ...linkAccent, display: 'inline-block', fontSize: 14, textDecoration: 'underline' }}>
          {t('backToRecipes')}
        </Link>
        <PreviewLanguageToggle />
      </div>
      <header style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          {recipe.contentKind === 'instruction' ? <span style={badgeStyle('neutral')}>{t('instructionBadge')}</span> : null}
        </div>
        {description ? <p style={{ margin: '8px 0 0', ...mutedText }}>{description}</p> : null}
      </header>

      {recipe.contentKind === 'recipe' ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('ingredientsHeading')}</h2>
          {ingredients.length === 0 ? (
            <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noIngredients')}</p>
          ) : (
            <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
              {ingredients.map((ingredient) => (
                <li key={ingredient.ingredientId}>
                  {displayText('workforce_recipe_ingredient', ingredient.ingredientId, 'label', ingredient.labelJa, ingredient.labelEn)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('stepsHeading')}</h2>
        {steps.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noSteps')}</p>
        ) : (
          <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            {steps.map((step) => (
              <li key={step.stepId}>
                {displayText('workforce_recipe_step', step.stepId, 'instruction', step.instructionJa, step.instructionEn)}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('notesHeading')}</h2>
        {notes.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noNotes')}</p>
        ) : (
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
            {notes.map((note) => (
              <li key={note.noteId} style={{ marginTop: 8 }}>
                <strong>{displayText('workforce_recipe_note', note.noteId, 'note_title', note.titleJa, note.titleEn)}</strong>
                <p style={{ margin: '4px 0 0' }}>
                  {displayText('workforce_recipe_note', note.noteId, 'note_body', note.bodyJa, note.bodyEn)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
