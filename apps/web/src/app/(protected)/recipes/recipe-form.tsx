'use client';

import { useRef, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceRecipeDetail } from '@/lib/workforce/recipes';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { upsertRecipe } from '@/lib/workforce/recipe-actions';
import { LoadingButton, PendingOverlay } from '@/components/ui/loading';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from '../manager/error-copy';
import { tRecipes } from './recipes-i18n';

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
  const sourceIngredients = (detail?.ingredients ?? [])
    .map((i) => (isJa ? i.labelJa : i.labelEn) ?? '')
    .filter(Boolean)
    .join('\n');
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

    startTransition(async () => {
      const result = await upsertRecipe(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result));
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

      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('formIngredientsLabel')}</span>
        <textarea
          style={{ ...input, minHeight: 90, resize: 'vertical' }}
          name="ingredients"
          defaultValue={sourceIngredients}
          placeholder={t('formOnePerLineHint')}
        />
      </label>

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
