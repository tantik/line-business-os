'use client';

import { useState } from 'react';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, buttonSecondary, colors, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { correctionStatusBadgeStyle, correctionStatusLabel, formatRequestedCorrectionChange } from '../_ui/workforce-theme';
import { tManagerDashboard } from './manager-dashboard-i18n';

const ARCHIVE_PREVIEW_COUNT = 10;

export interface CorrectionRequestsPopupProps {
  open: boolean;
  onClose: () => void;
  pendingCorrections: WorkforceShiftRequest[];
  /** All non-pending requests, newest-decided first -- this component caps to the most recent 10 by default and offers an "Archive" toggle for the rest. */
  decidedCorrections: WorkforceShiftRequest[];
  staffById: Map<string, WorkforceStaffManageEntry>;
  attendanceById: Map<string, WorkforceAttendance>;
  timeZone: string;
  isPending: boolean;
  pendingAction: string | null;
  onDecide: (requestId: string, decision: ShiftRequestDecision) => void;
  lang: Lang;
}

/**
 * Manager "Correction requests" popup (WP-11, Cafe Manager UI/UX Parity
 * mission): converts the previously always-visible `#correction-requests`
 * section into a `Modal`-wrapped popup triggered from `AttentionPanel`'s
 * card -- `AttentionPanel`'s own doc comment already flagged this exact
 * conversion as deliberately deferred; this is that follow-up. All decision
 * logic (`handleDecideCorrection`) stays in the parent, passed down as
 * `onDecide` -- this component only renders and manages its own
 * pending/decided-vs-archived view state.
 */
export function CorrectionRequestsPopup({
  open,
  onClose,
  pendingCorrections,
  decidedCorrections,
  staffById,
  attendanceById,
  timeZone,
  isPending,
  pendingAction,
  onDecide,
  lang,
}: CorrectionRequestsPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'correction-requests');
  const [showArchive, setShowArchive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const visibleDecided = showArchive ? decidedCorrections : decidedCorrections.slice(0, ARCHIVE_PREVIEW_COUNT);
  const hasMoreThanPreview = decidedCorrections.length > ARCHIVE_PREVIEW_COUNT;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('correctionsHeading')}
      titleAdornment={<HelpIconButton ariaLabel={t('correctionsPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(1100px, 96vw)"
      closeLabel={t('cancel')}
    >
      <p style={{ margin: 0, ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('needsActionEyebrow')}</p>
      {pendingCorrections.length === 0 ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('noPendingCorrections')}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDate')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colMessage')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colAttendance')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequested')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colTransportation')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDailyMessage')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {pendingCorrections.map((r) => {
                const deciding = pendingAction === `decide-${r.requestId}`;
                const message = typeof r.details.message === 'string' ? r.details.message : '-';
                const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                return (
                  <tr key={r.requestId}>
                    <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                    <td style={tableCell}>{r.workDate}</td>
                    <td style={tableCell}>{message}</td>
                    <td style={tableCell}>
                      {relatedAttendance
                        ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                        : '-'}
                    </td>
                    <td style={tableCell}>{formatRequestedCorrectionChange(r.details)}</td>
                    <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                    <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={hoverStyles.buttonPrimary}
                          style={isPending ? buttonDisabled : buttonPrimary}
                          disabled={isPending}
                          onClick={() => onDecide(r.requestId, 'approved')}
                        >
                          {deciding ? t('saving') : t('approve')}
                        </button>
                        <button
                          type="button"
                          className={hoverStyles.buttonSecondary}
                          style={isPending ? buttonDisabled : buttonSecondary}
                          disabled={isPending}
                          onClick={() => onDecide(r.requestId, 'rejected')}
                        >
                          {deciding ? t('saving') : t('reject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {decidedCorrections.length > 0 ? (
        <div style={{ marginTop: 16, background: colors.surfaceElevated, borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>{t('recentlyDecided')}</h3>
            {hasMoreThanPreview ? (
              <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, padding: '4px 10px', fontSize: 12 }} onClick={() => setShowArchive((v) => !v)}>
                {showArchive ? t('hideArchiveButton') : t('showArchiveButton')}
              </button>
            ) : null}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDate')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colMessage')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colAttendance')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequested')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colTransportation')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDailyMessage')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus2')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDecided.map((r) => {
                  const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                  return (
                    <tr key={r.requestId}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : '-'}</td>
                      <td style={tableCell}>
                        {relatedAttendance
                          ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                          : '-'}
                      </td>
                      <td style={tableCell}>{formatRequestedCorrectionChange(r.details)}</td>
                      <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                      <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                      <td style={tableCell}>
                        <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status, lang)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('correctionsPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('correctionsPopupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
