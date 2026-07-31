'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { Modal } from '@/components/demo/cafe/Modal';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { buttonPrimary, buttonSecondary, demoColors, input } from '@/lib/demo/cafe/theme';
import { previewCreateShiftAssignment, previewUpdateShiftAssignment } from './actions/schedule-actions';
import { previewWriteMessage } from './write-result';
import { toManagerViewAssignments, toManagerViewShiftTypes, toManagerViewStaff } from './manager-view-model';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

interface PreviewShiftGridProps {
  dates: string[];
  todayIso: string;
  timeZone: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  assignments: WorkforceShiftAssignment[];
}

export function PreviewShiftGrid({ dates, todayIso, timeZone, staff, shiftTypes, assignments }: PreviewShiftGridProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<{ staffId: string; date: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const assignment = useMemo(
    () =>
      selected
        ? assignments.find((item) => {
            if (item.employeeId !== selected.staffId) return false;
            return utcIsoToLocalDateTime(item.startsAt, timeZone).workDate === selected.date;
          }) ?? null
        : null,
    [assignments, selected, timeZone],
  );
  const existingStart = assignment ? utcIsoToLocalDateTime(assignment.startsAt, timeZone) : null;
  const existingEnd = assignment ? utcIsoToLocalDateTime(assignment.endsAt, timeZone) : null;
  const selectedStaff = selected ? staff.find((item) => item.staffId === selected.staffId) : null;

  function save(formData: FormData) {
    if (!selected) return;
    formData.set('employeeId', selected.staffId);
    formData.set('workDate', selected.date);
    if (assignment) {
      formData.set('assignmentId', assignment.assignmentId);
      formData.set('published', assignment.published ? 'true' : 'false');
    }
    setFeedback(null);
    startTransition(async () => {
      const result = assignment
        ? await previewUpdateShiftAssignment(formData)
        : await previewCreateShiftAssignment(formData);
      if (result.status === 'success') {
        setSelected(null);
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  function clearAssignment() {
    if (!assignment || !existingStart || !existingEnd) return;
    const formData = new FormData();
    formData.set('assignmentId', assignment.assignmentId);
    formData.set('employeeId', '');
    formData.set('shiftTypeId', assignment.shiftTypeId ?? '');
    formData.set('workDate', existingStart.workDate);
    formData.set('startsAtLocal', existingStart.localTime);
    formData.set('endsAtLocal', existingEnd.localTime);
    formData.set('breakMinutes', String(assignment.breakMinutes));
    formData.set('role', assignment.role ?? '');
    formData.set('notes', assignment.notes ?? '');
    formData.set('published', assignment.published ? 'true' : 'false');
    startTransition(async () => {
      const result = await previewUpdateShiftAssignment(formData);
      if (result.status === 'success') {
        setSelected(null);
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
    });
  }

  const defaultType = shiftTypes.find((item) => item.shiftTypeId === assignment?.shiftTypeId) ?? shiftTypes[0] ?? null;

  return (
    <>
      <ShiftTable
        dates={dates}
        todayIso={todayIso}
        staffList={toManagerViewStaff(staff)}
        assignments={toManagerViewAssignments(assignments, timeZone)}
        shiftTypes={toManagerViewShiftTypes(shiftTypes)}
        mode="manager"
        lang={lang}
        onCellClick={(staffId, date) => {
          setFeedback(null);
          setSelected({ staffId, date });
        }}
      />

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          lang === 'ja'
            ? `${selectedStaff?.name ?? t('shiftModalTitleFallback')}・${selected?.date ?? ''} のシフト`
            : `${selectedStaff?.name ?? t('shiftModalTitleFallback')} · Shift on ${selected?.date ?? ''}`
        }
        maxWidth={480}
      >
        {selected ? (
          <form action={save} style={{ display: 'grid', gap: 12 }}>
            <label>
              {t('shiftTypeLabel')}
              <select
                style={input}
                name="shiftTypeId"
                defaultValue={assignment?.shiftTypeId ?? defaultType?.shiftTypeId ?? ''}
                onChange={(event) => {
                  const option = shiftTypes.find((item) => item.shiftTypeId === event.currentTarget.value);
                  const form = event.currentTarget.form;
                  if (option && form) {
                    (form.elements.namedItem('startsAtLocal') as HTMLInputElement).value = option.startsAtLocal;
                    (form.elements.namedItem('endsAtLocal') as HTMLInputElement).value = option.endsAtLocal;
                    (form.elements.namedItem('breakMinutes') as HTMLInputElement).value = String(option.breakMinutes);
                  }
                }}
              >
                {shiftTypes.map((item) => (
                  <option key={item.shiftTypeId} value={item.shiftTypeId}>
                    {item.labelJa || item.labelEn || item.code}（{item.startsAtLocal}–{item.endsAtLocal}）
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                {t('startTimeLabel')}
                <input style={input} type="time" name="startsAtLocal" required defaultValue={existingStart?.localTime ?? defaultType?.startsAtLocal ?? ''} />
              </label>
              <label>
                {t('endTimeLabel')}
                <input style={input} type="time" name="endsAtLocal" required defaultValue={existingEnd?.localTime ?? defaultType?.endsAtLocal ?? ''} />
              </label>
            </div>
            <label>
              {t('breakMinutesLabel')}
              <input style={input} type="number" name="breakMinutes" min={0} max={480} defaultValue={assignment?.breakMinutes ?? defaultType?.breakMinutes ?? 0} />
            </label>
            <input type="hidden" name="role" value={assignment?.role ?? 'staff'} />
            <input type="hidden" name="notes" value={assignment?.notes ?? ''} />
            {feedback ? <p style={{ margin: 0, color: demoColors.dangerText }}>{feedback}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {assignment ? (
                <button type="button" style={buttonSecondary} onClick={clearAssignment} disabled={isPending}>
                  {t('unassignShift')}
                </button>
              ) : null}
              <button type="button" style={buttonSecondary} onClick={() => setSelected(null)} disabled={isPending}>
                {t('cancel')}
              </button>
              <button type="submit" style={buttonPrimary} disabled={isPending || shiftTypes.length === 0}>
                {t('save')}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
