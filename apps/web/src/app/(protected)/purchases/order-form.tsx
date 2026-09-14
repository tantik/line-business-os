'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { recordPurchaseOrderAction } from '@/lib/purchases/actions';
import { buttonDisabled, buttonPrimary, colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { describePurchasesWriteError } from './error-copy';
import { tPurchasesDashboard } from './purchases-i18n';

export interface OrderFormProps {
  locationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * "Ordered" acknowledgement (0120, `api.record_purchase_order`) -- a small
 * quantity input plus a submit button, mirroring `MarkBoughtButton`'s own
 * isPending/error local-state shape. Purely informational: it never touches
 * Inventory quantities. Available whenever the item is still `pending`
 * (once an Order or Receipt has been logged, the row switches to showing
 * that action's info instead -- Order is a one-time acknowledgement per
 * shortage, same lifecycle rule 0089's single "Bought" step already used).
 */
export function OrderForm({ locationId, itemId, itemName, unit, lang, onSuccess }: OrderFormProps) {
  const [quantity, setQuantity] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);

  function handleSubmit() {
    if (quantity.trim() === '') return;
    setIsPending(true);
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('itemId', itemId);
    formData.set('orderedQuantity', quantity);
    recordPurchaseOrderAction(formData).then((result) => {
      setIsPending(false);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describePurchasesWriteError(result, lang));
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.surface,
            overflow: 'hidden',
          }}
        >
          <input
            style={{
              width: 64,
              border: 'none',
              outline: 'none',
              padding: '8px 4px 8px 10px',
              fontSize: 14,
              color: colors.textPrimary,
              background: 'transparent',
            }}
            type="number"
            min={0}
            step="0.001"
            autoComplete="off"
            aria-label={`${t('orderQuantityLabel')} — ${itemName}`}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isPending}
          />
          <span style={{ fontSize: 12, color: colors.textMuted, padding: '0 8px 0 0', whiteSpace: 'nowrap' }}>{unit}</span>
        </div>
        <button
          type="button"
          aria-label={`${t('orderButton')} — ${itemName}`}
          className={hoverStyles.buttonSecondary}
          style={isPending || quantity.trim() === '' ? buttonDisabled : buttonPrimary}
          disabled={isPending || quantity.trim() === ''}
          onClick={handleSubmit}
        >
          {isPending ? t('orderingButton') : t('orderButton')}
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: colors.dangerText, textAlign: 'right' }}>{error}</span> : null}
    </div>
  );
}
