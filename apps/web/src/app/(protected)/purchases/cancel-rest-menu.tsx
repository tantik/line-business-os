'use client';

import { useState } from 'react';
import { Menu } from '@line-os/ui';
import { ConfirmDialog } from '@/components/shared/design-kit';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { closePurchaseOrderRemainderAction } from '@/lib/purchases/actions';
import { colors } from '@/lib/ui/theme';
import { formatCancelRestBody } from './awaiting-copy';
import { describePurchasesWriteError } from './error-copy';
import { tPurchasesDashboard } from './purchases-i18n';

export interface CancelRestMenuProps {
  locationId: string;
  itemId: string;
  itemName: string;
  unit: string;
  /** The open order being cancelled -- sent as the RPC's stale-order guard. */
  orderActionId: string;
  openQuantity: number;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * "Cancel the rest" of an item's open order (0137,
 * `api.close_purchase_order_remainder`). A rare action, so it sits behind the
 * row's ••• menu (ORUWA design-system charter). The Radix `Menu` from
 * `@line-os/ui` -- not the design-kit `ActionsMenu` -- because this renders
 * inside the Purchases popup's Radix `Dialog`, which makes the body-portaled
 * `ActionsMenu` unclickable (QA3 2026-10-13, see
 * `inventory/inventory-actions-menu.test.ts`). The confirmation stays open
 * with a pending label until the server answers (QA4 F5: progress shows
 * immediately), then the page refreshes like every other Purchases action.
 */
export function CancelRestMenu({ locationId, itemId, itemName, unit, orderActionId, openQuantity, lang, onSuccess }: CancelRestMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);

  function handleConfirm() {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    const formData = new FormData();
    formData.set('locationId', locationId);
    formData.set('itemId', itemId);
    formData.set('expectedOrderActionId', orderActionId);
    closePurchaseOrderRemainderAction(formData)
      .then((result) => {
        setIsPending(false);
        setConfirmOpen(false);
        if (result.status === 'success') {
          onSuccess();
        } else {
          setError(describePurchasesWriteError(result, lang));
          // The order may already be gone (received/closed elsewhere) --
          // refresh so the row reflects reality behind the error message.
          if (result.status === 'no_open_order' || result.status === 'stale_snapshot') onSuccess();
        }
      })
      .catch(() => {
        setIsPending(false);
        setConfirmOpen(false);
        setError(t('somethingWentWrongError'));
      });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <Menu
        label={`${t('moreActionsAriaLabel')} — ${itemName}`}
        items={[
          {
            key: 'cancel-rest',
            label: isPending ? t('cancelRestPendingButton') : t('cancelRestButton'),
            onSelect: () => {
              setError(null);
              setConfirmOpen(true);
            },
            destructive: true,
            disabled: isPending,
          },
        ]}
      />
      {error ? <span style={{ fontSize: 11, color: colors.dangerText, textAlign: 'right' }}>{error}</span> : null}
      <ConfirmDialog
        open={confirmOpen}
        title={t('cancelRestConfirmTitle')}
        confirmLabel={isPending ? t('cancelRestPendingButton') : t('cancelRestButton')}
        cancelLabel={t('keepWaitingButton')}
        pending={isPending}
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        <strong style={{ color: colors.textPrimary }}>{itemName}</strong>
        <br />
        {formatCancelRestBody(lang, openQuantity, unit)}
      </ConfirmDialog>
    </div>
  );
}
