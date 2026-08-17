'use client';

import { useMemo, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';
import { attendanceStatusLabel } from '../_ui/workforce-theme';

export interface CorrectionRequestFormProps {
  /** The caller's own work-report rows, offered as an optional link target -- a correction can also be filed with no `attendanceId` at all. */
  attendanceOptions: WorkforceAttendance[];
  defaultWorkDate: string;
  /** Needed to render the selected work report's current clock-in/out as local wall-clock time, matching how the rest of the Staff dashboard displays attendance. */
  timeZone: string;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Submit an attendance correction request for a date, optionally tied to one
 * of the caller's own work-report rows. Beyond the free-text reason, the
 * staff member may enter specific requested clock-in/clock-out/break values
 * -- these are the fields `decideCorrectionRequest` (shift-requests.ts)
 * already applies transactionally to attendance on Manager approval. Before
 * this form existed, only `message` was ever sent, so an "Approved" decision
 * had nothing to apply (Cafe v2.1 QA audit, P1-4, 2026-08-17).
 */
export function CorrectionRequestForm({ attendanceOptions, defaultWorkDate, timeZone, lang, onSuccess }: CorrectionRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [attendanceId, setAttendanceId] = useState('');
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  const selectedAttendance = useMemo(
    () => attendanceOptions.find((a) => a.attendanceId === attendanceId),
    [attendanceOptions, attendanceId],
  );
  const currentClockIn = selectedAttendance?.clockIn ? utcIsoToLocalDateTime(selectedAttendance.clockIn, timeZone).localTime : null;
  const currentClockOut = selectedAttendance?.clockOut ? utcIsoToLocalDateTime(selectedAttendance.clockOut, timeZone).localTime : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formEl = event.currentTarget;
    const formData = new FormData(formEl);

    startTransition(async () => {
      const result = await submitCorrectionRequest(formData);
      if (result.status === 'success') {
        formEl.reset();
        setAttendanceId('');
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
        <select style={input} name="attendanceId" value={attendanceId} onChange={(e) => setAttendanceId(e.target.value)}>
          <option value="">{t('relatedWorkReportNone')}</option>
          {attendanceOptions.map((a) => (
            <option key={a.attendanceId} value={a.attendanceId}>
              {a.workDate} ({attendanceStatusLabel(a.status, lang)})
            </option>
          ))}
        </select>
      </label>
      {selectedAttendance ? (
        <p style={{ margin: 0, ...mutedText, fontSize: 12 }}>
          {t('currentClockTimesLabel')}: {currentClockIn ?? '-'} - {currentClockOut ?? '-'}
        </p>
      ) : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('requestedClockInLabel')}</span>
        <input style={input} type="time" name="clockInLocal" />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('requestedClockOutLabel')}</span>
        <input style={input} type="time" name="clockOutLocal" />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('requestedBreakLabel')}</span>
        <input style={input} type="number" name="actualBreakMinutes" min={0} step="1" />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('correctionMessageLabel')}</span>
        <textarea style={{ ...input, minHeight: 72, resize: 'vertical' }} name="message" maxLength={500} required />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? t('submitting') : t('submitCorrectionRequest')}
      </button>
    </form>
  );
}
