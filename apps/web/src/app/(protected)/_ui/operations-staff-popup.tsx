'use client';

import { useState } from 'react';
import type { OperationsExpectedTask, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { StaffOperationsBody } from '../operations/staff-operations-client';
import { tOperations } from '../operations/operations-i18n';

export interface OperationsStaffPopupProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  locationName: string;
  tasks: OperationsExpectedTask[] | null;
  items: OperationsTemplateItem[] | null;
  responsesByInstanceId: Record<string, OperationsItemResponse[]>;
  businessDate: string;
}

/**
 * Shared Staff Operations popup, mirroring `OperationsManagerPopup`'s exact
 * `_ui/` pattern: wraps `StaffOperationsBody` (today's expected tasks at the
 * caller's own location, each opening a checklist to record responses/
 * report problems/complete) in a design-kit `Modal`. `StaffOperationsBody`'s
 * own `embedded` prop skips its page-level header, and this component
 * renders it directly inside the caller's own `LangProvider` so the popup
 * follows the caller's current language selection instead of resetting to
 * its own default.
 */
export function OperationsStaffPopup({
  open,
  onClose,
  tenantName,
  locationName,
  tasks,
  items,
  responsesByInstanceId,
  businessDate,
}: OperationsStaffPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tOperations>[1]) => tOperations(lang, key);
  usePopupOpenTiming(open, 'operations');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('staffPageTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(720px, 96vw)"
      closeLabel={t('backToStaff')}
    >
      <StaffOperationsBody
        tenantName={tenantName}
        locationName={locationName}
        tasks={tasks}
        items={items}
        responsesByInstanceId={responsesByInstanceId}
        businessDate={businessDate}
        embedded
      />

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('popupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
