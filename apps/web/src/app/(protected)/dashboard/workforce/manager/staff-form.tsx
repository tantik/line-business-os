'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { upsertEmployee } from '@/lib/workforce/staff-actions';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';

export interface StaffFormProps {
  locationId: string;
  /** Omit/undefined to create a new employee; pass an existing entry to edit it. Active/inactive is handled by a separate action, not this form. */
  employee?: WorkforceStaffManageEntry;
  onSuccess: () => void;
  onCancel: () => void;
}

export function StaffForm({ locationId, employee, onSuccess, onCancel }: StaffFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (employee) formData.set('id', employee.staffId);
    // Preserve the employee's own location on edit (the page's active location is only a create-time default) -- this manager page can list staff across locations, and an edit shouldn't silently move someone.
    formData.set('locationId', employee?.locationId ?? locationId);

    startTransition(async () => {
      const result = await upsertEmployee(formData);
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
        <span style={{ ...mutedText, fontSize: 13 }}>Name</span>
        <input style={input} name="name" defaultValue={employee?.name ?? ''} maxLength={120} required />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>Position</span>
        <input style={input} name="positionLabel" defaultValue={employee?.positionLabel ?? ''} maxLength={60} />
      </label>
      <label>
        <span style={{ ...mutedText, fontSize: 13 }}>Employment type</span>
        <input style={input} name="employmentType" defaultValue={employee?.employmentType ?? ''} maxLength={40} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? 'Saving...' : employee ? 'Save changes' : 'Add staff'}
        </button>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
