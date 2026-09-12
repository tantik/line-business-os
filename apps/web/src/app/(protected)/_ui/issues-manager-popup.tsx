'use client';

import { useState } from 'react';
import type { Issue } from '@/lib/issues/issues';
import { Dialog } from '@line-os/ui';
import { HelpIconButton } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { IssuesManagerBody } from '../issues/issues-manager-body';
import { tIssues } from '../issues/issues-i18n';

export interface IssuesManagerPopupProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  issuesOpen: Issue[] | null;
  issuesAll: Issue[] | null;
  onChange: () => void;
}

/**
 * Manager "Issues & Handover" popup (Cafe v2.2 WP2, Slice B) -- own dashboard
 * entry point, own count badge, deliberately NOT folded into `AttentionPanel`
 * (see `manager-dashboard-client.tsx`'s own note on the "9 vs 4+4" bug).
 * Mirrors `OperationsManagerPopup`'s exact `_ui/` shell pattern: a
 * `@line-os/ui` `Dialog` wrapping the module's own body, rendered inside the
 * caller's `LangProvider` so it follows the caller's current language
 * selection instead of resetting to a default.
 */
export function IssuesManagerPopup({ open, onClose, locationId, issuesOpen, issuesAll, onChange }: IssuesManagerPopupProps) {
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
      closeLabel={t('backToManager')}
    >
      <IssuesManagerBody t={t} lang={lang} locationId={locationId} issuesOpen={issuesOpen} issuesAll={issuesAll} onChange={onChange} />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} size="form">
        <div className="whitespace-pre-line">{t('popupHelpBody')}</div>
      </Dialog>
    </Dialog>
  );
}
