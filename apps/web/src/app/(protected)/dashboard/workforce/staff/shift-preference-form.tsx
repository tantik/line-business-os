'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { submitShiftPreference } from '@/lib/workforce/schedule-actions';
import { alertDanger, buttonDisabled, buttonPrimary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';

export interface ShiftPreferenceFormProps {
  shiftTypes: WorkforceShiftType[];
  defaultWorkDate: string;
  onSuccess: () => void;
}

/** Submit a shift preference for a date -- a chosen shift type, or marked unavailable (mutually exclusive), no note field in this slice (see `SubmitShiftPreferenceInput`). */
export function ShiftPreferenceForm({ shiftTypes, defaultWorkDate, onSuccess }: ShiftPreferenceFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const activeShiftTypes = shiftTypes.filter((st) => st.isActive);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (isUnavailable) {
      formData.set('isUnavailable', 'true');
      formData.delete('shiftTypeId');
    }

    startTransition(async () => {
      const result = await submitShiftPreference(formData);
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={isUnavailable} onChange={(event) => setIsUnavailable(event.target.checked)} />
        <span style={{ fontSize: 13 }}>Unavailable this day</span>
      </label>
      {!isUnavailable ? (
        <label>
          <span style={{ ...mutedText, fontSize: 13 }}>Shift type</span>
          <select style={input} name="shiftTypeId" defaultValue="" required>
            <option value="" disabled>
              Choose a shift type
            </option>
            {activeShiftTypes.map((st) => (
              <option key={st.shiftTypeId} value={st.shiftTypeId}>
                {st.code} ({st.startsAtLocal}-{st.endsAtLocal})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
        {isPending ? 'Submitting...' : 'Submit preference'}
      </button>
    </form>
  );
}
