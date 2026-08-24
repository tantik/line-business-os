'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { alertDanger, buttonDisabled, buttonSecondary, card, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface TransportMessageFormProps {
  workDate: string;
  defaultTransportationCost: number | null;
  defaultDailyMessage: string | null;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Compact today's-transport-and-message module (Founder reference,
 * 2026-08-24: the `mame-to-cha` legacy page's "Transport"/"Message" block --
 * no date/clock/break fields, just today's transport cost and a note for
 * the manager). Submits through the same canonical `submitWorkReport` action
 * the full work-report form used, with `workDate` fixed to today via a
 * hidden field and no `clockInLocal`/`clockOutLocal` fields at all -- relies
 * on that action treating an omitted clock field as "leave unchanged" (see
 * `attendance-actions.ts`), so this never touches a clock-in/out already
 * recorded via `WorkStatusCard`.
 */
export function TransportMessageForm({ workDate, defaultTransportationCost, defaultDailyMessage, lang, onSuccess }: TransportMessageFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('workDate', workDate);

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
    <section style={card}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
        {error ? <div style={alertDanger}>{error}</div> : null}
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('transportationCostLabel')}</span>
          <input
            style={input}
            type="number"
            name="transportationCost"
            min={0}
            defaultValue={defaultTransportationCost ?? ''}
            placeholder={lang === 'ja' ? '前回の値を記憶' : 'Remembers last value'}
          />
        </label>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('dailyMessageLabel')}</span>
          <textarea
            style={{ ...input, minHeight: 72, resize: 'vertical' }}
            name="dailyMessage"
            maxLength={500}
            defaultValue={defaultDailyMessage ?? ''}
          />
        </label>
        <button type="submit" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending}>
          {isPending ? t('submitting') : lang === 'ja' ? '保存' : 'Save'}
        </button>
      </form>
    </section>
  );
}
