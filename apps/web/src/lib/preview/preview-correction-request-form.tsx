'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { previewSubmitCorrectionRequest } from './actions/staff-attendance-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, card, input as inputStyle, mutedText } from '@/lib/ui/theme';

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
  /** The caller's own work-report rows, offered as an optional link target - a correction can also be filed with no `attendanceId` at all. */
  attendanceOptions: WorkforceAttendance[] | null;
  defaultWorkDate: string;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '修正依頼を提出しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewCorrectionRequestForm({ attendanceOptions, defaultWorkDate }: PreviewCorrectionRequestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await previewSubmitCorrectionRequest(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>修正依頼の提出</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>日付</span>
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>関連する勤務報告（任意）</span>
          <select style={inputStyle} name="attendanceId" defaultValue="">
            <option value="">なし</option>
            {(attendanceOptions ?? []).map((a) => (
              <option key={a.attendanceId} value={a.attendanceId}>
                {a.workDate} ({a.status})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>メッセージ</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} name="message" maxLength={500} />
        </label>
        <button type="submit" style={buttonPrimary} disabled={isPending}>
          {isPending ? '送信中...' : '提出する'}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
