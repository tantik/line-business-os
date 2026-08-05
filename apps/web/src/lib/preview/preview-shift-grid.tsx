'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  /** Real computed staffing-shortage dates (`computeManagerShortageDateSet`), rendered as the shift table's "!" column indicator. */
  shortageDateSet?: Set<string>;
  /**
   * Reports every local assignment-list change (single-cell save/unassign)
   * back to the parent (`PreviewManagerViewChrome`), which owns the
   * currently-displayed week's data - so its own `hasUnpublishedChanges`
   * calculation (fed to `PreviewScheduleCardActions`) never drifts from what
   * this grid is actually showing. Preview Manager architecture, perf
   * phase 2 - no `router.refresh()` involved on either side.
   */
  onAssignmentsChanged?: (next: WorkforceShiftAssignment[]) => void;
}

export function PreviewShiftGrid({ dates, todayIso, timeZone, staff, shiftTypes, assignments, monthlySummaries, shortageDateSet, onAssignmentsChanged }: PreviewShiftGridProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isSaving, setIsSaving] = useState(false);
  const [localAssignments, setLocalAssignments] = useState(assignments);
  const [selected, setSelected] = useState<{ staffId: string; date: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [summaryStaffId, setSummaryStaffId] = useState<string | null>(null);
  useEffect(() => {
    setLocalAssignments(assignments);
  }, [assignments]);

  const assignment = useMemo(
    () =>
      selected
        ? localAssignments.find((item) => {
            if (item.employeeId !== selected.staffId) return false;
            return utcIsoToLocalDateTime(item.startsAt, timeZone).workDate === selected.date;
          }) ?? null
        : null,
    [localAssignments, selected, timeZone],
  );
  const existingStart = assignment ? utcIsoToLocalDateTime(assignment.startsAt, timeZone) : null;
  const existingEnd = assignment ? utcIsoToLocalDateTime(assignment.endsAt, timeZone) : null;
  const selectedStaff = selected ? staff.find((item) => item.staffId === selected.staffId) : null;
  const summaryStaff = summaryStaffId ? staff.find((item) => item.staffId === summaryStaffId) ?? null : null;
  const summary = summaryStaffId ? monthlySummaries[summaryStaffId] : null;
  const visibleShiftTypes = useMemo(
    () =>
      shiftTypes.filter(
        (item) =>
          item.isActive ||
          localAssignments.some(
            (assignmentItem) => assignmentItem.employeeId && assignmentItem.shiftTypeId === item.shiftTypeId,
          ),
      ),
    [shiftTypes, localAssignments],
  );
  const selectableShiftTypes = shiftTypes.filter(
    (item) => item.isActive || item.shiftTypeId === assignment?.shiftTypeId,
  );

  // Stable references so the memoized `ShiftTable` below actually skips
  // re-rendering the whole grid when only unrelated state here changes
  // (isSaving/feedback/selected/summaryStaffId) -- these three used to be
  // freshly-mapped arrays on every render regardless of whether the
  // underlying data changed.
  const shiftTableStaff = useMemo(() => toManagerViewStaff(staff), [staff]);
  const shiftTableAssignments = useMemo(
    () => toManagerViewAssignments(localAssignments, timeZone),
    [localAssignments, timeZone],
  );
  const shiftTableShiftTypes = useMemo(() => toManagerViewShiftTypes(visibleShiftTypes), [visibleShiftTypes]);
  const handleCellClick = useCallback((staffId: string, date: string) => {
    setFeedback(null);
    setSelected({ staffId, date });
  }, []);

  function save(formData: FormData) {
    if (!selected) return;
    formData.set('employeeId', selected.staffId);
    formData.set('workDate', selected.date);
    if (assignment) {
      formData.set('assignmentId', assignment.assignmentId);
      formData.set('published', assignment.published ? 'true' : 'false');
    }
    setFeedback(null);
    setIsSaving(true);
    void (async () => {
      const result = assignment
        ? await previewUpdateShiftAssignment(formData)
        : await previewCreateShiftAssignment(formData);
      if (result.status === 'success') {
        const next = [...localAssignments.filter((item) => item.assignmentId !== result.data.assignmentId), result.data];
        setLocalAssignments(next);
        onAssignmentsChanged?.(next);
        setSelected(null);
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
      setIsSaving(false);
    })();
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
    setIsSaving(true);
    void (async () => {
      const result = await previewUpdateShiftAssignment(formData);
      if (result.status === 'success') {
        const next = localAssignments.filter((item) => item.assignmentId !== result.data.assignmentId);
        setLocalAssignments(next);
        onAssignmentsChanged?.(next);
        setSelected(null);
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
      }
      setIsSaving(false);
    })();
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
        staffList={shiftTableStaff}
        assignments={shiftTableAssignments}
        shiftTypes={shiftTableShiftTypes}
        mode="manager"
        lang={lang}
        shortageDateSet={shortageDateSet}
        onCellClick={handleCellClick}
        onStaffClick={setSummaryStaffId}
      />
      <Modal open={Boolean(summaryStaff && summary)} onClose={() => setSummaryStaffId(null)} title={summaryStaff?.name ?? ''} maxWidth={360}>
        {summaryStaff && summary ? (
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 14px', margin: '12px 0 0', fontSize: 13 }}>
            <dt>{lang === 'ja' ? '実働時間' : 'Worked'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.workedHours.toFixed(1)} h</dd>
            <dt>{lang === 'ja' ? '時給' : 'Hourly'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.hourlyWageYen === null ? '—' : `¥${summary.hourlyWageYen.toLocaleString('ja-JP')}`}</dd>
            <dt>{lang === 'ja' ? '概算給与' : 'Estimated'}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{summary.estimatedEarningsYen === null ? '—' : `¥${summary.estimatedEarningsYen.toLocaleString('ja-JP')}`}</dd>
            <dt>{lang === 'ja' ? '役職' : 'Position'}</dt><dd style={{ margin: 0 }}>{summaryStaff.positionLabel || '—'}</dd>
            <dt>{lang === 'ja' ? '状態' : 'Status'}</dt><dd style={{ margin: 0 }}>{summaryStaff.isActive ? (lang === 'ja' ? '有効' : 'Active') : (lang === 'ja' ? '無効' : 'Inactive')}</dd>
          </dl>
        ) : null}
      </Modal>

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
                <button type="button" style={buttonSecondary} onClick={clearAssignment} disabled={isSaving}>
                  {t('unassignShift')}
                </button>
              ) : null}
              <button type="button" style={buttonSecondary} onClick={() => setSelected(null)} disabled={isSaving}>
                {t('cancel')}
              </button>
              <button type="submit" style={buttonPrimary} disabled={isSaving || shiftTypes.length === 0}>
                {isSaving ? (lang === 'ja' ? '保存中…' : 'Saving…') : t('save')}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
