'use client';

import { useRef, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { InventoryItem } from '@/lib/inventory/items';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { INVENTORY_UNITS } from '@/lib/inventory/validation';
import { upsertInventoryItemAction } from '@/lib/inventory/manager-actions';
import { LoadingButton, PendingOverlay } from '@/components/ui/loading';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { describeInventoryWriteError } from './error-copy';
import { tInventoryDashboard } from './inventory-i18n';

export interface ItemFormProps {
  locationId: string;
  /** Omit/undefined to create a new item; pass an existing item to edit it. Active/inactive is a separate toggle, not this form. */
  item?: InventoryItem;
  /** Signed URL for the item's current photo (mirrors the recipe form's `mediaUrl`), if any -- ignored when creating a new item. */
  mediaUrl?: string | null;
  lang: Lang;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Matches the server action's own limit (`MAX_ITEM_PHOTO_BYTES` in `manager-actions.ts`) -- client-side check is a fast-fail UX nicety, the server re-checks regardless. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 4096;

/** Manager-only create/edit form for an Inventory catalog item, its reorder policy, and its photo (mirrors `recipes/recipe-form.tsx`'s photo block). */
export function ItemForm({ locationId, item, mediaUrl, lang, onSuccess, onCancel }: ItemFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (item) formData.set('id', item.itemId);
    formData.set('locationId', item?.locationId ?? locationId);

    startTransition(async () => {
      const result = await upsertInventoryItemAction(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeInventoryWriteError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PendingOverlay visible={isPending} message={t('savingButton')} />
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('nameLabel')}</span>
        <input style={input} name="name" defaultValue={item?.name ?? ''} maxLength={120} required />
      </label>

      <div style={{ padding: 12, border: `1px solid ${colors.border}`, borderRadius: 10, display: 'grid', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{t('formPhotoLabel')}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${colors.border}`, display: 'grid', placeItems: 'center' }}>
            {!removePhoto && (photoPreview || mediaUrl) ? (
              <img src={photoPreview ?? mediaUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span aria-hidden style={{ fontSize: 22 }}>📦</span>
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
              <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, padding: '6px 10px' }} onClick={() => photoInputRef.current?.click()}>
                {mediaUrl ? t('formReplaceImage') : t('formChooseImage')}
              </button>
              {mediaUrl && !photoPreview ? (
                <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, padding: '6px 10px', color: colors.dangerText }} onClick={() => setRemovePhoto((value) => !value)}>
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

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('targetQuantityLabel')}</span>
          <input
            style={input}
            name="requiredQuantity"
            type="number"
            min={0}
            step="0.001"
            defaultValue={item?.requiredQuantity ?? 0}
            required
          />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('reorderPointLabel')}</span>
          <input
            style={input}
            name="reorderPoint"
            type="number"
            min={0}
            step="0.001"
            defaultValue={item?.reorderPoint ?? 0}
            required
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('unitLabel')}</span>
          <select style={input} name="unit" defaultValue={item?.unit ?? INVENTORY_UNITS[0]} required>
            {INVENTORY_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('sortOrderLabel')}</span>
        <input style={input} name="sortOrder" type="number" min={0} step={1} defaultValue={item?.sortOrder ?? 0} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <LoadingButton
          type="submit"
          pending={isPending}
          pendingLabel={t('savingButton')}
          style={buttonPrimary}
          pendingStyle={buttonDisabled}
          className={hoverStyles.buttonPrimary}
        >
          {item ? t('saveChangesButton') : t('addItemButton')}
        </LoadingButton>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('cancelButton')}
        </button>
      </div>
    </form>
  );
}
