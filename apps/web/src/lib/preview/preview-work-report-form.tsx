'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { previewSubmitWorkReport } from './actions/staff-attendance-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, card, input as inputStyle, mutedText } from '@/lib/ui/theme';

/**
 * Phase 1N-4C Slice B2b - preview-specific staff client island for work
 * report (attendance) submission. Calls only `previewSubmitWorkReport` (never
 * the dashboard `attendance-actions.ts`). No employee/location/tenant field
 * is ever submitted or controllable from this form.
 */
export interface PreviewWorkReportFormProps {
  defaultWorkDate: string;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '勤務報告を提出しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewWorkReportForm({ defaultWorkDate }: PreviewWorkReportFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await previewSubmitWorkReport(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>勤務報告の提出</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>日付</span>
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>
            <span style={{ ...mutedText, fontSize: 13 }}>出勤</span>
            <input style={inputStyle} type="time" name="clockInLocal" />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ ...mutedText, fontSize: 13 }}>退勤</span>
            <input style={inputStyle} type="time" name="clockOutLocal" />
          </label>
        </div>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>交通費</span>
          <input style={inputStyle} type="number" name="transportationCost" min={0} />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>メッセージ</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} name="dailyMessage" maxLength={500} />
        </label>
        <button type="submit" style={buttonPrimary} disabled={isPending}>
          {isPending ? '送信中...' : '提出する'}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
