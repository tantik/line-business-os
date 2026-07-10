'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';

export interface WorkReportFormProps {
  defaultWorkDate: string;
  onSuccess: () => void;
}

/** Submit (create or edit) a work report for a date -- clock in/out, transportation cost, and a daily message are all optional. No break-minutes field in this slice (see `SubmitWorkReportInput`). */
export function WorkReportForm({ defaultWorkDate, onSuccess }: WorkReportFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await submitWorkReport(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>Date</span>
        <input style={input} type="date" name="workDate" defaultValue={defaultWorkDate} required />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>Clock in</span>
          <input style={input} type="time" name="clockInLocal" />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 13 }}>Clock out</span>
          <input style={input} type="time" name="clockOutLocal" />
        </label>
      </div>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>Transportation cost</span>
        <input style={input} type="number" name="transportationCost" min={0} />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>Daily message</span>
        <textarea style={{ ...input, minHeight: 72, resize: 'vertical' }} name="dailyMessage" maxLength={500} />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit work report'}
      </button>
    </form>
  );
}
