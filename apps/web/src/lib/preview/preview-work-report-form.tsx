'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { previewSubmitWorkReport } from './actions/staff-attendance-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { HELP_STAFF_TRANSPORT_MESSAGE } from '@/lib/demo/cafe/helpContent';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tStaff } from '@/lib/demo/cafe/i18n.staff';

/**
 * Phase 1N-4C Slice B2b - preview-specific staff client island for work
 * report details (transportation/message) submission. Clock-in/out is owned
 * by `PreviewClockPanel`. Calls only `previewSubmitWorkReport` (never
 * the dashboard `attendance-actions.ts`). No employee/location/tenant field
 * is ever submitted or controllable from this form.
 */
export interface PreviewWorkReportFormProps {
  defaultWorkDate: string;
  defaultTransportationCost?: number | null;
  defaultDailyMessage?: string | null;
  embedded?: boolean;
  hideWorkDate?: boolean;
  messageOnly?: boolean;
  locked?: boolean;
}

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tStaff(lang, 'workReportSubmittedFeedback') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

export function PreviewWorkReportForm({
  defaultWorkDate,
  defaultTransportationCost = null,
  defaultDailyMessage = null,
  embedded = false,
  hideWorkDate = false,
  messageOnly = false,
  locked = false,
}: PreviewWorkReportFormProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaff>[1]) => tStaff(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (hideWorkDate) formData.set('workDate', defaultWorkDate);
    if (messageOnly && defaultTransportationCost != null) {
      formData.set('transportationCost', String(defaultTransportationCost));
    }

    startTransition(async () => {
      const result = await previewSubmitWorkReport(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={embedded ? undefined : card}>
      {!embedded ? <h2 style={{ margin: 0, fontSize: 16 }}>{t('workReportFormTitle')}</h2> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: embedded ? 0 : 12 }}>
        {!hideWorkDate ? (
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>{t('workDate')}</span>
            <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
          </label>
        ) : null}
        {!messageOnly ? <label>
          <span style={{ ...mutedText, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {t('transport')} <DemoHelpButton content={HELP_STAFF_TRANSPORT_MESSAGE} />
          </span>
          <input
            style={inputStyle}
            type="number"
            name="transportationCost"
            min={0}
            placeholder={t('transportRemembered')}
            defaultValue={defaultTransportationCost ?? ''}
          />
        </label> : null}
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('message')}</span>
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            name="dailyMessage"
            maxLength={500}
            placeholder={t('messagePlaceholder')}
            defaultValue={defaultDailyMessage ?? ''}
            disabled={locked}
          />
        </label>
        <button
          type="submit"
          style={hideWorkDate ? { ...buttonSecondary, alignSelf: 'flex-start' } : buttonPrimary}
          disabled={isPending || locked}
        >
          {isPending ? t('submitting') : locked ? t('reportConfirmed') : messageOnly ? t('updateMessage') : hideWorkDate ? t('save') : t('submitPreference')}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
