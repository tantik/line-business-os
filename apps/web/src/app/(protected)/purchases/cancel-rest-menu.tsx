'use client';

import { useState } from 'react';
import { ConfirmDialog, Menu } from '@line-os/ui';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { closePurchaseOrderRemainderAction } from '@/lib/purchases/actions';
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
 * row's ••• menu (ORUWA design-system charter). The Radix `Menu` and
 * `ConfirmDialog` from `@line-os/ui` -- not the design-kit ones -- because this
 * renders inside the Purchases popup's Radix `Dialog`: the body-portaled
 * design-kit `ActionsMenu` is unclickable there (QA3 2026-10-13, see
 * `inventory/inventory-actions-menu.test.ts`) and the design-kit confirm's
 * document-level Escape would also close the whole popup. The confirmation
 * stays open with a pending label until the server answers (QA4 F5). A
 * failure is shown inside the confirmation; when the order is already gone
 * (received/closed elsewhere) the page refreshes after it is dismissed, so the
 * message is read before the row changes.
 */
export function CancelRestMenu({ locationId, itemId, itemName, unit, orderActionId, openQuantity, lang, onSuccess }: CancelRestMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshOnClose, setRefreshOnClose] = useState(false);
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);

  function closeConfirm() {
    setConfirmOpen(false);
    setError(null);
    if (refreshOnClose) {
      setRefreshOnClose(false);
      onSuccess();
    }
  }

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
        if (result.status === 'success') {
          setConfirmOpen(false);
          onSuccess();
        } else {
          setError(describePurchasesWriteError(result, lang));
          if (result.status === 'no_open_order' || result.status === 'stale_snapshot') setRefreshOnClose(true);
        }
      })
      .catch(() => {
        setIsPending(false);
        setError(t('somethingWentWrongError'));
      });
  }

  return (
    <>
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
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => (next ? setConfirmOpen(true) : closeConfirm())}
        title={t('cancelRestConfirmTitle')}
        description={
          <>
            <strong>{itemName}</strong>
            <br />
            {formatCancelRestBody(lang, openQuantity, unit)}
            {error ? (
              <span role="alert" className="mt-2 block text-sm text-danger-text">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel={isPending ? t('cancelRestPendingButton') : t('cancelRestButton')}
        cancelLabel={t('keepWaitingButton')}
        pending={isPending}
        confirmVariant="destructive"
        onConfirm={handleConfirm}
      />
    </>
  );
}
