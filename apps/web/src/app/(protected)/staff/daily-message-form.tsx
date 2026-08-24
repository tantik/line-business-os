'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { submitWorkReport } from '@/lib/workforce/attendance-actions';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { alertDanger, buttonDisabled, buttonSecondary, card, colors, input } from '@/lib/ui/theme';
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
 *
 * A one-shot "compose and send" box, not an "edit your note" field: on a
 * successful send the textarea clears back to its placeholder and a
 * transient "Message sent" status shows next to the heading (Founder
 * direction, 2026-08-24) -- it does not keep showing the just-sent text.
 * `value` therefore only ever seeds from `defaultDailyMessage` once on
 * mount; it deliberately never re-syncs to a later prop change, since the
 * parent's `router.refresh()` after a successful send would otherwise
 * refill this box with the message that was just cleared.
 */
export function DailyMessageForm({ workDate, defaultDailyMessage, lang, onSuccess }: DailyMessageFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [value, setValue] = useState(defaultDailyMessage ?? '');
  const [sent, setSent] = useState(false);
  const sentResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);

  useEffect(() => () => {
    if (sentResetTimerRef.current) clearTimeout(sentResetTimerRef.current);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);
    const formData = new FormData(event.currentTarget);
    formData.set('workDate', workDate);

    setIsPending(true);
    submitWorkReport(formData).then((result) => {
      setIsPending(false);
      if (result.status === 'success') {
        setValue('');
        setSent(true);
        onSuccess();
        if (sentResetTimerRef.current) clearTimeout(sentResetTimerRef.current);
        sentResetTimerRef.current = setTimeout(() => setSent(false), 2500);
      } else {
        setError(describeWriteError(result, lang));
      }
    });
  }

  return (
    <section style={{ ...card, marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('dailyMessageLabel')}</h2>
          <HelpIconButton ariaLabel={t('messageHelpAriaLabel')} onClick={() => setHelpOpen(true)} />
        </div>
        <span style={{ fontSize: 12, minHeight: 14, color: colors.textMuted }}>{sent ? t('messageSentStatus') : ''}</span>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
        {error ? <div style={alertDanger}>{error}</div> : null}
        <textarea
          style={{ ...input, minHeight: 72, resize: 'vertical' }}
          name="dailyMessage"
          maxLength={500}
          value={value}
          onChange={(event) => setValue(event.target.value)}
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
