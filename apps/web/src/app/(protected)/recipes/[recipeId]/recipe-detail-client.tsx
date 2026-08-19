'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';
import { getRecipeDetailForPopup, setRecipeArchived, permanentlyDeleteRecipe } from '@/lib/workforce/recipe-actions';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { alertDanger, backLink, badgeStyle, buttonDisabled, buttonSecondary, card, mutedText, pageStyle } from '@/lib/ui/theme';
import { buttonDanger } from '../../_ui/workforce-theme';
import { describeWriteError } from '../../manager/error-copy';
import { RecipeForm } from '../recipe-form';
import { tRecipes } from '../recipes-i18n';

export interface RecipeDetailClientProps {
  recipe: WorkforceRecipeDetail['recipe'];
  ingredients: WorkforceRecipeDetail['ingredients'];
  steps: WorkforceRecipeDetail['steps'];
  notes: WorkforceRecipeDetail['notes'];
  /** Every translatable field this recipe has, keyed for lookup by `field.key` -- see `resolveFieldDisplay`. */
  translationFields: RecipeTranslationField[];
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show Edit/Archive/Delete controls. */
  canManage: boolean;
  /**
   * True only when rendered inside the Manager dashboard's Recipes popup
   * (WP A5b) -- skips this component's own page-level language-toggle/
   * sign-out, and swaps the "back to recipes" `<Link>` for a same-popup
   * `onBack` callback (a view swap back to the list, not a page
   * navigation), matching the Founder's "popups look like one component"
   * direction. Defaults false -- the standalone `/recipes/[recipeId]`
   * page's own behavior is completely unchanged.
   */
  embedded?: boolean;
  /** Required when `embedded` is true; ignored otherwise. */
  onBack?: () => void;
  /**
   * Required when `embedded` is true: called instead of `router.refresh()`
   * after a successful archive/restore/edit, since this data was fetched
   * client-side by the popup wrapper (WP A5b), not by a server component
   * `router.refresh()` would re-render.
   */
  onChange?: () => void;
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

/** WP C1: same interval/shape as `recipes-list-client.tsx`'s list poll, matching the Staff dashboard schedule poll this pattern originates from. */
const RECIPE_DETAIL_POLL_INTERVAL_MS = 2500;

export function RecipeDetailBody({
  recipe: initialRecipe,
  ingredients: initialIngredients,
  steps: initialSteps,
  notes: initialNotes,
  translationFields: initialTranslationFields,
  canManage,
  embedded = false,
  onBack,
  onChange,
}: RecipeDetailClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [recipe, setRecipe] = useState(initialRecipe);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [steps, setSteps] = useState(initialSteps);
  const [notes, setNotes] = useState(initialNotes);
  const [translationFields, setTranslationFields] = useState(initialTranslationFields);

  useEffect(() => {
    setRecipe(initialRecipe);
    setIngredients(initialIngredients);
    setSteps(initialSteps);
    setNotes(initialNotes);
    setTranslationFields(initialTranslationFields);
  }, [initialRecipe, initialIngredients, initialSteps, initialNotes, initialTranslationFields]);

  // WP C1 (Track C, live-sync): skip while embedded (Manager's popup already
  // refreshes itself via onChange) or while a manage-only edit form is open
  // (never overwrite content the caller is actively editing out from under
  // them).
  useEffect(() => {
    if (embedded || editing) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await getRecipeDetailForPopup(recipe.recipeId);
        if (cancelled || result.status !== 'success' || !result.data) return;
        setRecipe(result.data.recipe);
        setIngredients(result.data.ingredients);
        setSteps(result.data.steps);
        setNotes(result.data.notes);
        setTranslationFields(result.data.translationFields);
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(poll, RECIPE_DETAIL_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [embedded, editing, recipe.recipeId]);

  function handleSetArchived(archived: boolean) {
    setError(null);
    const formData = new FormData();
    formData.set('recipeId', recipe.recipeId);
    formData.set('archived', archived ? 'true' : 'false');
    startTransition(async () => {
      const result = await setRecipeArchived(formData);
      if (result.status === 'success') {
        if (embedded) onChange?.();
        else router.refresh();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  function handleDeleteForever() {
    if (!window.confirm(t('deleteForeverConfirm'))) return;
    setError(null);
    const formData = new FormData();
    formData.set('recipeId', recipe.recipeId);
    startTransition(async () => {
      const result = await permanentlyDeleteRecipe(formData);
      if (result.status === 'success') {
        if (embedded) {
          onChange?.();
          onBack?.();
        } else {
          router.push('/recipes');
        }
      } else {
        setError(describeWriteError(result));
      }
    });
  }

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
        {embedded ? (
          <button type="button" style={{ ...backLink, background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={onBack}>
            {t('backToRecipes')}
          </button>
        ) : (
          <Link href="/recipes" style={backLink}>
            {t('backToRecipes')}
          </Link>
        )}
        {!embedded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <SignOutButton label={t('signOut')} />
          </div>
        ) : null}
      </div>
      <header style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          {recipe.contentKind === 'instruction' ? <span style={badgeStyle('neutral')}>{t('instructionBadge')}</span> : null}
          {recipe.status === 'draft' ? <span style={badgeStyle('neutral')}>{t('draftBadge')}</span> : null}
          {recipe.status === 'archived' ? <span style={badgeStyle('neutral')}>{t('archivedBadge')}</span> : null}
        </div>
        {description ? <p style={{ margin: '8px 0 0', ...mutedText }}>{description}</p> : null}
        {error ? <div style={{ ...alertDanger, marginTop: 8 }}>{error}</div> : null}
        {canManage ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => setEditing(true)}>
              {t('editButton')}
            </button>
            {recipe.status === 'archived' ? (
              <>
                <button type="button" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => handleSetArchived(false)}>
                  {t('restoreButton')}
                </button>
                <button type="button" style={isPending ? buttonDisabled : buttonDanger} disabled={isPending} onClick={handleDeleteForever}>
                  {t('deleteForeverButton')}
                </button>
              </>
            ) : (
              <button type="button" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={() => handleSetArchived(true)}>
                {t('archiveButton')}
              </button>
            )}
          </div>
        ) : null}
      </header>

      {canManage && editing ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 15 }}>{t('editRecipeHeading')}</h2>
          <RecipeForm
            detail={{ recipe, ingredients, steps, notes }}
            lang={lang}
            onSuccess={() => {
              setEditing(false);
              if (embedded) onChange?.();
              else router.refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : null}

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
