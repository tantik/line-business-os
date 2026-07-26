'use client';

import { useState } from 'react';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewShiftEditor } from './preview-shift-editor';
import { PreviewScheduleActions } from './preview-schedule-actions';
import { UNKNOWN_STAFF_NAME_JA } from './manager-view-model';
import { buttonPrimary, buttonSecondary, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';

/**
 * Demo/Preview manager UX parity: the demo's シフト表 card keeps its
 * auto-schedule/publish/manual-edit actions as header buttons that open a
 * dialog, never as permanently-open forms taking up main-dashboard space.
 * Wraps the existing `PreviewShiftEditor`/`PreviewScheduleActions` islands
 * (unchanged, still calling only their allowlisted preview Server Actions)
 * in the same dialog pattern. Also surfaces the week's submitted shift
 * preferences as read-only reference inside the shift-edit dialog, since
 * that is exactly the moment a manager needs them.
 */
export interface PreviewScheduleCardActionsProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  staff: WorkforceStaffManageEntry[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  requests: WorkforceShiftRequest[] | null;
}

export function PreviewScheduleCardActions({
  timeZone,
  periodStart,
  periodEnd,
  staff,
  shiftTypes,
  assignments,
  requests,
}: PreviewScheduleCardActionsProps) {
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [scheduleActionsOpen, setScheduleActionsOpen] = useState(false);

  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const shiftTypeById = new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st]));
  const requestsInPeriod = (requests ?? []).filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" style={buttonPrimary} onClick={() => setScheduleActionsOpen(true)}>
        自動割り当て・公開
      </button>
      <button type="button" style={buttonSecondary} onClick={() => setShiftEditorOpen(true)}>
        シフトの追加・編集
      </button>

      <Modal open={shiftEditorOpen} onClose={() => setShiftEditorOpen(false)} title="シフトの追加・編集" maxWidth={720}>
        {requestsInPeriod.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 13, ...mutedText }}>提出済みの希望シフト（{periodStart} 〜 {periodEnd}）</h3>
            <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>希望</th>
                </tr>
              </thead>
              <tbody>
                {requestsInPeriod.map((r) => (
                  <tr key={r.requestId}>
                    <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? UNKNOWN_STAFF_NAME_JA}</td>
                    <td style={tableCell}>{r.workDate}</td>
                    <td style={tableCell}>{r.isUnavailable ? '出勤不可' : shiftTypeById.get(r.shiftTypeId ?? '')?.code ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <PreviewShiftEditor timeZone={timeZone} staff={staff} shiftTypes={shiftTypes} assignments={assignments} defaultWorkDate={periodStart} />
      </Modal>

      <Modal open={scheduleActionsOpen} onClose={() => setScheduleActionsOpen(false)} title="自動割り当て・公開" maxWidth={640}>
        <PreviewScheduleActions periodStart={periodStart} periodEnd={periodEnd} />
      </Modal>
    </div>
  );
}
