'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Field, FormActions, InlineAlert, Input, MetadataText, Select, Textarea } from '@line-os/ui';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { saveSpendReceiptAction, type ReceiptCandidate } from '@/lib/purchases/spend-receipt-actions';
import { parseYenAmount } from '@/lib/purchases/spend-receipt-input';
import {
  MAX_RECEIPT_NOTE_LENGTH,
  RECEIPT_DATE_WINDOW_DAYS,
  SPEND_RECEIPT_CATEGORIES,
  subtractDays,
  type SpendReceipt,
  type SpendReceiptCategory,
  type SpendReceiptSettings,
} from '@/lib/purchases/spend-receipts';
import { shrinkImageForUpload } from '@/lib/media/shrink-image-client';
import { describeReceiptWriteError } from './receipts-copy';
import { tReceiptError, tReceipts } from './receipts-i18n';

export const CATEGORY_LABEL_KEY = {
  food: 'categoryFood',
  supplies: 'categorySupplies',
  equipment: 'categoryEquipment',
  other: 'categoryOther',
  stock: 'categoryStock',
} as const satisfies Record<SpendReceiptCategory | 'stock', Parameters<typeof tReceipts>[1]>;

/** Server Action body limit is 3 MB; `shrinkImageForUpload` normally lands far below this. */
const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024;

export interface ReceiptSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lang: Lang;
  locationId: string;
  /** Location-local today (`YYYY-MM-DD`). */
  today: string;
  settings: SpendReceiptSettings;
  /** Today's bought/received purchases not on a receipt yet. */
  candidates: ReceiptCandidate[];
  /** Create: purchases to pre-tick (the ones just marked). */
  preselectedActionIds?: string[];
  /** Edit: the receipt being changed, with its signed photo URL. */
  receipt?: SpendReceipt | null;
  photoUrl?: string | null;
}

/**
 * Add / edit one spend receipt (DEBT-136). Phone first: photo, total, date,
 * items, category + note, one sticky Save. A new `client_request_id` per
 * open makes a double tap on Save create one receipt only (0147). The
 * client checks only what it can explain early (amount or photo, photo
 * required, category + note without items); the RPC re-checks everything.
 */
