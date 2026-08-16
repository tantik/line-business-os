'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface WorkReportFormProps {
  defaultWorkDate: string;
  lang: Lang;
  onSuccess: () => void;
}

/** Submit (create or edit) a work report for a date, including the actual break selected at clock-out. */
export function WorkReportForm({ defaultWorkDate, lang, onSuccess }: WorkReportFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitWorkReport(formData);
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
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('clockInColumnLabel')}</span>
          <input style={input} type="time" name="clockInLocal" />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('clockOutColumnLabel')}</span>
          <input style={input} type="time" name="clockOutLocal" />
        </label>
      </div>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('actualBreakLabel')}</span>
        <select style={input} name="actualBreakMinutes" defaultValue="0">
          <option value="0">{t('breakMinutes0')}</option>
          <option value="30">{t('breakMinutes30')}</option>
          <option value="60">{t('breakMinutes60')}</option>
        </select>
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('transportationCostLabel')}</span>
        <input style={input} type="number" name="transportationCost" min={0} />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('dailyMessageLabel')}</span>
        <textarea style={{ ...input, minHeight: 72, resize: 'vertical' }} name="dailyMessage" maxLength={500} />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? t('submitting') : t('submitWorkReport')}
      </button>
    </form>
  );
}
