'use client';

import { useState } from 'react';
import { Dialog } from '@line-os/ui';
import { HelpIconButton } from '@/components/shared/design-kit';
import { useLang } from '@/lib/demo/cafe/i18n';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { WeeklyReviewManagerBody, type WeeklyReviewDrillDownHandlers } from '../weekly-review/weekly-review-manager-body';
import { tWeeklyReview } from '../weekly-review/weekly-review-i18n';

export interface WeeklyReviewManagerPopupProps extends WeeklyReviewDrillDownHandlers {
  open: boolean;
  onClose: () => void;
}

/**
 * Manager "Weekly Review" popup (Cafe v2.2 WP3) -- own dashboard entry
 * point, no count badge (this is a review surface, not an action queue).
 * Mirrors `IssuesManagerPopup`'s exact `_ui/` shell pattern: a `@line-os/ui`
 * `Dialog` wrapping the module's own body, rendered inside the caller's
 * `LangProvider`. Unlike every sibling popup, the body fetches its own data
 * on demand (Prev/Next week navigation) rather than receiving server
 * page-fetched props -- see `WeeklyReviewManagerBody`'s doc comment.
 */
export function WeeklyReviewManagerPopup({ open, onClose, ...drillDown }: WeeklyReviewManagerPopupProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tWeeklyReview>[1]) => tWeeklyReview(lang, key);
  usePopupOpenTiming(open, 'weekly-review');
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
      <WeeklyReviewManagerBody t={t} lang={lang} open={open} {...drillDown} />

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title={t('popupHelpTitle')} closeLabel={t('formCancel')} size="form">
        <div className="whitespace-pre-line">{t('popupHelpBody')}</div>
      </Dialog>
    </Dialog>
  );
}
