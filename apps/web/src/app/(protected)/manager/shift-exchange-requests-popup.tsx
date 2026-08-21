'use client';

import { useState } from 'react';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, buttonSecondary, colors, mutedText, tableCell, tableHeaderCell } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { shiftTypeDisplayLabel } from '@/lib/workforce/shift-types';
import { exchangeStatusBadgeStyle, exchangeStatusLabel } from '../_ui/workforce-theme';
import { tManagerDashboard } from './manager-dashboard-i18n';

const ARCHIVE_PREVIEW_COUNT = 10;

export interface ShiftExchangeRequestsPopupProps {
  open: boolean;
  onClose: () => void;
  pendingExchanges: WorkforceShiftExchange[];
  /** All decided exchanges, newest-decided first -- this component caps to the most recent 10 by default and offers an "Archive" toggle for the rest. */
  decidedExchanges: WorkforceShiftExchange[];
  staffById: Map<string, WorkforceStaffManageEntry>;
  exchangeAssignmentById: Map<string, WorkforceShiftAssignment>;
  shiftTypes: WorkforceShiftType[] | null;
  timeZone: string;
  isPending: boolean;
  pendingAction: string | null;
  onDecide: (exchangeId: string, decision: 'approved' | 'rejected') => void;
  lang: Lang;
}

/**
 * Manager "Shift exchange requests" popup (WP-11, Cafe Manager UI/UX Parity
 * mission): converts the previously always-visible
 * `#shift-exchange-requests` section into a `Modal`-wrapped popup triggered
 * from `AttentionPanel`'s card -- see `CorrectionRequestsPopup`'s doc
 * comment for the same rationale. All decision logic
 * (`handleDecideExchange`) stays in the parent, passed down as `onDecide`.
 */
export function ShiftExchangeRequestsPopup({
  open,
  onClose,
  pendingExchanges,
  decidedExchanges,
  staffById,
  exchangeAssignmentById,
  shiftTypes,
  timeZone,
  isPending,
  pendingAction,
  onDecide,
  lang,
}: ShiftExchangeRequestsPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'shift-exchange-requests');
  const [showArchive, setShowArchive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const visibleDecided = showArchive ? decidedExchanges : decidedExchanges.slice(0, ARCHIVE_PREVIEW_COUNT);
  const hasMoreThanPreview = decidedExchanges.length > ARCHIVE_PREVIEW_COUNT;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('exchangesHeading')}
      titleAdornment={<HelpIconButton ariaLabel={t('exchangesPopupHelpAriaLabel')} onClick={() => setHelpOpen(true)} />}
      width="min(1100px, 96vw)"
      closeLabel={t('cancel')}
    >
      <p style={{ margin: 0, ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t('needsActionEyebrow')}</p>
      {pendingExchanges.length === 0 ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('noPendingExchanges')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {pendingExchanges.map((e) => {
            const deciding = pendingAction === `decide-exchange-${e.exchangeId}`;
            const shift = exchangeAssignmentById.get(e.shiftId);
            const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
            const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
            const replacementName = e.replacementEmployeeId ? staffById.get(e.replacementEmployeeId)?.name ?? e.replacementEmployeeId : null;
            const requestedType = shiftTypes?.find((ty) => ty.shiftTypeId === e.requestedShiftTypeId);
            const requestLabel =
              e.requestKind === 'cancel' ? t('requestKindCancellation') : e.requestKind === 'change' ? t('requestKindChange') : t('requestKindExchange');
            // Mirrors `PreviewShiftExchangeManagerPanel`'s `canApprove`: an
            // 'exchange' request has nothing to approve into until a
            // colleague has accepted it (replacementEmployeeId set); the
            // RPC itself also rejects an approve without one.
            const canApprove = e.requestKind !== 'exchange' || Boolean(e.replacementEmployeeId);
            return (
              <div key={e.exchangeId} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{requesterName}</div>
                    <div style={mutedText}>{shiftLocal ? `${shiftLocal.workDate} · ${shiftLocal.localTime}` : '-'}</div>
                    {/* Two pending requests can otherwise look identical (same requester, shift date/time, reason) when they reference different underlying shifts -- shows each request's own submission time so a Manager can tell them apart without guessing. */}
                    <div style={{ ...mutedText, fontSize: 12 }}>
                      {t('attentionSubmittedAtPrefix')} {utcIsoToLocalDateTime(e.createdAt, timeZone).workDate} {utcIsoToLocalDateTime(e.createdAt, timeZone).localTime}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={hoverStyles.buttonPrimary}
                      style={isPending || !canApprove ? buttonDisabled : buttonPrimary}
                      disabled={isPending || !canApprove}
                      onClick={() => onDecide(e.exchangeId, 'approved')}
                    >
                      {deciding ? t('saving') : t('approve')}
                    </button>
                    <button
                      type="button"
                      className={hoverStyles.buttonSecondary}
                      style={isPending ? buttonDisabled : buttonSecondary}
                      disabled={isPending}
                      onClick={() => onDecide(e.exchangeId, 'rejected')}
                    >
                      {deciding ? t('saving') : t('reject')}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...mutedText, fontSize: 12 }}>{t('colRequest')}</div>
                  <div style={{ fontSize: 14 }}>
                    {requestLabel}
                    {e.requestKind === 'exchange' ? ` → ${replacementName ?? t('awaitingCandidate')}` : ''}
                    {e.requestKind === 'change' && requestedType
                      ? ` → ${shiftTypeDisplayLabel(requestedType)} (${requestedType.startsAtLocal.slice(0, 5)}–${requestedType.endsAtLocal.slice(0, 5)})`
                      : ''}
                  </div>
                </div>
                {e.reason ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colReason')}</div>
                    <div style={{ fontSize: 14 }}>{e.reason}</div>
                  </div>
                ) : null}
                {!canApprove ? (
                  <div style={{ marginTop: 8, fontSize: 13, color: colors.warning }}>{t('attentionReplacementRequiredReason')}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {decidedExchanges.length > 0 ? (
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
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequester')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colShift')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colReason')}</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus2')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDecided.map((e) => {
                  const shift = exchangeAssignmentById.get(e.shiftId);
                  const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
                  const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
                  return (
                    <tr key={e.exchangeId}>
                      <td style={tableCell}>{requesterName}</td>
                      <td style={tableCell}>{shiftLocal ? `${shiftLocal.workDate} ${shiftLocal.localTime}` : '-'}</td>
                      <td style={tableCell}>{e.reason}</td>
                      <td style={tableCell}>
                        <span style={exchangeStatusBadgeStyle(e.status)}>{exchangeStatusLabel(e.status, lang)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('exchangesPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('exchangesPopupHelpBody')}</div>
      </Modal>
    </Modal>
  );
}
