'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { previewSubmitCorrectionRequest } from './actions/staff-attendance-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { parsePreviewSubmitCorrectionRequestInput } from '@/lib/workforce/attendance-input';
import { buttonPrimary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

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
  onSuccess?: () => void;
}

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tStaff(lang, 'correctionSubmittedFeedback') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

/**
 * FA-02 fix: pre-submit check ahead of the round trip to
 * `previewSubmitCorrectionRequest`, using the exact same
 * `parsePreviewSubmitCorrectionRequestInput` contract the server boundary
 * enforces (never a second, divergent set of rules) - this only gives an
 * immediate, specific message and avoids a network round trip for the two
 * most common mistakes; the server call below remains the authoritative
 * check for every case (a client bypass calling the Server Action directly
 * with the same invalid payload is rejected identically there).
 */
function validateBeforeSubmit(formData: FormData, lang: Lang): string | null {
  const reason = (formData.get('message')?.toString() ?? '').trim();
  if (!reason) return tStaff(lang, 'reasonRequiredError');
  const hasClockIn = Boolean(formData.get('clockInLocal')?.toString().trim());
  const hasClockOut = Boolean(formData.get('clockOutLocal')?.toString().trim());
  const hasBreak = Boolean(formData.get('actualBreakMinutes')?.toString().trim());
  if (!hasClockIn && !hasClockOut && !hasBreak) return tStaff(lang, 'correctionChangeRequiredError');
  if (!parsePreviewSubmitCorrectionRequestInput(formData)) return previewWriteMessage(lang, 'invalid_input');
  return null;
}

export function PreviewCorrectionRequestForm({
  defaultWorkDate,
  defaultAttendance = null,
  timeZone,
  embedded = false,
  onSuccess,
}: PreviewCorrectionRequestFormProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
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

    const clientError = validateBeforeSubmit(formData, lang);
    if (clientError) {
      setFeedback({ ok: false, text: clientError });
      return;
    }

    startTransition(async () => {
      const result = await previewSubmitCorrectionRequest(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') {
        router.refresh();
        onSuccess?.();
      }
    });
  }

  return (
    <section style={embedded ? undefined : card}>
      {!embedded ? <h2 style={{ margin: 0, fontSize: 16 }}>{t('correctionFormTitle')}</h2> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: embedded ? 0 : 12 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('workDate')}</span>
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('actualClockIn')}</span>
            <input style={inputStyle} type="time" name="clockInLocal" defaultValue={defaultClockIn} />
          </label>
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('actualClockOut')}</span>
            <input style={inputStyle} type="time" name="clockOutLocal" defaultValue={defaultClockOut} />
          </label>
        </div>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('breakMinutesInput')}</span>
          <input style={inputStyle} type="number" name="actualBreakMinutes" min={0} max={480} defaultValue={defaultAttendance?.actualBreakMinutes ?? ''} />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('reasonMessage')}</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} name="message" maxLength={500} placeholder={t('reasonPlaceholder')} />
        </label>
        <button type="submit" style={buttonPrimary} disabled={isPending}>
          {isPending ? t('submitting') : t('submitPreference')}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
