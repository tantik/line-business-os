'use client';

import { useState } from 'react';
import type { Issue } from '@/lib/issues/issues';
import { Dialog } from '@line-os/ui';
import { HelpIconButton } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { IssuesStaffBody } from '../issues/issues-staff-body';
import { tIssues } from '../issues/issues-i18n';

export interface IssuesStaffPopupProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  issuesOpen: Issue[] | null;
  onChange: () => void;
}

/**
 * Staff "Issues & Handover" popup (Cafe v2.2 WP2, Slice C) -- mirrors
 * `IssuesManagerPopup`'s exact `_ui/` shell pattern (a `@line-os/ui` `Dialog`
 * wrapping the module's own body, rendered inside the caller's `LangProvider`),
 * but wraps `IssuesStaffBody` instead: quick-report first, read-only feed,
 * no management controls.
 */
export function IssuesStaffPopup({ open, onClose, locationId, issuesOpen, onChange }: IssuesStaffPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tIssues>[1]) => tIssues(lang, key);
  usePopupOpenTiming(open, 'issues');
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('popupTitle')}
      titleAdornment={<HelpIconButton ariaLabel={t('popupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      size="wide"
      closeLabel={t('backToStaff')}
    >
      <IssuesStaffBody t={t} lang={lang} locationId={locationId} issuesOpen={issuesOpen} onChange={onChange} />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} size="form">
        <div className="whitespace-pre-line">{t('staffPopupHelpBody')}</div>
      </Dialog>
    </Dialog>
  );
}
