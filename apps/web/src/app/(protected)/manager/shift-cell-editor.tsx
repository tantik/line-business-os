'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { createShiftAssignment, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { useLang } from '@/lib/demo/cafe/i18n';
import { Modal, ConfirmDialog } from '@/components/shared/design-kit';
import { describeWriteError } from './error-copy';
import { tManagerDashboard } from './manager-dashboard-i18n';

/** Localizes the subset of `WorkforceWriteResult` statuses this editor can actually receive; falls back to the shared (English) copy for statuses its own actions never return. */
function localizedEditorError(result: Parameters<typeof describeWriteError>[0], t: (key: Parameters<typeof tManagerDashboard>[1]) => string) {
  switch (result.status) {
    case 'not_found':
      return t('errorNotFound');
    case 'not_authenticated':
      return t('errorNotAuthenticated');
    case 'no_membership':
      return t('errorNoMembership');
    case 'stale_reference':
      return t('errorStaleReference');
    default:
      return describeWriteError(result);
  }
}

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

/**
 * Manual per-cell shift editing: assign into an empty cell, or reassign/
 * edit-time an existing draft cell. Pure form -- rendering it inside a Modal
 * (`ShiftCellEditorModal` below) and handling Unassign are the caller's job
 * (WP A6; Unassign moved out of the always-visible per-cell button into this
 * popup, see `ShiftCellEditorModal`).
 */
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
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
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
        setError(localizedEditorError(result, t));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
      {error ? <div style={alertDanger}>{error}</div> : null}

      {existing ? (
        <label>
          <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldEmployee')}</span>
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
        <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldShiftType')}</span>
        <select style={input} name="shiftTypeId" defaultValue={existing?.assignment.shiftTypeId ?? ''}>
          <option value="">{t('shiftTypeCustom')}</option>
          {activeShiftTypes.map((st) => (
            <option key={st.shiftTypeId} value={st.shiftTypeId}>
              {st.code} ({st.startsAtLocal}-{st.endsAtLocal})
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 6 }}>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldStart')}</span>
          <input style={input} type="time" name="startsAtLocal" defaultValue={existing?.startsAtLocal ?? '09:00'} required />
        </label>
        <label style={{ flex: 1 }}>
          <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldEnd')}</span>
          <input style={input} type="time" name="endsAtLocal" defaultValue={existing?.endsAtLocal ?? '13:00'} required />
        </label>
      </div>

      <label>
        <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldBreakMinutes')}</span>
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
        <button type="submit" className={hoverStyles.buttonPrimary} style={isPending ? buttonDisabled : buttonPrimary} disabled={isPending}>
          {isPending ? t('saving') : existing ? t('save') : t('assign')}
        </button>
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={onCancel} disabled={isPending}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}

export interface ShiftCellEditorModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  locationId: string;
  workDate: string;
  existing?: ShiftCellEditorProps['existing'];
  rowStaffId: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  /** `'saved'` covers both assign and edit -- the parent shows no banner for either today (matches the pre-A6 inline-editor behavior, which only ever banner'd Unassign). `'unassigned'` gets the parent's existing "shift unassigned" banner. */
  onSuccess: (kind: 'saved' | 'unassigned') => void;
}

/**
 * WP A6: the Shift-schedule grid's Assign/Edit button now opens this Modal
 * instead of swapping the cell's own content inline. Unassign moved here too
 * (from an always-visible per-cell button) behind a `ConfirmDialog`, using
 * the exact same `updateShiftAssignment(employeeId: '')` call the old
 * per-cell button made -- no new server action. Focus-restore and Escape are
 * both handled by `Modal`/`ConfirmDialog` themselves; this component no
 * longer needs its own ref-map or keydown listener.
 */
export function ShiftCellEditorModal({
  open,
  onClose,
  title,
  locationId,
  workDate,
  existing,
  rowStaffId,
  staff,
  shiftTypes,
  onSuccess,
}: ShiftCellEditorModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isUnassignPending, startUnassignTransition] = useTransition();
  const [confirmUnassignOpen, setConfirmUnassignOpen] = useState(false);
  const [unassignError, setUnassignError] = useState<string | null>(null);

  function handleUnassignConfirmed() {
    if (!existing) return;
    setUnassignError(null);
    startUnassignTransition(async () => {
      const formData = new FormData();
      formData.set('assignmentId', existing.assignment.assignmentId);
      formData.set('locationId', locationId);
      formData.set('employeeId', '');
      if (existing.assignment.shiftTypeId) formData.set('shiftTypeId', existing.assignment.shiftTypeId);
      formData.set('workDate', workDate);
      formData.set('startsAtLocal', existing.startsAtLocal);
      formData.set('endsAtLocal', existing.endsAtLocal);
      formData.set('breakMinutes', String(existing.assignment.breakMinutes));
      if (existing.assignment.role) formData.set('role', existing.assignment.role);
      if (existing.assignment.notes) formData.set('notes', existing.assignment.notes);
      if (existing.assignment.published) formData.set('published', 'true');

      const result = await updateShiftAssignment(formData);
      if (result.status === 'success') {
        setConfirmUnassignOpen(false);
        onSuccess('unassigned');
      } else {
        setUnassignError(localizedEditorError(result, t));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={title} closeLabel={t('cancel')}>
      <ShiftCellEditor
        locationId={locationId}
        workDate={workDate}
        existing={existing}
        rowStaffId={rowStaffId}
        staff={staff}
        shiftTypes={shiftTypes}
        onSuccess={() => onSuccess('saved')}
        onCancel={onClose}
      />

      {existing && !existing.assignment.published ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
          {unassignError ? <div style={alertDanger}>{unassignError}</div> : null}
          <button
            type="button"
            className={hoverStyles.buttonSecondary}
            style={isUnassignPending ? buttonDisabled : buttonSecondary}
            disabled={isUnassignPending}
            onClick={() => setConfirmUnassignOpen(true)}
          >
            {isUnassignPending ? t('unassigning') : t('unassign')}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmUnassignOpen}
        title={t('unassign')}
        confirmLabel={t('unassign')}
        cancelLabel={t('cancel')}
        pending={isUnassignPending}
        danger
        onConfirm={handleUnassignConfirmed}
        onCancel={() => setConfirmUnassignOpen(false)}
      >
        {t('confirmUnassignShift')}
      </ConfirmDialog>
    </Modal>
  );
}
