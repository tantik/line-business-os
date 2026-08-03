'use client';

import { useState, useTransition } from 'react';
import { AutoScheduleModal } from '@/components/demo/cafe/AutoScheduleModal';
import { buttonPrimary, demoColors } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_AUTO_SCHEDULE } from '@/lib/demo/cafe/helpContent';
import { previewPublishSchedule, previewRunAutoDistribution } from './actions/schedule-actions';
import { previewWriteMessage } from './write-result';
import { addIsoDays } from '@/lib/workforce/timezone';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

/**
 * Demo/Preview manager UX parity: the demo's シフト表 card keeps its
 * auto-schedule and publish actions as header buttons. Preview uses the exact
 * same presentation dialog while keeping its real, allowlisted Server Action.
 */
export interface PreviewScheduleCardActionsProps {
  periodStart: string;
  periodEnd: string;
  requiredHeadcountByWeekday: number[];
  hasUnpublishedChanges: boolean;
  /**
   * Called after a successful auto-distribute/publish so the caller
   * (`PreviewManagerViewChrome`) can re-fetch just the currently-displayed
   * week (`previewGetScheduleWeek`) - never `router.refresh()`, which would
   * re-run the whole Manager page. Preview Manager architecture, perf
   * phase 2.
   */
  onScheduleChanged: () => Promise<void>;
}

export function PreviewScheduleCardActions({
  periodStart,
  periodEnd,
  requiredHeadcountByWeekday,
  hasUnpublishedChanges,
  onScheduleChanged,
}: PreviewScheduleCardActionsProps) {
  const [scheduleActionsOpen, setScheduleActionsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);

  function createSchedule() {
    setPublishFeedback(null);
    startTransition(async () => {
      const result = await previewRunAutoDistribution({
        periodStart,
        periodEnd,
        staffingRequirements: requiredHeadcountByWeekday.map((requiredHeadcount, weekday) => ({
          workDate: addIsoDays(periodStart, weekday),
          windowCode: 'ALL',
          requiredHeadcount,
        })),
        overwriteExisting: false,
      });
      if (result.status === 'success') {
        await onScheduleChanged();
      } else {
        setPublishFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  function publishSchedule() {
    const formData = new FormData();
    formData.set('periodStart', periodStart);
    formData.set('periodEnd', periodEnd);
    setPublishFeedback(null);
    startTransition(async () => {
      const result = await previewPublishSchedule(formData);
      if (result.status === 'success') {
        await onScheduleChanged();
      } else {
        setPublishFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={buttonPrimary} onClick={() => setScheduleActionsOpen(true)} disabled={isPending}>
        {t('autoScheduleButton')}
      </button>
      <DemoHelpButton content={HELP_MANAGER_AUTO_SCHEDULE} />
      <button
        type="button"
        style={{ ...buttonPrimary, background: hasUnpublishedChanges ? demoColors.accent : demoColors.textMuted }}
        onClick={publishSchedule}
        disabled={isPending || !hasUnpublishedChanges}
      >
        {t('publishScheduleButton')}
      </button>

      <AutoScheduleModal
        open={scheduleActionsOpen}
        onClose={() => setScheduleActionsOpen(false)}
        onConfirm={createSchedule}
        description={`${periodStart}〜${periodEnd} ${t('autoScheduleConfirmBody')}`}
      />
      {publishFeedback ? <span style={{ fontSize: 12, color: '#B42318' }}>{publishFeedback}</span> : null}
    </div>
  );
}