export function ReceiptSheet({
  open,
  onClose,
  onSaved,
  lang,
  locationId,
  today,
  settings,
  candidates,
  preselectedActionIds,
  receipt,
  photoUrl,
}: ReceiptSheetProps) {
  const t = (key: Parameters<typeof tReceipts>[1]) => tReceipts(lang, key);
  const isEdit = Boolean(receipt);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clientRequestId, setClientRequestId] = useState('');
  const [purchasedOn, setPurchasedOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<SpendReceiptCategory | ''>('');
  const [note, setNote] = useState('');
  const [actionIds, setActionIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  // (re)seed the form every time the sheet opens
  useEffect(() => {
    if (!open) return;
    setClientRequestId(crypto.randomUUID());
    setPurchasedOn(receipt?.purchasedOn ?? today);
    setAmount(receipt?.amountJpy != null ? String(receipt.amountJpy) : '');
    setCategory(receipt?.category ?? '');
    setNote(receipt?.note ?? '');
    setActionIds(receipt ? receipt.items.map((i) => i.actionId) : (preselectedActionIds ?? []));
    setPhoto(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setError(null);
    setIsPending(false);
  }, [open, receipt, today, preselectedActionIds]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const photoAllowed = settings.photoMode !== 'off';
  const photoRequired = settings.photoMode === 'required';
  const currentPhotoUrl = photoPreview ?? (removePhoto ? null : (photoUrl ?? null));
  const hasPhoto = Boolean(photo) || (Boolean(receipt?.mediaPath) && !removePhoto);

  // linked items: the receipt's own (edit) plus today's free purchases
  const itemOptions: Array<{ actionId: string; label: string }> = [
    ...(receipt?.items ?? []).map((i) => ({ actionId: i.actionId, label: i.itemName ?? '—' })),
    ...candidates
      .filter((c) => !(receipt?.items ?? []).some((i) => i.actionId === c.actionId))
      .map((c) => ({ actionId: c.actionId, label: c.itemName })),
  ];

  async function handlePhotoPicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    const shrunk = await shrinkImageForUpload(file);
    if (shrunk.size > MAX_UPLOAD_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(shrunk.type)) {
      setError(tReceiptError(lang, 'photo_too_large'));
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(shrunk);
    setPhotoPreview(URL.createObjectURL(shrunk));
    setRemovePhoto(false);
  }

  function handleSave() {
    if (isPending) return;
    setError(null);
    const parsedAmount = parseYenAmount(amount);
    if (parsedAmount === undefined) return setError(tReceiptError(lang, 'invalid_amount'));
    if (photoRequired && !hasPhoto) return setError(tReceiptError(lang, 'needs_photo'));
    if (parsedAmount === null && !hasPhoto) return setError(tReceiptError(lang, 'needs_amount_or_photo'));
    if (actionIds.length === 0 && (!category || note.trim() === '')) {
      return setError(tReceiptError(lang, 'needs_category_note'));
    }

    const formData = new FormData();
    if (receipt) formData.set('receiptId', receipt.receiptId);
    else formData.set('clientRequestId', clientRequestId);
    formData.set('locationId', locationId);
    formData.set('purchasedOn', purchasedOn);
    formData.set('amountJpy', amount);
    if (category) formData.set('category', category);
    formData.set('note', note);
    for (const id of actionIds) formData.append('actionId', id);
    if (photo) formData.set('photo', photo);
    if (removePhoto) formData.set('removePhoto', 'true');

    setIsPending(true);
    saveSpendReceiptAction(formData)
      .then((result) => {
        setIsPending(false);
        if (result.status === 'success') onSaved();
        else setError(describeReceiptWriteError(result, lang));
      })
      .catch(() => {
        setIsPending(false);
        setError(tReceiptError(lang, 'generic'));
      });
  }

  const minDate = subtractDays(today, RECEIPT_DATE_WINDOW_DAYS);

  return (
    <Dialog
      open={open}
      onClose={() => (isPending ? undefined : onClose())}
      title={isEdit ? t('sheetTitleEdit') : t('sheetTitleNew')}
      size="form"
      closeLabel={t('cancelButton')}
      footer={
        <FormActions
          sticky
          primary={
            <Button variant="primary" loading={isPending} onClick={handleSave}>
              {isPending ? t('savingButton') : t('saveButton')}
            </Button>
          }
          secondary={
            <Button variant="secondary" disabled={isPending} onClick={onClose}>
              {t('cancelButton')}
            </Button>
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        {photoAllowed ? (
          <div className="flex flex-col gap-1.5">
            <p className="m-0 text-sm font-medium text-text-primary">
              {t('photoLabel')}
              {photoRequired ? <span className="text-danger-text"> *</span> : null}
            </p>
            {currentPhotoUrl ? (
              <img src={currentPhotoUrl} alt="" className="max-h-56 w-full rounded-md border border-border object-contain" />
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handlePhotoPicked(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="md" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
                {currentPhotoUrl ? t('replacePhotoButton') : t('takePhotoButton')}
              </Button>
              {isEdit && receipt?.mediaPath && !removePhoto && !photo && !photoRequired ? (
                <Button variant="ghost" size="md" onClick={() => setRemovePhoto(true)} disabled={isPending}>
                  {t('removePhotoButton')}
                </Button>
              ) : null}
            </div>
            <MetadataText>{removePhoto ? t('photoWillBeRemoved') : photoRequired ? t('photoHintRequired') : t('photoHintOptional')}</MetadataText>
          </div>
        ) : null}

        <Field label={t('amountLabel')} hint={t('amountHint')}>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              inputMode="numeric"
              autoComplete="off"
              placeholder="1280"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('dateLabel')} required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="date"
              min={minDate}
              max={today}
              value={purchasedOn}
              onChange={(event) => setPurchasedOn(event.target.value || today)}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-sm font-medium text-text-primary">{t('itemsLabel')}</p>
          {itemOptions.length === 0 ? (
            <MetadataText>{t('noCandidateItems')}</MetadataText>
          ) : (
            <>
              <MetadataText>{t('itemsHint')}</MetadataText>
              {itemOptions.map((option) => (
                <Checkbox
                  key={option.actionId}
                  checked={actionIds.includes(option.actionId)}
                  onCheckedChange={(checked) =>
                    setActionIds((ids) => (checked ? [...ids, option.actionId] : ids.filter((id) => id !== option.actionId)))
                  }
                  label={option.label}
                />
              ))}
            </>
          )}
        </div>

        <Field label={t('categoryLabel')} hint={actionIds.length === 0 ? t('categoryHintNoItems') : undefined} required={actionIds.length === 0}>
          {(fieldProps) => (
            <Select
              {...fieldProps}
              value={category}
              onValueChange={(value) => setCategory(value as SpendReceiptCategory)}
              placeholder={t('categoryNone')}
              options={SPEND_RECEIPT_CATEGORIES.map((value) => ({ value, label: t(CATEGORY_LABEL_KEY[value]) }))}
            />
          )}
        </Field>

        <Field label={t('noteLabel')} required={actionIds.length === 0}>
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              rows={2}
              maxLength={MAX_RECEIPT_NOTE_LENGTH}
              placeholder={t('notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </Field>

        {error ? <InlineAlert tone="critical">{error}</InlineAlert> : null}
      </div>
    </Dialog>
  );
}
