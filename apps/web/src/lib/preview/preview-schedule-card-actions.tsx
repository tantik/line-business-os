'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AutoScheduleModal } from '@/components/demo/cafe/AutoScheduleModal';
import { buttonPrimary, demoColors } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_AUTO_SCHEDULE } from '@/lib/demo/cafe/helpContent';
import { previewPublishSchedule, previewRunAutoDistribution } from './actions/schedule-actions';
import { previewWriteMessageJa } from './write-result';
import { addIsoDays } from '@/lib/workforce/timezone';

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
}

export function PreviewScheduleCardActions({
  periodStart,
  periodEnd,
  requiredHeadcountByWeekday,
  hasUnpublishedChanges,
}: PreviewScheduleCardActionsProps) {
  const [scheduleActionsOpen, setScheduleActionsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const router = useRouter();

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
        router.refresh();
      } else {
        setPublishFeedback(previewWriteMessageJa(result.status));
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
        router.refresh();
      } else {
        setPublishFeedback(previewWriteMessageJa(result.status));
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={buttonPrimary} onClick={() => setScheduleActionsOpen(true)} disabled={isPending}>
        自動シフト作成
      </button>
      <DemoHelpButton content={HELP_MANAGER_AUTO_SCHEDULE} />
      <button
        type="button"
        style={{ ...buttonPrimary, background: hasUnpublishedChanges ? demoColors.accent : demoColors.textMuted }}
        onClick={publishSchedule}
        disabled={isPending || !hasUnpublishedChanges}
      >
        スケジュールを公開
      </button>

      <AutoScheduleModal
        open={scheduleActionsOpen}
        onClose={() => setScheduleActionsOpen(false)}
        onConfirm={createSchedule}
        description={`${periodStart}〜${periodEnd} のシフトを、スタッフの希望と設定内容にもとづいて自動作成します。公開済みのシフトは上書きしません。続けますか？`}
      />
      {publishFeedback ? <span style={{ fontSize: 12, color: '#B42318' }}>{publishFeedback}</span> : null}
    </div>
  );
}
