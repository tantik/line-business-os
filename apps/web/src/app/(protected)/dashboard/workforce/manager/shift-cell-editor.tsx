'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { createShiftAssignment, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, input, mutedText } from '@/lib/ui/theme';
import { describeWriteError } from './error-copy';

export interface ShiftCellEditorProps {
  locationId: string;
  workDate: string;
  /** Present when editing an existing (always unpublished -- published assignments are read-only) assignment; absent when assigning a new one into an empty cell. */
  existing?: {
    assignment: WorkforceShiftAssignment;
    startsAtLocal: string;
    endsAtLocal: string;
  };
  /** The row's own staff id -- the assignee for a new (empty-cell) assignment, since the cell is anchored to that employee's row. */
  rowStaffId: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  onSuccess: () => void;
  onCancel: () => void;
}

/** Manual per-cell shift editing: assign into an empty cell, or reassign/edit-time an existing draft cell. Unassign stays a separate one-click action in the parent (unchanged from Slice 2A). */
export function ShiftCellEditor({
  locationId,
  workDate,
  existing,
  rowStaffId,
  staff,
  shiftTypes,
  onSuccess,
  onCancel,
}: ShiftCellEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentEmployeeId = existing?.assignment.employeeId ?? rowStaffId;
  const assignableStaff = staff.filter((s) => s.isActive || s.staffId === currentEmployeeId);
  const activeShiftTypes = shiftTypes.filter((st) => st.isActive);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set('locationId', locationId);
    formData.set('workDate', workDate);

    startTransition(async () => {
      let result;
      if (existing) {
        formData.set('assignmentId', existing.assignment.assignmentId);
        if (existing.assignment.role) formData.set('role', existing.assignment.role);
        if (existing.assignment.notes) formData.set('notes', existing.assignment.notes);
        if (existing.assignment.published) formData.set('published', 'true');
        result = await updateShiftAssignment(formData);
      } else {
        result = await createShiftAssignment(formData);
      }

      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(describeWriteError(result));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}

      {existing ? (
        <label>
          <span style={{ ...mutedText, fontSize: 12 }}>Employee</span>
          <select style={input} name="employeeId" defaultValue={currentEmployeeId}>
            {assignableStaff.map((s) => (
              <option key={s.staffId} value={s.staffId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="employeeId" value={rowStaffId} />
      )}

      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>Shift type</span>
        <select style={input} name="shiftTypeId" defaultValue={existing?.assignment.shiftTypeId ?? ''}>
          <option value="">Custom</option>
          {activeShiftTypes.map((st) => (
            <option key={st.shiftTypeId} value={st.shiftTypeId}>
              {st.code} ({st.startsAtLocal}-{st.endsAtLocal})
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 6 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>Start</span>
          <input style={input} type="time" name="startsAtLocal" defaultValue={existing?.startsAtLocal ?? '09:00'} required />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>End</span>
          <input style={input} type="time" name="endsAtLocal" defaultValue={existing?.endsAtLocal ?? '13:00'} required />
        </label>
      </div>

      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>Break (min)</span>
        <input
          style={input}
          type="number"
          name="breakMinutes"
          min={0}
          max={480}
          defaultValue={existing?.assignment.breakMinutes ?? 0}
        />
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? 'Saving...' : existing ? 'Save' : 'Assign'}
        </button>
        <button type="button" style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
