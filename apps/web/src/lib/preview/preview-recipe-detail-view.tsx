'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { RecipeTranslationWorkspace } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay, type RecipeFieldDisplayMarker } from '@/lib/content/recipe-display';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tRecipes } from '@/lib/demo/cafe/i18n.recipes';
import { tRecipeTranslation } from '@/lib/demo/cafe/i18n.recipe-translation';

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

export interface PreviewRecipeDetailViewProps {
  detail: WorkforceRecipeDetail;
  workspace: RecipeTranslationWorkspace;
  recipesListPath: string;
}

function markerLabel(marker: RecipeFieldDisplayMarker, t: (key: Parameters<typeof tRecipeTranslation>[1]) => string): string | null {
  if (marker === 'machine') return t('staffMachineMarker');
  if (marker === 'original') return t('staffOriginalMarker');
  // 'reviewed' and null both render with no marker -- a reviewed translation
  // reads as ordinary English content, and the Japanese-original branch
  // never calls this (viewLang === 'ja' short-circuits before resolveFieldDisplay is used for display).
  return null;
}

/**
 * Client component so it can read `useLang()` (system chrome) and hold its
 * own `viewLang` (recipe CONTENT language, independent of chrome language --
 * per the brief, the English/Japanese-original toggle here must only affect
 * which recipe text is shown, never the surrounding UI language). Every
 * field's displayed text and marker come from `resolveFieldDisplay`
 * (`@/lib/content/recipe-display.ts`) -- never provider errors, UUIDs,
 * hashes, or reviewer identity, by construction of that function's output.
 */
export function PreviewRecipeDetailView({ detail, workspace, recipesListPath }: PreviewRecipeDetailViewProps) {
  const { recipe, ingredients, steps, notes } = detail;
  const { lang } = useLang();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const tTranslate = (key: Parameters<typeof tRecipeTranslation>[1]) => tRecipeTranslation(lang, key);
  const [viewLang, setViewLang] = useState<'ja' | 'en'>(lang);

  const fieldByKey = new Map(workspace.sections.flatMap((section) => section.fields).map((field) => [field.key, field]));
  function display(key: string, fallbackText: string) {
    const field = fieldByKey.get(key);
    if (!field) return { text: fallbackText, marker: null as RecipeFieldDisplayMarker };
    return resolveFieldDisplay(field, viewLang);
  }

  function FieldMarker({ marker }: { marker: RecipeFieldDisplayMarker }) {
    const label = markerLabel(marker, tTranslate);
    if (!label) return null;
    return (
      <span style={{ ...badgeStyle('neutral'), marginLeft: 8, fontSize: 11 }}>{label}</span>
    );
  }

  const titleDisplay = display(`workforce_recipe:${recipe.recipeId}:title`, recipe.titleJa || recipe.titleEn || recipe.recipeId);
  const descriptionDisplay = recipe.descriptionJa || recipe.descriptionEn
    ? display(`workforce_recipe:${recipe.recipeId}:description`, recipe.descriptionJa || recipe.descriptionEn || '')
    : null;

  return (
    <main style={pageStyle(720)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href={recipesListPath} style={{ ...linkAccent, display: 'inline-block', fontSize: 14, textDecoration: 'underline' }}>
          {t('backToRecipeList')}
        </Link>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            style={{ ...badgeStyle(viewLang === 'en' ? 'active' : 'inactive'), cursor: 'pointer', border: 'none' }}
            onClick={() => setViewLang('en')}
          >
            {tTranslate('staffViewEnglish')}
          </button>
          <button
            type="button"
            style={{ ...badgeStyle(viewLang === 'ja' ? 'active' : 'inactive'), cursor: 'pointer', border: 'none' }}
            onClick={() => setViewLang('ja')}
          >
            {tTranslate('staffViewJapanese')}
          </button>
        </div>
      </div>
      <header style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{titleDisplay.text}</h1>
          <FieldMarker marker={titleDisplay.marker} />
          {recipe.contentKind === 'instruction' ? <span style={badgeStyle('neutral')}>{t('instructionBadge')}</span> : null}
        </div>
        {descriptionDisplay ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {descriptionDisplay.text}
            <FieldMarker marker={descriptionDisplay.marker} />
          </p>
        ) : null}
      </header>

      {recipe.contentKind === 'recipe' ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('ingredients')}</h2>
          {ingredients.length === 0 ? (
            <EmptyStateText>{t('noIngredients')}</EmptyStateText>
          ) : (
            <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
              {ingredients.map((ingredient) => {
                const d = display(`workforce_recipe_ingredient:${ingredient.ingredientId}:label`, ingredient.labelJa || ingredient.labelEn || '');
                return (
                  <li key={ingredient.ingredientId}>
                    {d.text}
                    <FieldMarker marker={d.marker} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('steps')}</h2>
        {steps.length === 0 ? (
          <EmptyStateText>{t('noSteps')}</EmptyStateText>
        ) : (
          <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
            {steps.map((step) => {
              const d = display(`workforce_recipe_step:${step.stepId}:instruction`, step.instructionJa || step.instructionEn || '');
              return (
                <li key={step.stepId}>
                  {d.text}
                  <FieldMarker marker={d.marker} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('notes')}</h2>
        {notes.length === 0 ? (
          <EmptyStateText>{t('noNotes')}</EmptyStateText>
        ) : (
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
            {notes.map((note) => {
              const titleD = display(`workforce_recipe_note:${note.noteId}:note_title`, note.titleJa || note.titleEn || '');
              const bodyD = display(`workforce_recipe_note:${note.noteId}:note_body`, note.bodyJa || note.bodyEn || '');
              return (
                <li key={note.noteId} style={{ marginTop: 8 }}>
                  <strong>{titleD.text}</strong>
                  <FieldMarker marker={titleD.marker} />
                  <p style={{ margin: '4px 0 0' }}>
                    {bodyD.text}
                    <FieldMarker marker={bodyD.marker} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
