'use client';

import { useState } from 'react';
import type { PurchaseNeededItem } from '@/lib/purchases/items';
import type { PurchaseHistoryEntry } from '@/lib/purchases/history';
import { Dialog } from '@line-os/ui';
import { HelpIconButton } from '@/components/shared/design-kit';
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
  history: PurchaseHistoryEntry[] | null;
}

/**
 * Shared Purchases popup, mirroring `InventoryPopup`/`RecipesPopup`'s exact
 * `_ui/` pattern (reused as-is by both Manager's and Staff's dashboard):
 * wraps the same dashboard body both call sites use in the `@line-os/ui`
 * `Dialog` (moved off the legacy design-kit `Modal` during Founder
 * Acceptance QA1 2026-09-22 -- that `Modal` has no scroll-lock, so the page
 * behind it kept scrolling with the mouse wheel; Founder-reported).
 * `PurchasesDashboardBody`'s own `embedded` prop skips its page-level
 * header, and this component renders it directly inside the caller's own
 * `LangProvider` so the popup follows the caller's current language
 * selection instead of resetting to its own default.
 */
export function PurchasesPopup({ open, onClose, tenantName, locationName, locationId, locationTimezone, items, staffNameById, history }: PurchasesPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tPurchasesDashboard>[1]) => tPurchasesDashboard(lang, key);
  usePopupOpenTiming(open, 'purchases');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('pageTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      size="wide"
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
          history={history}
          embedded
        />
      )}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('closeButton')} size="form">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Dialog>
    </Dialog>
  );
}
