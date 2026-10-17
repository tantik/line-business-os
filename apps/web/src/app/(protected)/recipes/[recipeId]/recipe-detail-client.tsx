'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { RecipeCostSummary } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { resolveFieldDisplay } from '@/lib/content/recipe-display';
import { tRecipeTranslation } from '@/lib/demo/cafe/i18n.recipe-translation';
import { getRecipeDetailForPopup, deleteRecipe, getRecipeCostSummaryAction } from '@/lib/workforce/recipe-actions';
import { InlineAlert, Tag } from '@line-os/ui';
import { allergenLabel } from '../recipes-i18n';
import { LangProvider, useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { summarizeRecipeAllergens } from '@/lib/workforce/recipe-allergens';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import { ConfirmDialog, LightboxTrigger } from '@/components/shared/design-kit';
import {
  alertDanger,
  backLink,
  badgeStyle,
  buttonDisabled,
  buttonSecondary,
  card,
  mutedText,
  pageStyle,
} from '@/lib/ui/theme';
import { buttonDanger } from '../../_ui/workforce-theme';
import { describeWriteError } from '../../manager/error-copy';
import { RecipeForm } from '../recipe-form';
import { tRecipes } from '../recipes-i18n';
import { POLL_SAFETY_INTERVAL_MS, useVisiblePolling } from '@/lib/ui/visible-polling';
import { staffTopic, useLiveSignals } from '@/lib/realtime/live-signals';

/**
 * Deterministic display rounding for an estimated ingredient cost (WP5):
 * round to the nearest whole yen and format with a fixed locale so the
 * decimal/thousands separators never depend on the viewer's browser locale
 * (observed rendering as "81,6" instead of "82" under a non-Japanese
 * Accept-Language). The underlying calculation itself is untouched --
 * only this display step rounds.
 */
function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

export interface RecipeDetailClientProps {
  recipe: WorkforceRecipeDetail['recipe'];
  ingredients: WorkforceRecipeDetail['ingredients'];
  steps: WorkforceRecipeDetail['steps'];
  notes: WorkforceRecipeDetail['notes'];
  /** Every translatable field this recipe has, keyed for lookup by `field.key` -- see `resolveFieldDisplay`. */
  translationFields: RecipeTranslationField[];
  /** Pure UX affordance (RLS is the real boundary regardless): whether to show Edit/Archive/Delete controls. */
  canManage: boolean;
  /** Signed URL for the recipe's photo (WP-6), if any -- `null` when it has none. */
  mediaUrl: string | null;
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
  /** Live updates (0127): the standalone page subscribes to the tenant's :staff topic. */
  liveTenantId?: string;
  /** Required when `embedded` is true; ignored otherwise. */
  onBack?: () => void;
  /**
   * Required when `embedded` is true: called instead of `router.refresh()`
   * after a successful delete/edit, since this data was fetched client-side
   * by the popup wrapper (WP A5b), not by a server component
   * `router.refresh()` would re-render.
   */
  onChange?: () => void;
  /**
   * Recipes module redesign (2026-08-20): opens straight into the edit form
   * instead of the read view -- set when this detail view was reached via a
   * list row's own "Edit" button (`RecipesListBody`), which has no full
   * `WorkforceRecipeDetail` to edit with yet (only the list's summary
   * fields), so it opens detail-with-editing-preset rather than duplicating
   * the lazy detail fetch itself.
   */
  initialEditing?: boolean;
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

/**
 * Recipe-level allergen block (Copy Audit A-09, Founder decision
 * 2026-10-12): shown to every role that can see the recipe. All branching
 * lives in the unit-tested `summarizeRecipeAllergens`; the disclaimer is
 * always rendered.
 */
function RecipeAllergenSection({
  ingredients,
  lang,
}: {
  ingredients: WorkforceRecipeDetail['ingredients'];
  lang: Lang;
}) {
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const summary = summarizeRecipeAllergens(ingredients);
  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{t('allergenInfoHeading')}</h2>
      {summary.kind === 'recorded' ? (
        <>
          <p style={{ margin: '12px 0 0' }}>{t('allergenRecordedLabel')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {summary.codes.map((code) => (
              <Tag key={code}>{allergenLabel(lang, code)}</Tag>
            ))}
          </div>
          {summary.unknownCount > 0 ? (
            <p style={{ margin: '8px 0 0' }}>
              {t(summary.unknownCount === 1 ? 'allergenPartiallyUnrecordedOne' : 'allergenPartiallyUnrecorded').replace(
                '{n}',
                String(summary.unknownCount),
              )}
            </p>
          ) : null}
        </>
      ) : summary.kind === 'none' ? (
        <p style={{ margin: '12px 0 0' }}>
          {t('allergenNoneOfListed').replace('{count}', String(summary.vocabularySize))}
        </p>
      ) : (
        <p style={{ margin: '12px 0 0' }}>{t('allergenNotRecorded')}</p>
      )}
      {/* 13px, DS `text-muted` on the white card surface (~6.4:1, >= 4.5:1 -- asserted in recipe-allergens.test.ts). */}
      <p style={{ margin: '12px 0 0', ...mutedText, fontSize: 13 }}>{t('allergenDisclaimer')}</p>
    </section>
  );
}

export function RecipeDetailBody({
  recipe: initialRecipe,
  ingredients: initialIngredients,
  steps: initialSteps,
  notes: initialNotes,
  translationFields: initialTranslationFields,
  canManage,
  mediaUrl: initialMediaUrl,
  embedded = false,
  liveTenantId,
  onBack,
  onChange,
  initialEditing = false,
}: RecipeDetailClientProps) {
  const { lang } = useLang();
  const router = useRouter();
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [recipe, setRecipe] = useState(initialRecipe);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [steps, setSteps] = useState(initialSteps);
  const [notes, setNotes] = useState(initialNotes);
  const [translationFields, setTranslationFields] = useState(initialTranslationFields);
  const [mediaUrl, setMediaUrl] = useState(initialMediaUrl);
  const [costSummary, setCostSummary] = useState<RecipeCostSummary | null>(null);

  // Manager-only estimated ingredient cost (WP5): `canManage` is a pure UX
  // affordance (RLS/the RPC's own explicit permission check are the real
  // boundary regardless), same gate this view already uses for Edit/Delete.
  // Skipped for `instruction` content (no ingredients at all) and while
  // editing (would go stale against in-progress, unsaved changes).
  useEffect(() => {
    if (!canManage || editing || recipe.contentKind !== 'recipe') {
      setCostSummary(null);
      return;
    }
    let cancelled = false;
    getRecipeCostSummaryAction(recipe.recipeId).then((result) => {
      if (!cancelled && result.status === 'success') setCostSummary(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, editing, recipe.contentKind, recipe.recipeId, ingredients]);

  useEffect(() => {
    setRecipe(initialRecipe);
    setIngredients(initialIngredients);
    setSteps(initialSteps);
    setNotes(initialNotes);
    setTranslationFields(initialTranslationFields);
    setMediaUrl(initialMediaUrl);
  }, [
    initialRecipe,
    initialIngredients,
    initialSteps,
    initialNotes,
    initialTranslationFields,
    initialMediaUrl,
  ]);

  // WP C1 (Track C, live-sync): skip while embedded (Manager's popup already
  // refreshes itself via onChange) or while a manage-only edit form is open
  // (never overwrite content the caller is actively editing out from under
  // them).
  const refreshDetail = async (isCurrent: () => boolean = () => true) => {
    const result = await getRecipeDetailForPopup(recipe.recipeId);
    if (!isCurrent() || result.status !== 'success' || !result.data) return;
    setRecipe(result.data.recipe);
    setIngredients(result.data.ingredients);
    setSteps(result.data.steps);
    setNotes(result.data.notes);
    setTranslationFields(result.data.translationFields);
    setMediaUrl(result.data.mediaUrl);
  };
  // Live updates by push (0127); the timer is a 15 min safety net.
  useLiveSignals({
    topics: liveTenantId ? [staffTopic(liveTenantId)] : [],
    locationId: null,
    enabled: !embedded && !editing,
    onSignal: (area) => {
      if (area === 'recipes') void refreshDetail();
    },
    onResync: () => void refreshDetail(),
  });
  useVisiblePolling(refreshDetail, { enabled: !embedded && !editing, intervalMs: POLL_SAFETY_INTERVAL_MS });

  function handleDelete() {
    setError(null);
    const formData = new FormData();
    formData.set('recipeId', recipe.recipeId);
    startTransition(async () => {
      const result = await deleteRecipe(formData);
      if (result.status === 'success') {
        if (embedded) {
          onChange?.();
          onBack?.();
        } else {
          router.push('/recipes');
        }
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  const fieldByKey = new Map(translationFields.map((field) => [field.key, field]));
  // Copy Audit A-08: say when what is shown is an unreviewed machine
  // translation or the untranslated Japanese original, instead of letting it
  // read as reviewed content.
  const contentMarkers = new Set(translationFields.map((field) => resolveFieldDisplay(field, lang).marker));
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

  const title =
    displayText('workforce_recipe', recipe.recipeId, 'title', recipe.titleJa, recipe.titleEn) ||
    t('untitledRecipe');
  const description = displayText(
    'workforce_recipe',
    recipe.recipeId,
    'description',
    recipe.descriptionJa,
    recipe.descriptionEn,
  );

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {!editing && !embedded ? (
          <Link href="/recipes" style={backLink}>
            {t('backToRecipes')}
          </Link>
        ) : null}
        {!embedded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PreviewLanguageToggle />
            <SignOutButton label={t('signOut')} />
          </div>
        ) : null}
      </div>
      <header style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          {mediaUrl ? (
            <LightboxTrigger
              src={mediaUrl}
              alt={title}
              thumbnailStyle={{ width: 64, height: 64, flexShrink: 0 }}
            />
          ) : null}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{title}</h1>
              {recipe.contentKind === 'instruction' ? (
                <span style={badgeStyle('neutral')}>{t('instructionBadge')}</span>
              ) : null}
              {recipe.status === 'draft' ? (
                <span style={badgeStyle('neutral')}>{t('draftBadge')}</span>
              ) : null}
              {recipe.status === 'archived' ? (
                <span style={badgeStyle('neutral')}>{t('archivedBadge')}</span>
              ) : null}
              {contentMarkers.has('machine') ? (
                <span style={badgeStyle('neutral')}>{tRecipeTranslation(lang, 'staffMachineMarker')}</span>
              ) : null}
              {contentMarkers.has('original') ? (
                <span style={badgeStyle('neutral')}>{tRecipeTranslation(lang, 'staffOriginalMarker')}</span>
              ) : null}
            </div>
            {description ? <p style={{ margin: '8px 0 0', ...mutedText }}>{description}</p> : null}
          </div>
        </div>
        {error ? <div style={{ ...alertDanger, marginTop: 8 }}>{error}</div> : null}
        {canManage ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonSecondary}
              disabled={isPending}
              onClick={() => setEditing(true)}
            >
              {t('editButton')}
            </button>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonDanger}
              disabled={isPending}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {t('deleteButton')}
            </button>
          </div>
        ) : null}
      </header>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('deleteConfirmTitle')}
        confirmLabel={t('deleteButton')}
        cancelLabel={t('formCancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          handleDelete();
        }}
      >
        {title}
      </ConfirmDialog>

      {canManage && editing ? (
        <section style={card}>
          <h2 style={{ margin: 0, fontSize: 15 }}>{t('editRecipeHeading')}</h2>
          <RecipeForm
            detail={{ recipe, ingredients, steps, notes }}
            mediaUrl={mediaUrl}
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

      {!editing ? (
        <>
          {recipe.contentKind === 'recipe' ? (
            <section style={card}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{t('ingredientsHeading')}</h2>
              {ingredients.length === 0 ? (
                <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noIngredients')}</p>
              ) : (
                <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
                  {ingredients.map((ingredient) => (
                    <li key={ingredient.ingredientId} style={{ marginBottom: 4 }}>
                      {displayText(
                        'workforce_recipe_ingredient',
                        ingredient.ingredientId,
                        'label',
                        ingredient.labelJa,
                        ingredient.labelEn,
                      )}
                      {ingredient.inventoryItemId && ingredient.quantity != null && ingredient.unit ? (
                        <span style={{ ...mutedText, fontSize: 12, marginLeft: 6 }}>
                          ({ingredient.quantity}
                          {ingredient.unit})
                        </span>
                      ) : null}
                      {/* Unmapped ingredients count as "not recorded" in the recipe-level summary, so they get the same tag here. */}
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginLeft: 8, verticalAlign: 'middle' }}>
                        {!ingredient.inventoryItemId || ingredient.allergenCodes === null || ingredient.allergenCodes === undefined ? (
                          <Tag>{t('ingredientAllergensNotRecorded')}</Tag>
                        ) : ingredient.allergenCodes.length === 0 ? (
                          <Tag>{t('ingredientAllergensNoneChecked')}</Tag>
                        ) : (
                          ingredient.allergenCodes.map((code) => <Tag key={code}>{allergenLabel(lang, code)}</Tag>)
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {recipe.contentKind === 'recipe' ? <RecipeAllergenSection ingredients={ingredients} lang={lang} /> : null}

          {canManage && recipe.contentKind === 'recipe' && costSummary ? (
            <section style={card}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{t('costSummaryHeading')}</h2>
              {costSummary.ingredientCount === 0 ? (
                <p style={{ margin: '12px 0 0', ...mutedText }}>{t('noIngredients')}</p>
              ) : costSummary.pricedCount === costSummary.ingredientCount ? (
                <p style={{ margin: '12px 0 0' }}>
                  {t('costKnownSubtotalLabel')}: {formatYen(costSummary.knownSubtotal)}
                </p>
              ) : (
                <InlineAlert tone="info" style={{ marginTop: 12 }}>
                  {t('costIncompleteMessage')
                    .replace('{knownSubtotal}', formatYen(costSummary.knownSubtotal))
                    .replace('{pricedCount}', String(costSummary.pricedCount))
                    .replace('{ingredientCount}', String(costSummary.ingredientCount))}
                </InlineAlert>
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
                    {displayText(
                      'workforce_recipe_step',
                      step.stepId,
                      'instruction',
                      step.instructionJa,
                      step.instructionEn,
                    )}
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
                    <strong>
                      {displayText(
                        'workforce_recipe_note',
                        note.noteId,
                        'note_title',
                        note.titleJa,
                        note.titleEn,
                      )}
                    </strong>
                    <p style={{ margin: '4px 0 0' }}>
                      {displayText(
                        'workforce_recipe_note',
                        note.noteId,
                        'note_body',
                        note.bodyJa,
                        note.bodyEn,
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
