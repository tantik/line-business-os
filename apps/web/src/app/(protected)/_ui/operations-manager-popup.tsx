'use client';

import { useState } from 'react';
import type { OperationsTemplate, OperationsTemplateItem } from '@/lib/operations/templates';
import type { OperationsSchedule } from '@/lib/operations/schedules';
import type { OperationsExpectedTask } from '@/lib/operations/tasks';
import type { OperationsOpenException } from '@/lib/operations/exceptions';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { OperationsManagerBody } from '../operations/operations-manager-client';
import { tOperations } from '../operations/operations-i18n';

export interface OperationsManagerPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locationName: string;
  locationId: string;
  templates: OperationsTemplate[] | null;
  items: OperationsTemplateItem[] | null;
  itemsError: string | null;
  schedules: OperationsSchedule[] | null;
  schedulesError: string | null;
  todayTasks: OperationsExpectedTask[] | null;
  openExceptions: OperationsOpenException[] | null;
}

/**
 * Shared Manager Operations popup, mirroring `PurchasesPopup`/`InventoryPopup`'s
 * exact `_ui/` pattern: wraps `OperationsManagerBody` (Templates/Items,
 * Scheduling, Today, Attention -- everything `/operations/page.tsx`'s Manager
 * branch previously rendered as its own standalone page) in a design-kit
 * `Modal`. `OperationsManagerBody`'s own `embedded` prop skips its
 * page-level header, and this component renders it directly inside the
 * caller's own `LangProvider` so the popup follows the caller's current
 * language selection instead of resetting to its own default.
 */
export function OperationsManagerPopup({
  open,
  onClose,
  tenantName,
  locationName,
  locationId,
  templates,
  items,
  itemsError,
  schedules,
  schedulesError,
  todayTasks,
  openExceptions,
}: OperationsManagerPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  usePopupOpenTiming(open, 'operations');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('pageTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(960px, 96vw)"
      closeLabel={t('backToManager')}
    >
      <OperationsManagerBody
        tenantName={tenantName}
        locationName={locationName}
        locationId={locationId}
        templates={templates}
        items={items}
        itemsError={itemsError}
        schedules={schedules}
        schedulesError={schedulesError}
        todayTasks={todayTasks}
        openExceptions={openExceptions}
        embedded
      />

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
