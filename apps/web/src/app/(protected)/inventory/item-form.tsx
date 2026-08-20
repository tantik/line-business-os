'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { InventoryItem } from '@/lib/inventory/items';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { INVENTORY_UNITS } from '@/lib/inventory/validation';
import { upsertInventoryItemAction } from '@/lib/inventory/manager-actions';
import { LoadingButton, PendingOverlay } from '@/components/ui/loading';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, input, mutedText } from '@/lib/ui/theme';
import { describeInventoryWriteError } from './error-copy';
import { tInventoryDashboard } from './inventory-i18n';

export interface ItemFormProps {
  locationId: string;
  /** Omit/undefined to create a new item; pass an existing item to edit it. Active/inactive is a separate toggle, not this form. */
  item?: InventoryItem;
  lang: Lang;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Manager-only create/edit form for an Inventory catalog item and its reorder policy. */
export function ItemForm({ locationId, item, lang, onSuccess, onCancel }: ItemFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);

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
    <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
      <PendingOverlay visible={isPending} message={t('savingButton')} />
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('nameLabel')}</span>
        <input style={input} name="name" defaultValue={item?.name ?? ''} maxLength={120} required />
      </label>
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
        <LoadingButton type="submit" pending={isPending} pendingLabel={t('savingButton')} style={buttonPrimary} pendingStyle={buttonDisabled}>
          {item ? t('saveChangesButton') : t('addItemButton')}
        </LoadingButton>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('cancelButton')}
        </button>
      </div>
    </form>
  );
}
