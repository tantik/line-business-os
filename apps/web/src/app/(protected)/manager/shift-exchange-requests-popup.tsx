'use client';

import { useState, type CSSProperties } from 'react';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { Lang } from '@/lib/demo/cafe/i18n';
import { HelpIconButton, Modal } from '@/components/shared/design-kit';
import { usePopupOpenTiming } from '@/lib/ui/popup-timing';
import { buttonDisabled, buttonPrimary, buttonSecondary, colors, mutedText } from '@/lib/ui/theme';
import hoverStyles from '@/lib/ui/theme.module.css';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { shiftTypeDisplayLabel } from '@/lib/workforce/shift-types';
import { computeShiftExchangeCandidates, type ShiftExchangeCandidateWarning } from '@/lib/workforce/shift-exchange-candidates';
import { exchangeStatusBadgeStyle, exchangeStatusLabel } from '../_ui/workforce-theme';
import { tManagerDashboard } from './manager-dashboard-i18n';

export interface ShiftExchangeRequestsPopupProps {
  open: boolean;
  onClose: () => void;
  pendingExchanges: WorkforceShiftExchange[];
  /** All decided exchanges, newest-decided first -- this component caps to the most recent 10 by default and offers an "Archive" toggle for the rest. */
  decidedExchanges: WorkforceShiftExchange[];
  staffById: Map<string, WorkforceStaffManageEntry>;
  /** Full active/inactive roster -- source for the "Assign replacement" candidate list (Shift Exchange Manager Resolution UX). Already tenant/location-scoped the same way `staffById` is (both come from the same Manager-page `staff` read). */
  staff: WorkforceStaffManageEntry[];
  exchangeAssignmentById: Map<string, WorkforceShiftAssignment>;
  /** Every assignment in the currently-loaded window (not just the ones tied to an exchange) -- used only to preview a schedule-conflict warning for a candidate; the server RPC re-checks this authoritatively on assign. */
  allAssignments: WorkforceShiftAssignment[] | null;
  /** Submitted shift preferences/requests -- used only to preview a non-blocking "marked unavailable" warning for a candidate. */
  preferences: WorkforceShiftRequest[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  timeZone: string;
  isPending: boolean;
  pendingAction: string | null;
  onDecide: (exchangeId: string, decision: 'approved' | 'rejected') => void;
  onAssignReplacement: (exchangeId: string, replacementEmployeeId: string) => void;
  lang: Lang;
}

const candidateRowStyle = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${selected ? colors.accent : colors.border}`,
  background: selected ? colors.accentMuted : colors.surface,
  cursor: 'pointer',
  font: 'inherit',
  textAlign: 'left',
  width: '100%',
});

function candidateWarningLabel(
  warning: ShiftExchangeCandidateWarning,
  t: (key: Parameters<typeof tManagerDashboard>[1]) => string,
): string {
  if (warning === 'schedule_conflict') return t('candidateScheduleConflict');
  if (warning === 'marked_unavailable') return t('candidateMarkedUnavailable');
  return t('candidateAvailable');
}

/**
 * Manager "Shift exchange requests" popup (WP-11, Cafe Manager UI/UX Parity
 * mission): converts the previously always-visible
 * `#shift-exchange-requests` section into a `Modal`-wrapped popup triggered
 * from `AttentionPanel`'s card -- see `CorrectionRequestsPopup`'s doc
 * comment for the same rationale. All decision logic
 * (`handleDecideExchange`) stays in the parent, passed down as `onDecide`.
 *
 * Shift Exchange Manager Resolution UX (2026-08-22): an 'exchange'-kind
 * request with no replacement yet used to show a permanently-disabled
 * Approve button and an explanatory sentence -- a dead end, not a next
 * action. It now shows a `Replacement: Not assigned` / "Waiting for
 * candidate" status plus an "Assign replacement" button, which expands that
 * one request's card in place (no nested modal) into a searchable candidate
 * list built from `computeShiftExchangeCandidates` (pure, reuses the
 * Manager's already-loaded roster/schedule/preferences data). Selecting a
 * candidate and confirming calls the new `manager_assign_shift_exchange_replacement`
 * RPC via `onAssignReplacement`; the request then shows its assigned
 * replacement plus Approve/Change/Reject, same as a colleague-accepted
 * request always has.
 */
export function ShiftExchangeRequestsPopup({
  open,
  onClose,
  pendingExchanges,
  decidedExchanges,
  staffById,
  staff,
  exchangeAssignmentById,
  allAssignments,
  preferences,
  shiftTypes,
  timeZone,
  isPending,
  pendingAction,
  onDecide,
  onAssignReplacement,
  lang,
}: ShiftExchangeRequestsPopupProps) {
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  usePopupOpenTiming(open, 'shift-exchange-requests');
  const [helpOpen, setHelpOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  function startSelecting(exchangeId: string) {
    setSelectingFor(exchangeId);
    setSearchQuery('');
    setSelectedCandidateId(null);
  }

  function cancelSelecting() {
    setSelectingFor(null);
    setSearchQuery('');
    setSelectedCandidateId(null);
  }

  function confirmSelecting(exchangeId: string) {
    if (!selectedCandidateId) return;
    onAssignReplacement(exchangeId, selectedCandidateId);
    cancelSelecting();
  }

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
            const assigning = pendingAction === `assign-replacement-${e.exchangeId}`;
            const shift = exchangeAssignmentById.get(e.shiftId);
            const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
            const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
            const replacementName = e.replacementEmployeeId ? staffById.get(e.replacementEmployeeId)?.name ?? e.replacementEmployeeId : null;
            const requestedType = shiftTypes?.find((ty) => ty.shiftTypeId === e.requestedShiftTypeId);
            const requestLabel =
              e.requestKind === 'cancel' ? t('requestKindCancellation') : e.requestKind === 'change' ? t('requestKindChange') : t('requestKindExchange');
            // An 'exchange' request has nothing to approve into until it has
            // a replacement (either a colleague accepted it themselves, or a
            // Manager assigned one via this popup) -- the RPC itself also
            // rejects an approve without one.
            const canApprove = e.requestKind !== 'exchange' || Boolean(e.replacementEmployeeId);
            const isSelecting = selectingFor === e.exchangeId;

            const candidates =
              isSelecting && shift
                ? computeShiftExchangeCandidates(
                    staff.map((s) => ({ employeeId: s.staffId, name: s.name, isActive: s.isActive })),
                    e.requesterEmployeeId,
                    { startsAt: shift.startsAt, endsAt: shift.endsAt, workDate: shiftLocal!.workDate },
                    allAssignments ?? [],
                    preferences ?? [],
                  )
                : [];
            const filteredCandidates = candidates.filter((c) => c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()));

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
                  {isSelecting ? null : (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {canApprove ? (
                        <button
                          type="button"
                          className={hoverStyles.buttonPrimary}
                          style={isPending ? buttonDisabled : buttonPrimary}
                          disabled={isPending}
                          onClick={() => onDecide(e.exchangeId, 'approved')}
                        >
                          {deciding ? t('saving') : t('approve')}
                        </button>
                      ) : null}
                      {e.requestKind === 'exchange' ? (
                        <button
                          type="button"
                          className={hoverStyles.buttonSecondary}
                          style={isPending ? buttonDisabled : buttonSecondary}
                          disabled={isPending}
                          onClick={() => startSelecting(e.exchangeId)}
                        >
                          {e.replacementEmployeeId ? t('changeReplacementButton') : t('assignReplacementButton')}
                        </button>
                      ) : null}
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
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ ...mutedText, fontSize: 12 }}>{t('colRequest')}</div>
                  <div style={{ fontSize: 14 }}>
                    {requestLabel}
                    {e.requestKind === 'change' && requestedType
                      ? ` → ${shiftTypeDisplayLabel(requestedType)} (${requestedType.startsAtLocal.slice(0, 5)}–${requestedType.endsAtLocal.slice(0, 5)})`
                      : ''}
                  </div>
                </div>
                {e.requestKind === 'exchange' ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('exchangeReplacementLabel')}</div>
                    <div style={{ fontSize: 14 }}>{replacementName ?? t('exchangeReplacementNotAssigned')}</div>
                    {!e.replacementEmployeeId ? <div style={{ fontSize: 13, color: colors.warning }}>{t('exchangeWaitingForCandidate')}</div> : null}
                  </div>
                ) : null}
                {e.reason ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...mutedText, fontSize: 12 }}>{t('colReason')}</div>
                    <div style={{ fontSize: 14 }}>{e.reason}</div>
                  </div>
                ) : null}

                {isSelecting ? (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t('selectReplacementTitle')}</div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(ev) => setSearchQuery(ev.target.value)}
                      placeholder={t('searchReplacementPlaceholder')}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14 }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {filteredCandidates.length === 0 ? (
                        <p style={{ margin: 0, ...mutedText, fontSize: 13 }}>{t('noEligibleReplacements')}</p>
                      ) : (
                        filteredCandidates.map((c) => (
                          <button
                            key={c.employeeId}
                            type="button"
                            style={candidateRowStyle(selectedCandidateId === c.employeeId)}
                            onClick={() => setSelectedCandidateId(c.employeeId)}
                          >
                            <span style={{ fontSize: 14 }}>{c.name}</span>
                            <span style={{ fontSize: 12, color: c.warning ? colors.warning : colors.success }}>{candidateWarningLabel(c.warning, t)}</span>
                          </button>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} onClick={cancelSelecting}>
                        {t('cancel')}
                      </button>
                      <button
                        type="button"
                        className={hoverStyles.buttonPrimary}
                        style={!selectedCandidateId || assigning ? buttonDisabled : buttonPrimary}
                        disabled={!selectedCandidateId || assigning}
                        onClick={() => confirmSelecting(e.exchangeId)}
                      >
                        {assigning ? t('assigningReplacement') : t('confirmAssignReplacementButton')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {decidedExchanges.length > 0 ? (
        <button type="button" className={hoverStyles.buttonSecondary} style={{ ...buttonSecondary, marginTop: 16 }} onClick={() => setHistoryOpen(true)}>
          {t('viewHistoryButton')}
        </button>
      ) : null}

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('exchangesPopupHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('exchangesPopupHelpBody')}</div>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t('recentlyDecided')} closeLabel={t('cancel')} width="min(600px, 96vw)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {decidedExchanges.map((e) => {
            const shift = exchangeAssignmentById.get(e.shiftId);
            const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
            const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
            return (
              <div
                key={e.exchangeId}
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
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{requesterName}{shiftLocal ? ` · ${shiftLocal.workDate} ${shiftLocal.localTime}` : ''}</div>
                  <div style={{ ...mutedText, fontSize: 12 }}>{e.reason}</div>
                </div>
                <span style={exchangeStatusBadgeStyle(e.status)}>{exchangeStatusLabel(e.status, lang)}</span>
              </div>
            );
          })}
        </div>
      </Modal>
    </Modal>
  );
}
