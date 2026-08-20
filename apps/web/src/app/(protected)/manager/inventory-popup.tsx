'use client';

import { useState } from 'react';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { InventoryDashboardBody } from '../inventory/inventory-dashboard-client';
import { tInventoryDashboard } from '../inventory/inventory-i18n';

export interface InventoryPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locationName: string;
  locationId: string;
  locationTimezone: string;
  items: InventoryItemStatus[] | null;
  staffNameById: Record<string, string>;
}

/**
 * Manage-inventory popup (WP A5a, Cafe Manager parity mission): wraps the
 * existing `/inventory` dashboard body (unchanged data layer -- `items` is
 * the exact same `listInventoryItemStatus` read the Manager page's
 * Attention layer already fetches) in a design-kit `Modal`, same pattern
 * WP A4 established for Staff. `InventoryDashboardBody`'s own `embedded`
 * prop skips its page-level header (title/language-toggle/sign-out/back-
 * link), and this component renders it directly inside the Manager page's
 * existing `LangProvider` rather than the standalone page's own wrapper, so
 * the popup follows the Manager page's current language selection instead
 * of resetting to its own default.
 *
 * Known scoping simplification: `InventoryDashboardBody` has its own
 * internal Escape-key handler for its inline Add/Edit-item form (unrelated
 * to this Modal's). Unlike WP A4's Manage-staff popup, this one does not
 * layer the two -- pressing Escape while an item form is open closes both
 * the form and the whole popup in one step, rather than backing out one
 * level at a time. Acceptable: not incorrect, just less refined than A4,
 * and re-plumbing `InventoryDashboardBody`'s internal state to expose a
 * "is a nested form open" signal is not worth doing for this WP alone.
 */
export function InventoryPopup({
  open,
  onClose,
  tenantName,
  locationName,
  locationId,
  locationTimezone,
  items,
  staffNameById,
}: InventoryPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tInventoryDashboard>[1]) => tInventoryDashboard(lang, key);
  usePopupOpenTiming(open, 'inventory');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pageTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(1100px, 96vw)"
      closeLabel={t('backToDashboard')}
    >
      {items === null ? (
        <p>{t('unavailable')}</p>
      ) : (
        <InventoryDashboardBody
          tenantName={tenantName}
          locationName={locationName}
          locationId={locationId}
          locationTimezone={locationTimezone}
          items={items}
          canManage
          staffNameById={staffNameById}
          embedded
        />
      )}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('cancelButton')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
