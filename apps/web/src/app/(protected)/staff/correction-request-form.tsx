'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';
import { attendanceStatusLabel } from '../_ui/workforce-theme';

export interface CorrectionRequestFormProps {
  /** The caller's own work-report rows, offered as an optional link target -- a correction can also be filed with no `attendanceId` at all. */
  attendanceOptions: WorkforceAttendance[];
  defaultWorkDate: string;
  lang: Lang;
  onSuccess: () => void;
}

/** Submit an attendance correction request for a date, optionally tied to one of the caller's own work-report rows, with a free-text message. */
export function CorrectionRequestForm({ attendanceOptions, defaultWorkDate, lang, onSuccess }: CorrectionRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitCorrectionRequest(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('dateLabel')}</span>
        <input style={input} type="date" name="workDate" defaultValue={defaultWorkDate} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('relatedWorkReportLabel')}</span>
        <select style={input} name="attendanceId" defaultValue="">
          <option value="">{t('relatedWorkReportNone')}</option>
          {attendanceOptions.map((a) => (
            <option key={a.attendanceId} value={a.attendanceId}>
              {a.workDate} ({attendanceStatusLabel(a.status, lang)})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('correctionMessageLabel')}</span>
        <textarea style={{ ...input, minHeight: 72, resize: 'vertical' }} name="message" maxLength={500} />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? t('submitting') : t('submitCorrectionRequest')}
      </button>
    </form>
  );
}
