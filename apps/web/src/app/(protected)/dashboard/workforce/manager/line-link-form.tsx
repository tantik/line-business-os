'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { bindEmployeeLineUser, unbindEmployeeLineUser } from '@/lib/workforce/staff-actions';
import { alertDanger, buttonDisabled, buttonSecondary, input } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';

export interface LineLinkFormProps {
  employeeId: string;
  isLinked: boolean;
  onSuccess: () => void;
}

/** Per-employee LINE user id bind/unbind control. The raw id is manager-entered binding data only, never authentication -- never displayed back once bound (only bound/unbound state round-trips). */
export function LineLinkForm({ employeeId, isLinked, onSuccess }: LineLinkFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rawLineUserId, setRawLineUserId] = useState('');

  function handleBind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set('employeeId', employeeId);
    formData.set('rawLineUserId', rawLineUserId);

    startTransition(async () => {
      const result = await bindEmployeeLineUser(formData);
      if (result.status === 'success') {
        setRawLineUserId('');
        onSuccess();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  function handleUnbind() {
    if (!window.confirm('Unbind this LINE user id from this staff member?')) return;
    setError(null);
    const formData = new FormData();
    formData.set('employeeId', employeeId);

    startTransition(async () => {
      const result = await unbindEmployeeLineUser(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  if (isLinked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {error ? <div style={alertDanger}>{error}</div> : null}
        <button type="button" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending} onClick={handleUnbind}>
          {isPending ? 'Unbinding...' : 'Unbind LINE'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleBind} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ ...input, marginTop: 0, width: 170 }}
          placeholder="LINE user id"
          value={rawLineUserId}
          onChange={(event) => setRawLineUserId(event.target.value)}
          maxLength={128}
          required
        />
        <button type="submit" style={isPending ? buttonDisabled : buttonSecondary} disabled={isPending}>
          {isPending ? 'Binding...' : 'Bind'}
        </button>
      </div>
    </form>
  );
}
