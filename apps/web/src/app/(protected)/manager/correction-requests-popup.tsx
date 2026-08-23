'use client';

import { useState } from 'react';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { correctionStatusBadgeStyle, correctionStatusLabel, formatRequestedCorrectionChange } from '../_ui/workforce-theme';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface CorrectionRequestsPopupProps {
  open: boolean;
  onClose: () => void;
  pendingCorrections: WorkforceShiftRequest[];
  /** All non-pending requests, newest-decided first -- shown only inside the on-demand "View history" popup (Attention polish pass, 2026-08-21), not inline in the main decision view. */
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
 *
 * Attention polish pass (2026-08-21, Founder feedback): the always-visible
 * "Recently decided" table below the decision cards mixed a modern
 * decision-oriented UI with an old wide admin table, and a Manager opening
 * this popup wants to resolve *current* requests, not read history. History
 * now only renders on demand, in its own popup opened via "View history",
 * as compact one-line-per-request cards instead of an 8-column table.
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {pendingCorrections.map((r) => {
            const deciding = pendingAction === `decide-${r.requestId}`;
            const message = typeof r.details.message === 'string' ? r.details.message : '-';
            const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
            const currentRange = relatedAttendance
              ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
              : '-';
            return (
              <div key={r.requestId} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</div>
                    <div style={mutedText}>{r.workDate}</div>
                  </div>
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
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10 }}>
                  <div>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colAttendance')}</div>
                    <div style={{ fontSize: 14 }}>{currentRange}</div>
                  </div>
                  <div>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colRequested')}</div>
                    <div style={{ fontSize: 14 }}>{formatRequestedCorrectionChange(r.details, lang)}</div>
                  </div>
                  {relatedAttendance?.transportationCost != null ? (
                    <div>
                      <div style={{ ...mutedText, fontSize: 12 }}>{t('colTransportation')}</div>
                      <div style={{ fontSize: 14 }}>{relatedAttendance.transportationCost}</div>
                    </div>
                  ) : null}
                </div>
                {message !== '-' ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colMessage')}</div>
                    <div style={{ fontSize: 14 }}>{message}</div>
                  </div>
                ) : null}
                {relatedAttendance?.dailyMessage ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colDailyMessage')}</div>
                    <div style={{ fontSize: 14 }}>{relatedAttendance.dailyMessage}</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {decidedCorrections.length > 0 ? (
        <button
          type="button"
          className={hoverStyles.buttonSecondary}
          style={{ ...buttonSecondary, marginTop: 16 }}
          onClick={() => setHistoryOpen(true)}
        >
          {t('viewHistoryButton')}
        </button>
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('correctionsPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('correctionsPopupHelpBody')}</div>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('recentlyDecided')} closeLabel={t('cancel')} width="min(600px, 96vw)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {decidedCorrections.map((r) => {
            const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
            const currentRange = relatedAttendance
              ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} → ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
              : formatRequestedCorrectionChange(r.details, lang);
            return (
              <div
                key={r.requestId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  background: colors.surfaceElevated,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{staffById.get(r.employeeId)?.name ?? r.employeeId} · {r.workDate}</div>
                  <div style={{ ...mutedText, fontSize: 12 }}>{currentRange}</div>
                </div>
                <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status, lang)}</span>
              </div>
            );
          })}
        </div>
      </Modal>
    </Modal>
  );
}
