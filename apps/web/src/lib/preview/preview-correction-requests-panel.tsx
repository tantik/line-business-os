'use client';

import { useState } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { Modal } from '@/components/demo/cafe/Modal';
import { PreviewCorrectionActions } from './preview-correction-actions';
import { previewGetCorrectionRequestsManagerData } from './actions/attendance-actions';
import { badgeStyle, buttonSecondary, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

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
  pendingRequests: initialPendingRequests,
  decidedRequests: initialDecidedRequests,
  staff,
  attendance,
}: PreviewCorrectionRequestsPanelProps) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  // Owned here (not inside `PreviewCorrectionActions`) because the shared
  // `Modal` fully unmounts its children on close - state owned by the
  // actions island itself would be silently discarded every time the dialog
  // closes, reverting to this stale initial-load prop on next open. This
  // component stays mounted across the dialog's open/close cycles, so it is
  // the right place for the "live" copy the scoped
  // `previewGetCorrectionRequestsManagerData()` refetch patches into.
  // Preview Manager architecture, perf phase 3.
  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);
  const [decidedRequests, setDecidedRequests] = useState(initialDecidedRequests);
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const attendanceById = new Map((attendance ?? []).map((a) => [a.attendanceId, a]));

  async function refreshRequests() {
    const result = await previewGetCorrectionRequestsManagerData();
    if (result.status === 'success') {
      setPendingRequests(result.data.pending);
      setDecidedRequests(result.data.decided);
    }
  }

  /**
   * Moves a just-decided request from pending to decided immediately - no
   * second full scoped refetch blocking the popup (Cafe v2.1 remediation
   * PR B; previously every decision waited on its own write, THEN a second
   * full `previewGetCorrectionRequestsManagerData()` round trip before the
   * popup updated at all). The background `refreshRequests()` still runs
   * to reconcile the decided list's exact ordering/10-item cap against the
   * server, it just never blocks this update.
   */
  function handleDecided(decided: WorkforceShiftRequest) {
    setPendingRequests((prev) => prev.filter((r) => r.requestId !== decided.requestId));
    setDecidedRequests((prev) => [decided, ...prev.filter((r) => r.requestId !== decided.requestId)].slice(0, 10));
    void refreshRequests();
  }

  return (
    <>
      <button type="button" style={buttonSecondary} onClick={() => setOpen(true)}>
        {t('correctionRequestsTrigger')}{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('correctionRequestsModalTitle')} maxWidth={720}>
        <PreviewCorrectionActions pendingRequests={pendingRequests} staff={staff} onDecided={handleDecided} />

        {decidedRequests.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: 0, fontSize: 13, ...mutedText }}>{t('recentDecisionsHeading')}</h3>
            <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('staffColumn')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('dateColumnShort')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('attendanceColumn')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('statusColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {decidedRequests.map((r) => {
                  const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                  return (
                    <tr key={r.requestId}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? t('roleFallback')}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>
                        {relatedAttendance
                          ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : t('dash')} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : t('dash')}`
                          : t('dash')}
                      </td>
                      <td style={tableCell}>
                        <span style={badgeStyle(r.status === 'approved' ? 'active' : 'inactive')}>
                          {r.status === 'approved' ? t('statusApproved') : t('statusRejected')}
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
