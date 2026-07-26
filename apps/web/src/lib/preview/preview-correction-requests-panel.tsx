'use client';

import { useState } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewCorrectionActions } from './preview-correction-actions';
import { UNKNOWN_STAFF_NAME_JA } from './manager-view-model';
import { badgeStyle, buttonSecondary, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';

/**
 * Demo/Preview manager UX parity: correction requests surface as a 要確認
 * alert (see `toManagerViewAlerts`) plus a single trigger button here, never
 * a permanently-open admin table on the main dashboard. Wraps the existing
 * `PreviewCorrectionActions` island (unchanged, calls only
 * `previewDecideCorrectionRequest`) in a dialog, and shows the recently
 * decided history read-only alongside it.
 */
export interface PreviewCorrectionRequestsPanelProps {
  timeZone: string;
  pendingRequests: WorkforceShiftRequest[];
  decidedRequests: WorkforceShiftRequest[];
  staff: WorkforceStaffManageEntry[] | null;
  attendance: WorkforceAttendance[] | null;
}

export function PreviewCorrectionRequestsPanel({
  timeZone,
  pendingRequests,
  decidedRequests,
  staff,
  attendance,
}: PreviewCorrectionRequestsPanelProps) {
  const [open, setOpen] = useState(false);
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const attendanceById = new Map((attendance ?? []).map((a) => [a.attendanceId, a]));

  return (
    <>
      <button type="button" style={buttonSecondary} onClick={() => setOpen(true)}>
        修正申請{pendingRequests.length > 0 ? `（${pendingRequests.length}件）` : ''}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="修正申請への対応" maxWidth={720}>
        <PreviewCorrectionActions pendingRequests={pendingRequests} staff={staff} />

        {decidedRequests.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: 0, fontSize: 13, ...mutedText }}>最近の対応履歴</h3>
            <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>勤怠</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>状態</th>
                </tr>
              </thead>
              <tbody>
                {decidedRequests.map((r) => {
                  const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                  return (
                    <tr key={r.requestId}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? UNKNOWN_STAFF_NAME_JA}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>
                        {relatedAttendance
                          ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                          : '-'}
                      </td>
                      <td style={tableCell}>
                        <span style={badgeStyle(r.status === 'approved' ? 'active' : 'inactive')}>
                          {r.status === 'approved' ? '承認済み' : '却下'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
