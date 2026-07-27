'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewScheduleActions } from './preview-schedule-actions';
import { buttonPrimary } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_MANAGER_AUTO_SCHEDULE } from '@/lib/demo/cafe/helpContent';
import { previewPublishSchedule } from './actions/schedule-actions';
import { previewWriteMessageJa } from './write-result';

/**
 * Demo/Preview manager UX parity: the demo's シフト表 card keeps its
 * auto-schedule/publish/manual-edit actions as header buttons that open a
 * dialog, never as permanently-open forms taking up main-dashboard space.
 * Wraps the existing `PreviewShiftEditor`/`PreviewScheduleActions` islands
 * (unchanged, still calling only their allowlisted preview Server Actions)
 * in the same dialog pattern. Also surfaces the week's submitted shift
 * preferences as read-only reference inside the shift-edit dialog, since
 * that is exactly the moment a manager needs them.
 */
export interface PreviewScheduleCardActionsProps {
  periodStart: string;
  periodEnd: string;
}

export function PreviewScheduleCardActions({
  periodStart,
  periodEnd,
}: PreviewScheduleCardActionsProps) {
  const [scheduleActionsOpen, setScheduleActionsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const router = useRouter();

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
      <button type="button" style={buttonPrimary} onClick={() => setScheduleActionsOpen(true)}>
        自動シフト作成
      </button>
      <DemoHelpButton content={HELP_MANAGER_AUTO_SCHEDULE} />
      <button type="button" style={buttonPrimary} onClick={publishSchedule} disabled={isPending}>
        スケジュールを公開
      </button>

      <Modal open={scheduleActionsOpen} onClose={() => setScheduleActionsOpen(false)} title="自動シフト作成" maxWidth={640}>
        <PreviewScheduleActions periodStart={periodStart} periodEnd={periodEnd} showPublish={false} />
      </Modal>
      {publishFeedback ? <span style={{ fontSize: 12, color: '#B42318' }}>{publishFeedback}</span> : null}
    </div>
  );
}
