'use client';

import { useState } from 'react';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { InventoryDashboardBody } from '../inventory/inventory-dashboard-client';
import { tInventoryDashboard } from '../inventory/inventory-i18n';

export interface StaffInventoryPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locationName: string;
  locationId: string;
  locationTimezone: string;
  items: InventoryItemStatus[] | null;
  mediaUrlByItemId: Record<string, string>;
  /** Pure UX affordance (RLS is the real boundary regardless): whether this staff member also holds `inventory.item.manage`. Almost always false for a plain staff account -- gates catalog-management controls and the Deactivated filter tab exactly like the Manager popup. */
  canManage: boolean;
  staffNameById: Record<string, string>;
}

/**
 * Staff-surface Inventory popup, mirroring the Manager dashboard's
 * `InventoryPopup` (`../manager/inventory-popup.tsx`) exactly -- same shared
 * `InventoryDashboardBody` embedded in the same design-kit `Modal`, just
 * mounted from the Staff dashboard instead. Previously Staff's Inventory
 * entry point was a plain full-page `<Link href="/inventory">`; this closes
 * the "deferred Staff-surface follow-up mission" noted in
 * `entry-points-card.tsx`.
 */
export function StaffInventoryPopup({
  open,
  onClose,
  tenantName,
  locationName,
  locationId,
  locationTimezone,
  items,
  mediaUrlByItemId,
  canManage,
  staffNameById,
}: StaffInventoryPopupProps) {
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
          mediaUrlByItemId={mediaUrlByItemId}
          canManage={canManage}
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
