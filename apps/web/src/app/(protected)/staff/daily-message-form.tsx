'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { alertDanger, buttonDisabled, buttonSecondary, card, input } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';
import { tStaffDashboard } from './staff-dashboard-i18n';

export interface DailyMessageFormProps {
  workDate: string;
  defaultDailyMessage: string | null;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Today's message to the manager, on its own (Founder direction,
 * 2026-08-24: split out from transportation cost -- different entities, and
 * this one needs a deliberate Send, not autosave, since it's a note someone
 * else will read). Submits through the canonical `submitWorkReport` action
 * with only `workDate` + `dailyMessage` in the FormData (no
 * `transportationCost` key), which the action treats as "leave the
 * transportation cost unchanged" (see `attendance-actions.ts`).
 */
export function DailyMessageForm({ workDate, defaultDailyMessage, lang, onSuccess }: DailyMessageFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('dailyMessageLabel')}</h2>
        <HelpIconButton ariaLabel={t('messageHelpAriaLabel')} onClick={() => setHelpOpen(true)} />
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
        {error ? <div style={alertDanger}>{error}</div> : null}
        <textarea
          style={{ ...input, minHeight: 72, resize: 'vertical' }}
          name="dailyMessage"
          maxLength={500}
          defaultValue={defaultDailyMessage ?? ''}
          placeholder={t('messagePlaceholder')}
        />
        <button type="submit" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending}>
          {isPending ? t('submitting') : t('sendButton')}
        </button>
      </form>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('dailyMessageLabel')} width="min(420px, 94vw)">
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('messageHelpBody')}</p>
      </Modal>
    </section>
  );
}

