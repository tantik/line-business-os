'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { previewRequestShiftExchange } from './actions/shift-exchange-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { buttonDisabled, buttonPrimary, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tShiftExchange } from '@/lib/demo/cafe/i18n.shiftExchange';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';

/**
 * Staff client island for requesting a shift exchange on one's own shift.
 * Calls only `previewRequestShiftExchange`. `shiftId` is the only
 * client-supplied identifier -- re-verified server-side (own/published/
 * future shift only) before the mutation, same pattern as
 * `preview-correction-request-form.tsx`. Reached from the schedule "tap own
 * shift" modal (`preview-staff-schedule.tsx`), never from a permanently
 * visible form.
 */
export interface PreviewShiftExchangeRequestFormProps {
  shiftId: string;
  onSuccess: () => void;
  shiftTypes: WorkforceShiftType[];
}

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tShiftExchange(lang, 'requestButton') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

export function PreviewShiftExchangeRequestForm({ shiftId, shiftTypes, onSuccess }: PreviewShiftExchangeRequestFormProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tShiftExchange>[1]) => tShiftExchange(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [requestKind, setRequestKind] = useState<'change' | 'cancel' | 'exchange'>('change');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('shiftId', shiftId);

    startTransition(async () => {
      const result = await previewRequestShiftExchange(formData);
      const fb = toFeedback(lang, result);
      setFeedback(fb);
      if (result.status === 'success') {
        router.refresh();
        onSuccess();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 8 }}>
      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>{lang === 'ja' ? '依頼内容' : 'Request type'}</span>
        <select style={inputStyle} name="requestKind" value={requestKind} onChange={(event) => setRequestKind(event.target.value as typeof requestKind)}>
          <option value="change">{lang === 'ja' ? '別のシフトに変更' : 'Change shift'}</option>
          <option value="cancel">{lang === 'ja' ? 'シフトをキャンセル' : 'Cancel shift'}</option>
          <option value="exchange">{lang === 'ja' ? '同僚と交代' : 'Exchange with a colleague'}</option>
        </select>
      </label>
      {requestKind === 'change' ? (
        <label>
          <span style={{ ...mutedText, fontSize: 12 }}>{lang === 'ja' ? '希望シフト' : 'Requested shift'}</span>
          <select style={inputStyle} name="requestedShiftTypeId" required defaultValue="">
            <option value="" disabled>{lang === 'ja' ? '選択してください' : 'Select a shift'}</option>
            {shiftTypes.filter((type) => type.isActive).map((type) => <option key={type.shiftTypeId} value={type.shiftTypeId}>{shiftTypeDisplayLabel(type)} ({type.startsAtLocal.slice(0, 5)}–{type.endsAtLocal.slice(0, 5)})</option>)}
          </select>
        </label>
      ) : null}
      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>{t('reasonPlaceholder')}</span>
        <textarea
          style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }}
          name="reason"
          maxLength={500}
          required
        />
      </label>
      {feedback && !feedback.ok ? <p style={{ margin: 0, fontSize: 12.5, color: '#B42318' }}>{feedback.text}</p> : null}
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? t('submitting') : (lang === 'ja' ? '変更依頼を送信' : 'Submit request')}
      </button>
    </form>
  );
}
