'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { getRecipeIngredientMappingContext, upsertRecipe } from '@/lib/workforce/recipe-actions';
import type { RecipeIngredientMappingContext } from '@/lib/workforce/recipe-actions';
import { LoadingButton, PendingOverlay } from '@/components/ui/loading';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import { IconButton, NumberInput, Select } from '@line-os/ui';
import { describeWriteError } from '../manager/error-copy';
import { tRecipes } from './recipes-i18n';

const INGREDIENT_UNITS = ['kg', 'g', 'L', 'mL', 'pcs'] as const;

interface IngredientRowState {
  /** Client-only React list key -- never sent to the server. */
  key: string;
  label: string;
  inventoryItemId: string | null;
  quantity: number | '';
  unit: string;
}

function makeRowKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `row-${Math.random().toString(36).slice(2)}`;
}

export interface RecipeFormProps {
  /** Omit/undefined to create a new recipe; pass an existing recipe's detail to edit it. */
  detail?: WorkforceRecipeDetail;
  /** Signed URL for the recipe's current photo (WP-6), if any -- ignored when creating a new recipe. */
  mediaUrl?: string | null;
  lang: Lang;
  onSuccess: () => void;
  onCancel: () => void;
}

const NOTE_TITLE_MAX = 160;
const NOTE_BODY_MAX = 4000;
/** Matches the server action's own limit (`MAX_RECIPE_PHOTO_BYTES` in `recipe-actions.ts`) -- client-side check is a fast-fail UX nicety, the server re-checks regardless. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 4096;

/**
 * Manager-only create/edit form for a recipe's source-language content
 * (title/description/ingredients/steps/one note), status, and content kind.
 * Editing always targets the recipe's `originalLanguage` column pair -- the
 * OTHER language is a translation, edited from the translation workspace
 * (not this form), never here (Cafe v2.1 QA audit P1-2/P1-3, 2026-08-17: the
 * backing `upsertWorkforceRecipe` RPC already existed and was already
 * tested; nothing in the canonical UI ever called it).
 *
 * Does not offer a category picker: `upsert_workforce_recipe` (0060) has no
 * `p_recipe_category_id` parameter at all -- category assignment is not
 * wired to any RPC yet, a real backend gap, not just a missing form field. A
 * new recipe is created uncategorized (`groupRecipesByCategory`'s existing
 * uncategorized bucket already handles this correctly).
 */
