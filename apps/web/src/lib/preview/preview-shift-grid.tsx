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
import type { EstimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';

interface PreviewShiftGridProps {
  dates: string[];
  todayIso: string;
  timeZone: string;
  staff: WorkforceStaffManageEntry[];
  shiftTypes: WorkforceShiftType[];
  assignments: WorkforceShiftAssignment[];
  monthlySummaries: Record<string, EstimatedEarningsSummary>;
}

export function PreviewShiftGrid({ dates, todayIso, timeZone, staff, shiftTypes, assignments, monthlySummaries }: PreviewShiftGridProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<{ staffId: string; date: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [summaryStaffId, setSummaryStaffId] = useState<string | null>(null);
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
  const summaryStaff = summaryStaffId ? staff.find((item) => item.staffId === summaryStaffId) ?? null : null;
  const summary = summaryStaffId ? monthlySummaries[summaryStaffId] : null;
  const visibleShiftTypes = shiftTypes.filter(
    (item) =>
      item.isActive ||
      assignments.some(
        (assignmentItem) => assignmentItem.employeeId && assignmentItem.shiftTypeId === item.shiftTypeId,
      ),
  );
  const selectableShiftTypes = shiftTypes.filter(
    (item) => item.isActive || item.shiftTypeId === assignment?.shiftTypeId,
  );

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

  const defaultType =
    selectableShiftTypes.find((item) => item.shiftTypeId === assignment?.shiftTypeId) ??
    selectableShiftTypes.find((item) => item.isActive) ??
    null;

  return (
    <>
      <ShiftTable
        dates={dates}
        todayIso={todayIso}
        staffList={toManagerViewStaff(staff)}
        assignments={toManagerViewAssignments(assignments, timeZone)}
        shiftTypes={toManagerViewShiftTypes(visibleShiftTypes)}
        mode="manager"
        lang={lang}
        onCellClick={(staffId, date) => {
          setFeedback(null);
          setSelected({ staffId, date });
        }}
        onStaffClick={setSummaryStaffId}
      />

      {summaryStaff && summary ? (
        <div role="dialog" aria-label={summaryStaff.name} style={{ marginTop: 8, marginLeft: 8, maxWidth: 320, padding: 14, borderRadius: 10, border: `1px solid ${demoColors.border}`, background: demoColors.surface, boxShadow: '0 10px 28px rgba(54,43,31,.16)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <strong>{summaryStaff.name}</strong>
            <button type="button" onClick={() => setSummaryStaffId(null)} style={{ border: 0, background: 'transparent', cursor: 'pointer' }} aria-label={t('cancel')}>×</button>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 14px', margin: '12px 0 0', fontSize: 13 }}>
            <dt>{lang === 'ja' ? '実働時間' : 'Worked'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.workedHours.toFixed(1)} h</dd>
            <dt>{lang === 'ja' ? '時給' : 'Hourly'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.hourlyWageYen === null ? '—' : `¥${summary.hourlyWageYen.toLocaleString('ja-JP')}`}</dd>
            <dt>{lang === 'ja' ? '概算給与' : 'Estimated'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.estimatedEarningsYen === null ? '—' : `¥${summary.estimatedEarningsYen.toLocaleString('ja-JP')}`}</dd>
            <dt>{lang === 'ja' ? '役職' : 'Position'}</dt><dd style={{ margin: 0 }}>{summaryStaff.positionLabel || '—'}</dd>
            <dt>{lang === 'ja' ? '状態' : 'Status'}</dt><dd style={{ margin: 0 }}>{summaryStaff.isActive ? (lang === 'ja' ? '有効' : 'Active') : (lang === 'ja' ? '無効' : 'Inactive')}</dd>
          </dl>
        </div>
      ) : null}

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
                  const option = selectableShiftTypes.find((item) => item.shiftTypeId === event.currentTarget.value);
                  const form = event.currentTarget.form;
                  if (option && form) {
                    (form.elements.namedItem('startsAtLocal') as HTMLInputElement).value = option.startsAtLocal;
                    (form.elements.namedItem('endsAtLocal') as HTMLInputElement).value = option.endsAtLocal;
                    (form.elements.namedItem('breakMinutes') as HTMLInputElement).value = String(option.breakMinutes);
                  }
                }}
              >
                {selectableShiftTypes.map((item) => (
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
