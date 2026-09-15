'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { recordPurchaseReceiptAction } from '@/lib/purchases/actions';
import { buttonDisabled, buttonPrimary, colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { describePurchasesWriteError } from './error-copy';
import { tPurchasesDashboard } from './purchases-i18n';

export interface ReceiveFormProps {
  locationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  /**
   * The stock count this caller last observed as this item's latest
   * (`PurchaseNeededItem.latestStockCountId`) -- threaded straight through
   * to `recordPurchaseReceiptAction`'s `expectedStockCountId` as the
   * optional optimistic-concurrency guard (0120,
   * `purchases_stale_snapshot`): if the item's true latest count has moved
   * on since this row was rendered, the server rejects the submit instead
   * of silently receiving against stale data.
   */
  expectedStockCountId: string;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Records a real delivery (0120, `api.record_purchase_receipt`) -- writes
 * the received quantity into Inventory itself, unlike Order/Bought. Always
 * available for a still-listed item regardless of `purchaseStatus`: Receive
 * does not require a prior Order (no client-side ordering guard is added
 * here, matching the RLS/RPC contract, which has none either).
 */
export function ReceiveForm({ locationId, itemId, itemName, unit, expectedStockCountId, lang, onSuccess }: ReceiveFormProps) {
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
    formData.set('receivedQuantity', quantity);
    formData.set('expectedStockCountId', expectedStockCountId);
    recordPurchaseReceiptAction(formData).then((result) => {
      setIsPending(false);
      if (result.status === 'success') {
        setQuantity('');
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
            min={0.001}
            step="0.001"
            autoComplete="off"
            aria-label={`${t('receiveQuantityLabel')} — ${itemName}`}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isPending}
          />
          <span style={{ fontSize: 12, color: colors.textMuted, padding: '0 8px 0 0', whiteSpace: 'nowrap' }}>{unit}</span>
        </div>
        <button
          type="button"
          aria-label={`${t('receiveButton')} — ${itemName}`}
          className={hoverStyles.buttonSecondary}
          style={isPending || quantity.trim() === '' ? buttonDisabled : buttonPrimary}
          disabled={isPending || quantity.trim() === ''}
          onClick={handleSubmit}
        >
          {isPending ? t('receivingButton') : t('receiveButton')}
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: colors.dangerText, textAlign: 'right' }}>{error}</span> : null}
    </div>
  );
}
