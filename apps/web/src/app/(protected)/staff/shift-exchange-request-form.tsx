'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { requestMyShiftExchange } from '@/lib/workforce/shift-exchange-actions';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeExchangeError, tStaffDashboard } from './staff-dashboard-i18n';

export interface ShiftExchangeRequestFormProps {
  /** The `assignmentId` of the caller's own future shift this request targets -- always server-verified as the caller's own on submit (RLS), never trusted client state alone. */
  shiftId: string;
  /** Active shift types offered by the "Change to a different shift type" picker, shown only when `requestKind === 'change'`. `null`/empty hides the picker -- the request can still be submitted as a plain 'change' with no `requestedShiftTypeId`. */
  shiftTypes: WorkforceShiftType[] | null;
  lang: Lang;
  onSuccess: () => void;
}

/**
 * Request a shift change, cancellation, or open exchange for one of the
 * caller's own future published shifts -- canonical-dashboard counterpart to
 * `_client-preview`'s `PreviewShiftExchangeRequestForm`, ported to close the
 * "Shift change/cancel/exchange: Missing" gap the Staff-surface audit found
 * in the dashboard. Same shape/conventions as the sibling
 * `CorrectionRequestForm` in this directory.
 */
export function ShiftExchangeRequestForm({ shiftId, shiftTypes, lang, onSuccess }: ShiftExchangeRequestFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestKind, setRequestKind] = useState<'exchange' | 'change' | 'cancel'>('exchange');
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  const activeShiftTypes = (shiftTypes ?? []).filter((st) => st.isActive);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('shiftId', shiftId);

    startTransition(async () => {
      const result = await requestMyShiftExchange(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeExchangeError(lang, result.status));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, maxWidth: 360 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('requestTypeLabel')}</span>
        <select
          style={input}
          name="requestKind"
          value={requestKind}
          onChange={(e) => setRequestKind(e.target.value as 'exchange' | 'change' | 'cancel')}
        >
          <option value="exchange">{t('optionExchange')}</option>
          <option value="change">{t('optionChange')}</option>
          <option value="cancel">{t('optionCancel')}</option>
        </select>
      </label>
      {requestKind === 'change' && activeShiftTypes.length > 0 ? (
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>{t('requestedShiftTypeLabel')}</span>
          <select style={input} name="requestedShiftTypeId" defaultValue="">
            <option value="">{t('chooseShiftType')}</option>
            {activeShiftTypes.map((st) => (
              <option key={st.shiftTypeId} value={st.shiftTypeId}>
                {shiftTypeDisplayLabel(st)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>{t('reasonLabel')}</span>
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} name="reason" maxLength={500} required />
      </label>
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
