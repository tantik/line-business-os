'use client';

import { useState } from 'react';
import type { PurchaseNeededItem } from '@/lib/purchases/items';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { PurchasesDashboardBody } from '../purchases/purchases-dashboard-client';
import { tPurchasesDashboard } from '../purchases/purchases-i18n';

export interface PurchasesPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locationName: string;
  locationId: string;
  locationTimezone: string;
  items: PurchaseNeededItem[] | null;
  staffNameById: Record<string, string>;
}

/**
 * Shared Purchases popup, mirroring `InventoryPopup`/`RecipesPopup`'s exact
 * `_ui/` pattern (reused as-is by both Manager's and Staff's dashboard):
 * wraps the same dashboard body both call sites use in a design-kit `Modal`.
 * `PurchasesDashboardBody`'s own `embedded` prop skips its page-level
 * header, and this component renders it directly inside the caller's own
 * `LangProvider` so the popup follows the caller's current language
 * selection instead of resetting to its own default.
 */
export function PurchasesPopup({ open, onClose, tenantName, locationName, locationId, locationTimezone, items, staffNameById }: PurchasesPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);
  usePopupOpenTiming(open, 'purchases');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pageTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(720px, 96vw)"
      closeLabel={t('backToDashboard')}
    >
      {items === null ? (
        <p>{t('unavailable')}</p>
      ) : (
        <PurchasesDashboardBody
          tenantName={tenantName}
          locationName={locationName}
          locationId={locationId}
          locationTimezone={locationTimezone}
          items={items}
          staffNameById={staffNameById}
          embedded
        />
      )}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('closeButton')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
