'use client';

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import { createShiftAssignment, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
import { decideCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { alertDanger, buttonDisabled, buttonPrimary, buttonSecondary, colors, input, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { useLang } from '@/lib/demo/cafe/i18n';
import { ConfirmDialog, Modal } from '@/components/shared/design-kit';
import { correctionStatusLabel, formatRequestedCorrectionChange } from '../_ui/workforce-theme';
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

const smallButton = { padding: '4px 10px', fontSize: 12, minHeight: 0 } as const;

const noticeStyle = {
  border: `1px solid ${colors.warning}`,
  background: 'rgba(184, 134, 59, 0.12)',
  color: colors.textPrimary,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12.5,
} as const;

export interface ShiftCellEditorProps {
  locationId: string;
  workDate: string;
  /** Today's date (location-local, `YYYY-MM-DD`) -- distinguishes a past-schedule correction from an ordinary future/today edit (Weekly Schedule Founder Review Round 2, 2026-08-22, section 4/6/8: Schedule is planned/operational, not a record of what happened -- correcting a past *plan* is a deliberate, contextualized action, never silently identical to assigning a future shift). */
  todayIso: string;
  /** Present when editing an existing assignment; absent when assigning a new one into an empty cell. */
  existing?: {
    assignment: WorkforceShiftAssignment;
    startsAtLocal: string;
    endsAtLocal: string;
  };
  /** The row's own staff id -- the assignee for a new (empty-cell) assignment, since the cell is anchored to that employee's row. */
  rowStaffId: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  /** Already-resolved explanation of why this cell is flagged in the grid (a schedule conflict or a pending correction request), if any -- section 18: opening a flagged shift must explain the problem right here, not just show a small "!" in the grid. `undefined` for a cell with no flag. */
  problemNotice?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Manual per-cell shift editing: assign into an empty cell, or reassign/
 * edit-time an existing cell. Pure form -- rendering it inside a Modal
 * (`ShiftCellEditorModal` below) and handling Remove-shift are the caller's
 * job (WP A6).
 *
 * Founder Review Round 2 (2026-08-22): Draft/Published is no longer a
 * concept Manager UX exposes at all (every manual save publishes
 * immediately, see `schedule-actions.ts`) -- what replaced the old
 * "editing a published shift" confirmation is framed around the shift's
 * actual *date* instead:
 * - Editing an EXISTING future/today assignment, when a field actually
 *   changed, confirms first ("this is already visible to the employee") --
 *   section 28. A brand-new assignment, or a Save with no real change,
 *   never shows this.
 * - Editing anything dated in the past (existing or empty) shows a quiet
 *   inline notice instead ("Correcting past schedule") -- section 6/8. No
 *   extra confirmation step; the notice itself is the friction.
 * Employee is read-only context for an existing assignment (its Modal
 * title already shows who/when) -- reassigning to someone else is a
 * separate, deliberate secondary action (section 9/10), not a plain
 * always-editable dropdown.
 */
export function ShiftCellEditor({
  locationId,
  workDate,
  todayIso,
  existing,
  rowStaffId,
  staff,
  shiftTypes,
  problemNotice,
  onSuccess,
  onCancel,
}: ShiftCellEditorProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pendingChangeConfirm, setPendingChangeConfirm] = useState<{ formData: FormData; fromLabel: string; toLabel: string } | null>(null);
  const [shiftTypeId, setShiftTypeId] = useState(existing?.assignment.shiftTypeId ?? '');
  const [startsAtLocal, setStartsAtLocal] = useState(existing?.startsAtLocal ?? '09:00');
  const [endsAtLocal, setEndsAtLocal] = useState(existing?.endsAtLocal ?? '13:00');

  const isPast = workDate < todayIso;
  const currentEmployeeId = existing?.assignment.employeeId ?? rowStaffId;
  const currentEmployeeName = staff.find((s) => s.staffId === currentEmployeeId)?.name ?? currentEmployeeId;
  const assignableStaff = staff.filter((s) => s.isActive || s.staffId === currentEmployeeId);
  const activeShiftTypes = shiftTypes.filter((st) => st.isActive);

  /**
   * Round 3 (2026-08-22): picking a named shift type used to leave the
   * Start/End time inputs at whatever they already showed -- a manager could
   * pick "Morning (09:00-13:00)" and still submit the previous shift's
   * times. Selecting a real type now fills its own times in; switching to
   * "Custom" leaves whatever times are currently entered untouched (there's
   * no type-specific time to fall back to).
   */
  function handleShiftTypeChange(value: string) {
    setShiftTypeId(value);
    if (!value) return;
    const st = activeShiftTypes.find((candidate) => candidate.shiftTypeId === value);
    if (st) {
      setStartsAtLocal(st.startsAtLocal);
      setEndsAtLocal(st.endsAtLocal);
    }
  }

  function doSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = existing ? await updateShiftAssignment(formData) : await createShiftAssignment(formData);
      if (result.status === 'success') {
        onSuccess();
      } else {
        setError(localizedEditorError(result, t));
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set('locationId', locationId);
    formData.set('workDate', workDate);

    if (existing) {
      formData.set('assignmentId', existing.assignment.assignmentId);
      if (existing.assignment.role) formData.set('role', existing.assignment.role);
      if (existing.assignment.notes) formData.set('notes', existing.assignment.notes);
    }

    const afterStart = String(formData.get('startsAtLocal') ?? '');
    const afterEnd = String(formData.get('endsAtLocal') ?? '');
    const afterShiftTypeId = String(formData.get('shiftTypeId') ?? '');
    const afterEmployeeId = String(formData.get('employeeId') ?? '');

    const changed =
      Boolean(existing) &&
      (afterShiftTypeId !== (existing!.assignment.shiftTypeId ?? '') ||
        afterStart !== existing!.startsAtLocal ||
        afterEnd !== existing!.endsAtLocal ||
        afterEmployeeId !== (existing!.assignment.employeeId ?? ''));

    if (existing && !isPast && changed) {
      setPendingChangeConfirm({
        formData,
        fromLabel: `${existing.startsAtLocal}-${existing.endsAtLocal}`,
        toLabel: `${afterStart}-${afterEnd}`,
      });
      return;
    }
    doSubmit(formData);
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
        {problemNotice ? <div style={alertDanger}>{problemNotice}</div> : null}
        {isPast ? <div style={noticeStyle}>{t('correctingPastScheduleNotice')}</div> : null}
        {error ? <div style={alertDanger}>{error}</div> : null}

        {existing ? (
          reassignOpen ? (
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
            <>
              <input type="hidden" name="employeeId" value={currentEmployeeId} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{currentEmployeeName}</span>
                <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, ...smallButton }} onClick={() => setReassignOpen(true)}>
                  {t('reassignEmployeeButton')}
                </button>
              </div>
            </>
          )
        ) : (
          <input type="hidden" name="employeeId" value={rowStaffId} />
        )}

        <label>
          <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldShiftType')}</span>
          <select style={input} name="shiftTypeId" value={shiftTypeId} onChange={(event) => handleShiftTypeChange(event.currentTarget.value)}>
            <option value="">{t('shiftTypeCustom')}</option>
            {activeShiftTypes.map((st) => (
              <option key={st.shiftTypeId} value={st.shiftTypeId}>
                {shiftTypeDisplayLabel(st)} ({st.startsAtLocal}-{st.endsAtLocal})
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ flex: 1 }}>
            <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldStart')}</span>
            <input style={input} type="time" name="startsAtLocal" value={startsAtLocal} onChange={(event) => setStartsAtLocal(event.currentTarget.value)} required />
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ ...mutedText, fontSize: 12 }}>{t('fieldEnd')}</span>
            <input style={input} type="time" name="endsAtLocal" value={endsAtLocal} onChange={(event) => setEndsAtLocal(event.currentTarget.value)} required />
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

      <ConfirmDialog
        open={pendingChangeConfirm !== null}
        title={t('confirmChangeScheduledShiftTitle')}
        confirmLabel={t('save')}
        cancelLabel={t('cancel')}
        pending={isPending}
        onCancel={() => setPendingChangeConfirm(null)}
        onConfirm={() => {
          const staged = pendingChangeConfirm;
          setPendingChangeConfirm(null);
          if (staged) doSubmit(staged.formData);
        }}
      >
        <p style={{ margin: '0 0 8px' }}>{t('shiftAlreadyVisibleNotice')}</p>
        {pendingChangeConfirm ? (
          <p style={{ margin: 0, fontWeight: 600 }}>
            {pendingChangeConfirm.fromLabel} &rarr; {pendingChangeConfirm.toLabel}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

export interface ShiftCellEditorModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  locationId: string;
  workDate: string;
  todayIso: string;
  existing?: ShiftCellEditorProps['existing'];
  rowStaffId: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  problemNotice?: string;
  /**
   * Round 3 (2026-08-22): a pending, past-dated correction request for this
   * exact cell -- when present, the Modal renders a dedicated "Requested
   * change" + Approve/Reject block (below Remove shift) instead of a plain
   * text notice, so a manager can resolve the correction from the same
   * place they're already looking at the shift. `undefined`/`null` for a
   * cell with no pending correction.
   */
  correctionRequest?: WorkforceShiftRequest | null;
  /** Called after a successful Approve/Reject so the parent can refresh its own correction-count/attention state. Does not close the Modal -- the resolved decision stays visible, greyed out, in the same block. */
  onCorrectionDecided?: () => void;
  /** `'saved'` covers both assign and edit -- the parent shows no banner for either today (matches the pre-A6 inline-editor behavior, which only ever banner'd Remove-shift). `'removed'` gets the parent's existing "shift removed" banner. */
  onSuccess: (kind: 'saved' | 'removed') => void;
}

/**
 * WP A6: the Shift-schedule grid's cell opens this Modal. Remove-shift lives
 * here too (from an always-visible per-cell button) behind a `ConfirmDialog`,
 * using the exact same `updateShiftAssignment(employeeId: '')` call the old
 * per-cell button made -- no new server action. Focus-restore and Escape are
 * both handled by `Modal`/`ConfirmDialog` themselves; this component no
 * longer needs its own ref-map or keydown listener.
 *
 * Founder Review Round 2 (2026-08-22): Remove-shift is available for any
 * existing assignment now, not just an unpublished draft (Draft/Published
 * no longer gates anything in Manager UX) -- the same `Correcting past
 * schedule` notice `ShiftCellEditor` renders above the form already covers
 * "this is a historical correction" context for a past-dated remove too,
 * since it renders above this button inside the same Modal.
 */
export function ShiftCellEditorModal({
  open,
  onClose,
  title,
  locationId,
  workDate,
  todayIso,
  existing,
  rowStaffId,
  staff,
  shiftTypes,
  problemNotice,
  correctionRequest,
  onCorrectionDecided,
  onSuccess,
}: ShiftCellEditorModalProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isRemovePending, startRemoveTransition] = useTransition();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [correctionDecision, setCorrectionDecision] = useState<ShiftRequestDecision | null>(null);
  const [isDecidePending, startDecideTransition] = useTransition();
  const [decideError, setDecideError] = useState<string | null>(null);

  function handleDecideCorrection(decision: ShiftRequestDecision) {
    if (!correctionRequest) return;
    setDecideError(null);
    startDecideTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', correctionRequest.requestId);
      formData.set('decision', decision);
      const result = await decideCorrectionRequest(formData);
      if (result.status === 'success') {
        setCorrectionDecision(decision);
        onCorrectionDecided?.();
      } else {
        setDecideError(localizedEditorError(result, t));
      }
    });
  }

  function handleRemoveConfirmed() {
    if (!existing) return;
    setRemoveError(null);
    startRemoveTransition(async () => {
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

      const result = await updateShiftAssignment(formData);
      if (result.status === 'success') {
        setConfirmRemoveOpen(false);
        onSuccess('removed');
      } else {
        setRemoveError(localizedEditorError(result, t));
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={title} closeLabel={t('cancel')}>
      <ShiftCellEditor
        locationId={locationId}
        workDate={workDate}
        todayIso={todayIso}
        existing={existing}
        rowStaffId={rowStaffId}
        staff={staff}
        shiftTypes={shiftTypes}
        problemNotice={problemNotice}
        onSuccess={() => onSuccess('saved')}
        onCancel={onClose}
      />

      {existing ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
          {removeError ? <div style={alertDanger}>{removeError}</div> : null}
          <button
            type="button"
            className={hoverStyles.buttonSecondary}
            style={isRemovePending ? buttonDisabled : buttonSecondary}
            disabled={isRemovePending}
            onClick={() => setConfirmRemoveOpen(true)}
          >
            {isRemovePending ? t('unassigning') : t('unassign')}
          </button>
        </div>
      ) : null}

      {correctionRequest ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ ...mutedText, fontSize: 12, marginBottom: 4 }}>{t('colRequested')}</div>
          <div style={{ fontSize: 14, marginBottom: 10 }}>{formatRequestedCorrectionChange(correctionRequest.details, lang)}</div>
          {decideError ? <div style={alertDanger}>{decideError}</div> : null}
          {correctionDecision ? (
            <span style={{ ...mutedText, fontSize: 13 }}>{correctionStatusLabel(correctionDecision, lang)}</span>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={hoverStyles.buttonPrimary}
                style={isDecidePending ? buttonDisabled : buttonPrimary}
                disabled={isDecidePending}
                onClick={() => handleDecideCorrection('approved')}
              >
                {t('approve')}
              </button>
              <button
                type="button"
                className={hoverStyles.buttonSecondary}
                style={isDecidePending ? buttonDisabled : buttonSecondary}
                disabled={isDecidePending}
                onClick={() => handleDecideCorrection('rejected')}
              >
                {t('reject')}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemoveOpen}
        title={t('unassign')}
        confirmLabel={t('unassign')}
        cancelLabel={t('cancel')}
        pending={isRemovePending}
        danger
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setConfirmRemoveOpen(false)}
      >
        {t('confirmUnassignShift')}
      </ConfirmDialog>
    </Modal>
  );
}
