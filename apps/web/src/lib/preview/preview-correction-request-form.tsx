'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { previewSubmitCorrectionRequest } from './actions/staff-attendance-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';

/**
 * Phase 1N-4C Slice B2b - preview-specific staff client island for
 * attendance-correction-request submission. Calls only
 * `previewSubmitCorrectionRequest` (never the dashboard `attendance-actions.ts`).
 * `attendanceId` is the only client-supplied identifier here - a legitimate
 * optional target reference, re-verified server-side against the caller's own
 * self-scoped attendance before the mutation; no employee/location/tenant
 * field is ever submitted or controllable from this form.
 */
export interface PreviewCorrectionRequestFormProps {
  defaultWorkDate: string;
  defaultAttendance?: WorkforceAttendance | null;
  timeZone: string;
  embedded?: boolean;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '修正依頼を提出しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewCorrectionRequestForm({
  defaultWorkDate,
  defaultAttendance = null,
  timeZone,
  embedded = false,
}: PreviewCorrectionRequestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const defaultClockIn = defaultAttendance?.clockIn
    ? utcIsoToLocalDateTime(defaultAttendance.clockIn, timeZone).localTime
    : '';
  const defaultClockOut = defaultAttendance?.clockOut
    ? utcIsoToLocalDateTime(defaultAttendance.clockOut, timeZone).localTime
    : '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (defaultAttendance?.attendanceId) formData.set('attendanceId', defaultAttendance.attendanceId);

    startTransition(async () => {
      const result = await previewSubmitCorrectionRequest(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={embedded ? undefined : card}>
      {!embedded ? <h2 style={{ margin: 0, fontSize: 16 }}>修正依頼の提出</h2> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: embedded ? 0 : 12 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>日付</span>
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>実際の出勤時間</span>
            <input style={inputStyle} type="time" name="clockInLocal" defaultValue={defaultClockIn} />
          </label>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>実際の退勤時間</span>
            <input style={inputStyle} type="time" name="clockOutLocal" defaultValue={defaultClockOut} />
          </label>
        </div>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>休憩時間（分）</span>
          <input style={inputStyle} type="number" name="actualBreakMinutes" min={0} max={480} defaultValue={defaultAttendance?.actualBreakMinutes ?? ''} />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>理由・メッセージ</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} name="message" maxLength={500} placeholder="例：開店準備で出勤が12分遅れました。" />
        </label>
        <button type="submit" style={buttonPrimary} disabled={isPending}>
          {isPending ? '送信中...' : '提出する'}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
