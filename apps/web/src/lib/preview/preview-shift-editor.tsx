'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { previewCreateShiftAssignment, previewUpdateShiftAssignment } from './actions/schedule-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, input as inputStyle, mutedText } from '@/lib/ui/theme';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager client island for shift
 * create/update/unassign. Calls only `previewCreateShiftAssignment`/
 * `previewUpdateShiftAssignment` (never the dashboard `schedule-actions.ts`).
 * `employeeId`/`shiftTypeId`/`assignmentId` are the only client-supplied
 * identifiers - all legitimate target-record ids, none an authority field.
 */
export interface PreviewShiftEditorProps {
  timeZone: string;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  defaultWorkDate: string;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '保存しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewShiftEditor({ timeZone, staff, shiftTypes, assignments, defaultWorkDate }: PreviewShiftEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const staffOptions = staff ?? [];
  const shiftTypeOptions = shiftTypes ?? [];
  const assignmentOptions = assignments ?? [];

  const editingAssignment = editingAssignmentId
    ? assignmentOptions.find((a) => a.assignmentId === editingAssignmentId) ?? null
    : null;
  const editingStart = editingAssignment ? utcIsoToLocalDateTime(editingAssignment.startsAt, timeZone) : null;
  const editingEnd = editingAssignment ? utcIsoToLocalDateTime(editingAssignment.endsAt, timeZone) : null;

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await previewCreateShiftAssignment(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  function handleUpdate(formData: FormData) {
    startTransition(async () => {
      const result = await previewUpdateShiftAssignment(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') {
        setEditingAssignmentId(null);
        router.refresh();
      }
    });
  }

  function handleUnassign(assignmentId: string, assignment: WorkforceShiftAssignment) {
    startTransition(async () => {
      const start = utcIsoToLocalDateTime(assignment.startsAt, timeZone);
      const end = utcIsoToLocalDateTime(assignment.endsAt, timeZone);
      const formData = new FormData();
      formData.set('assignmentId', assignmentId);
      formData.set('employeeId', '');
      formData.set('shiftTypeId', assignment.shiftTypeId ?? '');
      formData.set('workDate', start.workDate);
      formData.set('startsAtLocal', start.localTime);
      formData.set('endsAtLocal', end.localTime);
      formData.set('breakMinutes', String(assignment.breakMinutes));
      formData.set('role', assignment.role ?? '');
      formData.set('notes', assignment.notes ?? '');
      formData.set('published', assignment.published ? 'true' : 'false');
      const result = await previewUpdateShiftAssignment(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>シフトの追加</h2>
      <form action={handleCreate} style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 640 }}>
        <label>
          スタッフ
          <select style={inputStyle} name="employeeId" required defaultValue="">
            <option value="" disabled>
              選択してください
            </option>
            {staffOptions
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          シフト種別
          <select style={inputStyle} name="shiftTypeId" defaultValue="">
            <option value="">カスタム</option>
            {shiftTypeOptions.map((st) => (
              <option key={st.shiftTypeId} value={st.shiftTypeId}>
                {st.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          勤務日
          <input style={inputStyle} type="date" name="workDate" defaultValue={defaultWorkDate} required />
        </label>
        <label>
          休憩(分)
          <input style={inputStyle} type="number" name="breakMinutes" defaultValue={0} min={0} max={480} />
        </label>
        <label>
          開始時刻
          <input style={inputStyle} type="time" name="startsAtLocal" required />
        </label>
        <label>
          終了時刻
          <input style={inputStyle} type="time" name="endsAtLocal" required />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          役割
          <input style={inputStyle} name="role" maxLength={60} />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          メモ
          <input style={inputStyle} name="notes" maxLength={500} />
        </label>
        <div style={{ gridColumn: 'span 2' }}>
          <button type="submit" style={buttonPrimary} disabled={isPending}>
            シフトを追加
          </button>
        </div>
      </form>

      <h3 style={{ margin: '20px 0 0', fontSize: 14, ...mutedText }}>シフトの編集・解除</h3>
      {assignmentOptions.length === 0 ? (
        <p style={{ marginTop: 8, ...mutedText }}>今週のシフトはまだありません。</p>
      ) : (
        <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>日付</th>
              <th style={{ textAlign: 'left' }}>時刻</th>
              <th style={{ textAlign: 'left' }}>担当</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assignmentOptions.map((a) => {
              const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
              const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
              const employeeName = staffOptions.find((s) => s.staffId === a.employeeId)?.name ?? '(未割当)';
              return (
                <tr key={a.assignmentId}>
                  <td style={{ padding: '4px 0' }}>{start.workDate}</td>
                  <td style={{ padding: '4px 0' }}>
                    {start.localTime}-{end.localTime}
                  </td>
                  <td style={{ padding: '4px 0' }}>{employeeName}</td>
                  <td style={{ padding: '4px 0', display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      style={buttonSecondary}
                      onClick={() => setEditingAssignmentId(a.assignmentId)}
                      disabled={isPending}
                    >
                      編集
                    </button>
                    {a.employeeId ? (
                      <button type="button" style={buttonSecondary} onClick={() => handleUnassign(a.assignmentId, a)} disabled={isPending}>
                        解除
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editingAssignment && editingStart && editingEnd ? (
        <form action={handleUpdate} style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 640 }}>
          <input type="hidden" name="assignmentId" value={editingAssignment.assignmentId} />
          <label>
            スタッフ
            <select style={inputStyle} name="employeeId" defaultValue={editingAssignment.employeeId ?? ''}>
              <option value="">(未割当)</option>
              {staffOptions.map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            シフト種別
            <select style={inputStyle} name="shiftTypeId" defaultValue={editingAssignment.shiftTypeId ?? ''}>
              <option value="">カスタム</option>
              {shiftTypeOptions.map((st) => (
                <option key={st.shiftTypeId} value={st.shiftTypeId}>
                  {st.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            勤務日
            <input style={inputStyle} type="date" name="workDate" defaultValue={editingStart.workDate} required />
          </label>
          <label>
            休憩(分)
            <input style={inputStyle} type="number" name="breakMinutes" defaultValue={editingAssignment.breakMinutes} min={0} max={480} />
          </label>
          <label>
            開始時刻
            <input style={inputStyle} type="time" name="startsAtLocal" defaultValue={editingStart.localTime} required />
          </label>
          <label>
            終了時刻
            <input style={inputStyle} type="time" name="endsAtLocal" defaultValue={editingEnd.localTime} required />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            役割
            <input style={inputStyle} name="role" defaultValue={editingAssignment.role ?? ''} maxLength={60} />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            メモ
            <input style={inputStyle} name="notes" defaultValue={editingAssignment.notes ?? ''} maxLength={500} />
          </label>
          <label>
            <input type="checkbox" name="published" value="true" defaultChecked={editingAssignment.published} /> 公開済み
          </label>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8 }}>
            <button type="submit" style={buttonPrimary} disabled={isPending}>
              更新する
            </button>
            <button type="button" style={buttonSecondary} onClick={() => setEditingAssignmentId(null)} disabled={isPending}>
              キャンセル
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