export function RecipeForm({ detail, mediaUrl, lang, onSuccess, onCancel }: RecipeFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tRecipes>[1]) => tRecipes(lang, key);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const recipe = detail?.recipe;
  // Source language locks at creation (defaults JA) and is never editable
  // afterward -- there is no UI path to change it once set (Cafe Manager
  // UI/UX Parity mission, WP-4 locked decision).
  const originalLanguage = recipe?.originalLanguage ?? 'ja';
  const isJa = originalLanguage === 'ja';

  const sourceTitle = recipe ? (isJa ? recipe.titleJa : recipe.titleEn) ?? '' : '';
  const sourceDescription = recipe ? (isJa ? recipe.descriptionJa : recipe.descriptionEn) ?? '' : '';

  const [ingredientRows, setIngredientRows] = useState<IngredientRowState[]>(() => {
    const initial = (detail?.ingredients ?? [])
      .map((i) => ({
        key: i.ingredientId,
        label: (isJa ? i.labelJa : i.labelEn) ?? '',
        inventoryItemId: i.inventoryItemId ?? null,
        quantity: (i.quantity ?? '') as number | '',
        unit: i.unit ?? INGREDIENT_UNITS[0],
      }))
      .filter((row) => row.label);
    return initial.length > 0 ? initial : [{ key: makeRowKey(), label: '', inventoryItemId: null, quantity: '', unit: INGREDIENT_UNITS[0] }];
  });
  const [mappingContext, setMappingContext] = useState<RecipeIngredientMappingContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecipeIngredientMappingContext().then((result) => {
      if (!cancelled && result.status === 'success') setMappingContext(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(key: string, patch: Partial<IngredientRowState>) {
    setIngredientRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addIngredientRow() {
    setIngredientRows((rows) => [...rows, { key: makeRowKey(), label: '', inventoryItemId: null, quantity: '', unit: INGREDIENT_UNITS[0] }]);
  }

  function removeIngredientRow(key: string) {
    setIngredientRows((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  }

  const sourceSteps = (detail?.steps ?? [])
    .map((s) => (isJa ? s.instructionJa : s.instructionEn) ?? '')
    .filter(Boolean)
    .join('\n');
  const firstNote = detail?.notes[0];
  const sourceNoteTitle = firstNote ? (isJa ? firstNote.titleJa : firstNote.titleEn) ?? '' : '';
  const sourceNoteBody = firstNote ? (isJa ? firstNote.bodyJa : firstNote.bodyEn) ?? '' : '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (recipe) formData.set('recipeId', recipe.recipeId);
    formData.set(
      'ingredientsJson',
      JSON.stringify(
        ingredientRows
          .filter((row) => row.label.trim())
          .map((row) => ({
            label: row.label.trim(),
            inventoryItemId: row.inventoryItemId,
            quantity: row.inventoryItemId ? (row.quantity === '' ? null : row.quantity) : null,
            unit: row.inventoryItemId ? row.unit : null,
          })),
      ),
    );

    startTransition(async () => {
      const result = await upsertRecipe(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      <PendingOverlay visible={isPending} message={t('formSaving')} />
      {error ? <div style={alertDanger}>{error}</div> : null}
      <input type="hidden" name="originalLanguage" value={originalLanguage} />

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('formContentKindLabel')}</span>
          <select style={input} name="contentKind" defaultValue={recipe?.contentKind ?? 'recipe'}>
            <option value="recipe">{t('formContentKindRecipe')}</option>
            <option value="instruction">{t('formContentKindInstruction')}</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('formStatusLabel')}</span>
          <select style={input} name="status" defaultValue={recipe?.status ?? 'draft'}>
            <option value="draft">{t('formStatusDraft')}</option>
            <option value="published">{t('formStatusPublished')}</option>
            <option value="archived">{t('formStatusArchived')}</option>
          </select>
        </label>
      </div>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formTitleLabel')}</span>
        <input style={input} name="title" defaultValue={sourceTitle} maxLength={160} required />
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formDescriptionLabel')}</span>
        <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} name="description" defaultValue={sourceDescription} maxLength={1000} />
      </label>

      <div style={{ padding: 12, border: `1px solid ${colors.border}`, borderRadius: 10, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{t('formPhotoLabel')}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${colors.border}`, display: 'grid', placeItems: 'center' }}>
            {!removePhoto && (photoPreview || mediaUrl) ? (
              <img src={photoPreview ?? mediaUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span aria-hidden style={{ fontSize: 22 }}>🍵</span>
            )}
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 6, flex: 1 }}>
            <input
              ref={photoInputRef}
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) {
                  setPhotoPreview(null);
                  setPhotoName(null);
                  return;
                }
                if (file.size > MAX_PHOTO_BYTES) {
                  event.currentTarget.value = '';
                  setPhotoError(t('formPhotoTooLarge'));
                  return;
                }
                const objectUrl = URL.createObjectURL(file);
                const dimensionsOk = await new Promise<boolean>((resolve) => {
                  const image = new Image();
                  image.onload = () => resolve(image.width <= MAX_PHOTO_DIMENSION && image.height <= MAX_PHOTO_DIMENSION);
                  image.onerror = () => resolve(false);
                  image.src = objectUrl;
                });
                if (!dimensionsOk) {
                  URL.revokeObjectURL(objectUrl);
                  event.currentTarget.value = '';
                  setPhotoError(t('formPhotoDimensionsInvalid'));
                  return;
                }
                setPhotoError(null);
                setPhotoPreview(objectUrl);
                setPhotoName(file.name);
                setRemovePhoto(false);
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...buttonSecondary, padding: '6px 10px' }} onClick={() => photoInputRef.current?.click()}>
                {mediaUrl ? t('formReplaceImage') : t('formChooseImage')}
              </button>
              {mediaUrl && !photoPreview ? (
                <button type="button" style={{ ...buttonSecondary, padding: '6px 10px', color: colors.dangerText }} onClick={() => setRemovePhoto((value) => !value)}>
                  {removePhoto ? t('formUndoRemoveImage') : t('formRemoveImage')}
                </button>
              ) : null}
            </div>
            <span style={{ ...mutedText, fontSize: 11 }}>
              {photoName ?? (removePhoto ? t('formPhotoWillBeRemoved') : t('formPhotoHint'))}
            </span>
            {photoError ? <span style={{ fontSize: 11, color: colors.dangerText }}>{photoError}</span> : null}
          </div>
        </div>
        {removePhoto ? <input type="hidden" name="removePhoto" value="true" /> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formIngredientsLabel')}</span>
        {ingredientRows.map((row) => {
          const mappingCandidates = (mappingContext?.items ?? []).filter(
            (item) => !recipe?.locationId || item.locationId === recipe.locationId,
          );
          const selectedCandidate = mappingCandidates.find((item) => item.itemId === row.inventoryItemId);
          return (
            <div key={row.key} style={{ padding: 10, border: `1px solid ${colors.border}`, borderRadius: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  style={{ ...input, flex: 1 }}
                  value={row.label}
                  maxLength={500}
                  placeholder={t('formIngredientLabelPlaceholder')}
                  onChange={(event) => updateRow(row.key, { label: event.target.value })}
                />
                <IconButton
                  aria-label={t('formRemoveIngredient')}
                  icon={<span aria-hidden>×</span>}
                  variant="ghost"
                  size="sm"
                  onClick={() => removeIngredientRow(row.key)}
                />
              </div>
              {row.inventoryItemId ? (
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 1fr', alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...mutedText, fontSize: 12 }}>{t('formIngredientItemLabel')}</span>
                    <Select
                      value={row.inventoryItemId}
                      onValueChange={(value) => {
                        const item = mappingCandidates.find((candidate) => candidate.itemId === value);
                        updateRow(row.key, { inventoryItemId: value, unit: item?.unit ?? row.unit });
                      }}
                      options={mappingCandidates.map((item) => ({
                        value: item.itemId,
                        label: recipe?.locationId
                          ? item.name
                          : `${item.name}${mappingContext?.locationNameById[item.locationId] ? ` (${mappingContext.locationNameById[item.locationId]})` : ''}`,
                      }))}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...mutedText, fontSize: 12 }}>{t('formIngredientQuantityLabel')}</span>
                    <NumberInput
                      value={row.quantity}
                      min={0}
                      step="0.001"
                      onValueChange={(value) => updateRow(row.key, { quantity: value })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...mutedText, fontSize: 12 }}>{t('formIngredientUnitLabel')}</span>
                    <Select
                      value={row.unit}
                      onValueChange={(value) => updateRow(row.key, { unit: value })}
                      options={INGREDIENT_UNITS.map((unit) => ({ value: unit, label: unit }))}
                    />
                  </div>
                  {!selectedCandidate ? (
                    <span style={{ ...mutedText, fontSize: 11, gridColumn: '1 / -1' }}>{t('formIngredientItemUnavailable')}</span>
                  ) : null}
                  <button
                    type="button"
                    style={{ ...buttonSecondary, padding: '4px 10px', fontSize: 12, gridColumn: '1 / -1', justifySelf: 'start' }}
                    onClick={() => updateRow(row.key, { inventoryItemId: null, quantity: '', unit: INGREDIENT_UNITS[0] })}
                  >
                    {t('formUnlinkIngredient')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  style={{ ...buttonSecondary, padding: '4px 10px', fontSize: 12, alignSelf: 'start' }}
                  onClick={() => updateRow(row.key, { inventoryItemId: mappingCandidates[0]?.itemId ?? null, unit: mappingCandidates[0]?.unit ?? INGREDIENT_UNITS[0] })}
                  disabled={mappingCandidates.length === 0}
                >
                  {t('formLinkIngredientToInventory')}
                </button>
              )}
            </div>
          );
        })}
        <button type="button" style={{ ...buttonSecondary, alignSelf: 'start' }} onClick={addIngredientRow}>
          {t('formAddIngredient')}
        </button>
      </div>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formStepsLabel')}</span>
        <textarea
          style={{ ...input, minHeight: 90, resize: 'vertical' }}
          name="steps"
          defaultValue={sourceSteps}
          placeholder={t('formOnePerLineHint')}
        />
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formNoteTitleLabel')}</span>
        <input style={input} name="noteTitle" defaultValue={sourceNoteTitle} maxLength={NOTE_TITLE_MAX} />
      </label>

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formNoteBodyLabel')}</span>
        <textarea style={{ ...input, minHeight: 60, resize: 'vertical' }} name="noteBody" defaultValue={sourceNoteBody} maxLength={NOTE_BODY_MAX} />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <LoadingButton type="submit" pending={isPending} pendingLabel={t('formSaving')} style={buttonPrimary} pendingStyle={buttonDisabled}>
          {recipe ? t('formSaveChanges') : t('formCreateRecipe')}
        </LoadingButton>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('formCancel')}
        </button>
      </div>
    </form>
  );
}
