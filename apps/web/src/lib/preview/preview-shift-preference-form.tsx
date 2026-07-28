'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { previewSubmitShiftPreference } from './actions/staff-schedule-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, card, input as inputStyle, mutedText } from '@/lib/demo/cafe/theme';

/**
 * Phase 1N-4C Slice B2b - preview-specific staff client island for shift
 * preference submission. Calls only `previewSubmitShiftPreference` (never the
 * dashboard `schedule-actions.ts`). No employee/location/tenant field is ever
 * submitted or controllable from this form - identity and location are always
 * server-resolved from the caller's own authenticated employee binding.
 */
export interface PreviewShiftPreferenceFormProps {
  shiftTypes: WorkforceShiftType[] | null;
  defaultWorkDate: string;
  embedded?: boolean;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '希望を提出しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewShiftPreferenceForm({ shiftTypes, defaultWorkDate, embedded = false }: PreviewShiftPreferenceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const activeShiftTypes = (shiftTypes ?? []).filter((st) => st.isActive);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (isUnavailable) {
      formData.set('isUnavailable', 'true');
      formData.delete('shiftTypeId');
    }

    startTransition(async () => {
      const result = await previewSubmitShiftPreference(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={embedded ? undefined : card}>
      {!embedded ? <h2 style={{ margin: 0, fontSize: 16 }}>シフト希望の提出</h2> : null}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: embedded ? 0 : 12 }}>
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>日付</span>
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={isUnavailable} onChange={(event) => setIsUnavailable(event.target.checked)} />
          <span style={{ fontSize: 13 }}>この日は勤務不可</span>
        </label>
        {!isUnavailable ? (
          <label>
            <span style={{ ...mutedText, fontSize: 13 }}>シフト種別</span>
            <select style={inputStyle} name="shiftTypeId" defaultValue="" required>
              <option value="" disabled>
                選択してください
              </option>
              {activeShiftTypes.map((st) => (
                <option key={st.shiftTypeId} value={st.shiftTypeId}>
                  {st.code} ({st.startsAtLocal.slice(0, 5)}-{st.endsAtLocal.slice(0, 5)})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit" style={buttonPrimary} disabled={isPending}>
          {isPending ? '送信中...' : '提出する'}
        </button>
      </form>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
