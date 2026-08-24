'use client';

import { useState } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { markPurchaseBoughtAction } from '@/lib/purchases/actions';
import { buttonDisabled, buttonPrimary, colors } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { describePurchasesWriteError } from './error-copy';
import { tPurchasesDashboard } from './purchases-i18n';

export interface MarkBoughtButtonProps {
  locationId: string;
  itemId: string;
  itemName: string;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * The item's single primary action: "I already bought this" (Founder
 * direction, 2026-08-24: label the button "Bought" directly, not "Buy" ->
 * "Bought" -- a staff member pressing this is already standing in the
 * store). Marking bought never touches Inventory quantities -- it only
 * records an acknowledgement (`api.record_purchase_action`); the parent
 * list re-fetches (`onSuccess` -> `router.refresh()`) and the row itself
 * flips to the muted "bought" presentation once the server confirms
 * `purchase_status = 'bought'`, so this component has no local "bought"
 * state of its own to manage.
 */
export function MarkBoughtButton({ locationId, itemId, itemName, lang, onSuccess }: MarkBoughtButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);

  function handleClick() {
    setIsPending(true);
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('itemId', itemId);
    markPurchaseBoughtAction(formData).then((result) => {
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
      <button
        type="button"
        aria-label={`${t('boughtButton')} — ${itemName}`}
        className={hoverStyles.buttonPrimary}
        style={isPending ? buttonDisabled : buttonPrimary}
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? t('markingBoughtButton') : t('boughtButton')}
      </button>
      {error ? <span style={{ fontSize: 11, color: colors.dangerText, textAlign: 'right' }}>{error}</span> : null}
    </div>
  );
}
