'use client';

import { useRef, useState, useTransition } from 'react';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tShiftExchange } from '@/lib/demo/cafe/i18n.shiftExchange';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, mutedText } from '@/lib/demo/cafe/theme';
import { previewDecideShiftExchange, previewGetShiftExchangeManagerData } from './actions/shift-exchange-manager-actions';
import { previewWriteMessage } from './write-result';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';
import { PendingOverlay } from '@/components/ui/loading';

export function PreviewShiftExchangeManagerPanel({
  timeZone,
  assignments: initialAssignments,
  exchanges: initialExchanges,
  staffNameById,
  shiftTypes,
}: {
  timeZone: string;
  assignments: WorkforceShiftAssignment[];
  exchanges: WorkforceShiftExchange[];
  staffNameById: Record<string, string>;
  shiftTypes: WorkforceShiftType[];
}) {
  const { lang } = useLang();
  const [pending, startTransition] = useTransition();
  // Owns its own copy of assignments/exchanges, seeded from the initial page
  // load, and patches it via a scoped `previewGetShiftExchangeManagerData()`
  // refetch after a successful approve/reject - never `router.refresh()`.
  // This panel is never inside a Modal, so it stays mounted the whole time
  // and can safely own this state directly. Preview Manager architecture,
  // perf phase 3.
  const [assignments, setAssignments] = useState(initialAssignments);
  const [exchanges, setExchanges] = useState(initialExchanges);
  const [decidingExchange, setDecidingExchange] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  // `pending` (from useTransition) only flips true on the next render, not
  // synchronously with the click -- a fast double-click/Enter-repeat can fire
  // `decide()` twice before the button's `disabled` attribute updates, and the
  // second call then hits the RPC's own "already decided" guard and surfaces
  // as an opaque, generic error (confirmed live: the RPC itself is correct
  // for every decision/request-kind combination). This ref makes the guard
  // synchronous so a second click inside that window is a no-op.
  const decidingRef = useRef(false);
  const relevant = exchanges.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted');

  async function refresh() {
    const result = await previewGetShiftExchangeManagerData();
    if (result.status === 'success') {
      setExchanges(result.data.exchanges);
      setAssignments(result.data.assignments);
    }
  }

  function decide(exchangeId: string, decision: 'approved' | 'rejected') {
    if (decidingRef.current) return;
    decidingRef.current = true;
    const data = new FormData();
    data.set('exchangeId', exchangeId);
    data.set('decision', decision);
    setFeedback(null);
    setConfirming(null);
    setDecidingExchange({ id: exchangeId, decision });
    startTransition(async () => {
      const result = await previewDecideShiftExchange(data);
      if (result.status === 'success' || result.status === 'stale_reference') {
        // `stale_reference` means the RPC's own re-validation refused this
        // approve because the target shift/shift-type has changed since the
        // request was made (most commonly: its `starts_at` has since
        // passed) - the request is no longer decidable as-is, so refresh
        // the same way a success does rather than leaving a now-stale
        // pending row on screen with nothing to retry.
        // `pending` (and this component's own pending indicator below) stays
        // true through this scoped refetch too, same as it did through the
        // old full-page reload - waiting silently through it is exactly what
        // previously read as "frozen".
        await refresh();
        decidingRef.current = false;
        setDecidingExchange(null);
        if (result.status === 'stale_reference') setFeedback(previewWriteMessage(lang, result.status));
      } else {
        decidingRef.current = false;
        setFeedback(previewWriteMessage(lang, result.status));
        setDecidingExchange(null);
      }
    });
  }

  if (relevant.length === 0) return null;

  return (
    <section style={{ ...card, marginTop: 18, position: 'relative' }}>
      <PendingOverlay
        visible={pending}
        message={
          decidingExchange?.decision === 'rejected'
            ? tShiftExchange(lang, 'rejecting')
            : tShiftExchange(lang, 'approving')
        }
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{tShiftExchange(lang, 'managerTitle')}</h2>
        <span style={badgeStyle('warning')}>{relevant.length}</span>
      </div>
      {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}
      {relevant.map((exchange) => {
          const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
          const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
          const requester = staffNameById[exchange.requesterEmployeeId] ?? tShiftExchange(lang, 'unknownStaff');
          const replacement = exchange.replacementEmployeeId
            ? staffNameById[exchange.replacementEmployeeId] ?? tShiftExchange(lang, 'unknownStaff')
            : null;
          const requestedType = shiftTypes.find((type) => type.shiftTypeId === exchange.requestedShiftTypeId);
          const actionLabel = exchange.requestKind === 'cancel'
            ? (lang === 'ja' ? 'キャンセル依頼' : 'Cancellation request')
            : exchange.requestKind === 'change'
              ? (lang === 'ja' ? '変更依頼' : 'Shift change request')
              : (lang === 'ja' ? '交代依頼' : 'Exchange request');
          const canApprove = exchange.requestKind !== 'exchange' || Boolean(replacement);
          return (
            <div key={exchange.exchangeId} style={{ ...card, padding: 12, marginTop: 8 }}>
              <strong>{local ? `${local.workDate} ${local.localTime}` : tShiftExchange(lang, 'shiftFallback')}</strong>
              <p style={{ margin: '5px 0', fontSize: 13 }}>
                {actionLabel} · {requester}
                {exchange.requestKind === 'exchange' ? ` → ${replacement ?? tShiftExchange(lang, 'waitingForCandidate')}` : ''}
                {exchange.requestKind === 'change' && requestedType ? ` → ${shiftTypeDisplayLabel(requestedType)} (${requestedType.startsAtLocal.slice(0, 5)}–${requestedType.endsAtLocal.slice(0, 5)})` : ''}
              </p>
              <p style={{ ...mutedText, margin: '5px 0 9px', fontSize: 12 }}>{exchange.reason}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={canApprove && !pending ? buttonPrimary : buttonDisabled}
                  disabled={!canApprove || pending}
                  onClick={() => setConfirming({ id: exchange.exchangeId, decision: 'approved' })}
                >
                  {tShiftExchange(lang, 'approveButton')}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  disabled={pending}
                  onClick={() => setConfirming({ id: exchange.exchangeId, decision: 'rejected' })}
                >
                  {tShiftExchange(lang, 'rejectButton')}
                </button>
              </div>
            </div>
          );
        })}

      <ConfirmDialog
        open={confirming !== null}
        title={tShiftExchange(lang, confirming?.decision === 'rejected' ? 'confirmRejectTitle' : 'confirmApproveTitle')}
        confirmLabel={tShiftExchange(lang, confirming?.decision === 'rejected' ? 'rejectButton' : 'approveButton')}
        cancelLabel={tShiftExchange(lang, 'cancel')}
        pending={pending}
        danger={confirming?.decision === 'rejected'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) decide(confirming.id, confirming.decision);
        }}
      >
        {tShiftExchange(lang, confirming?.decision === 'rejected' ? 'confirmRejectBody' : 'confirmApproveBody')}
      </ConfirmDialog>
    </section>
  );
}
