'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tShiftExchange } from '@/lib/demo/cafe/i18n.shiftExchange';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, mutedText } from '@/lib/demo/cafe/theme';
import { previewDecideShiftExchange } from './actions/shift-exchange-manager-actions';
import { previewWriteMessage } from './write-result';

export function PreviewShiftExchangeManagerPanel({
  timeZone,
  assignments,
  exchanges,
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decidingExchange, setDecidingExchange] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const relevant = exchanges.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted');

  function decide(exchangeId: string, decision: 'approved' | 'rejected') {
    const data = new FormData();
    data.set('exchangeId', exchangeId);
    data.set('decision', decision);
    setFeedback(null);
    setDecidingExchange({ id: exchangeId, decision });
    startTransition(async () => {
      const result = await previewDecideShiftExchange(data);
      if (result.status === 'success') {
        // `pending` (and this component's own "Updating..." message below)
        // stays true through this refresh too -- the full-page reload that
        // follows on this force-dynamic route was previously invisible, and
        // silently waiting through it is exactly what read as "frozen".
        router.refresh();
      } else {
        setFeedback(previewWriteMessage(lang, result.status));
        setDecidingExchange(null);
      }
    });
  }

  if (relevant.length === 0) return null;

  return (
    <section style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{tShiftExchange(lang, 'managerTitle')}</h2>
        <span style={badgeStyle('warning')}>{relevant.length}</span>
      </div>
      {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}
      {pending ? (
        <p role="status" style={{ margin: '6px 0 0', fontSize: 12, ...mutedText }}>
          {lang === 'ja' ? '更新しています…' : 'Updating…'}
        </p>
      ) : null}
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
                {exchange.requestKind === 'change' && requestedType ? ` → ${requestedType.code} (${requestedType.startsAtLocal.slice(0, 5)}–${requestedType.endsAtLocal.slice(0, 5)})` : ''}
              </p>
              <p style={{ ...mutedText, margin: '5px 0 9px', fontSize: 12 }}>{exchange.reason}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={canApprove && !pending ? buttonPrimary : buttonDisabled}
                  disabled={!canApprove || pending}
                  onClick={() => decide(exchange.exchangeId, 'approved')}
                >
                  {decidingExchange?.id === exchange.exchangeId && decidingExchange.decision === 'approved'
                    ? (lang === 'ja' ? '承認中…' : 'Approving…')
                    : tShiftExchange(lang, 'approveButton')}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  disabled={pending}
                  onClick={() => decide(exchange.exchangeId, 'rejected')}
                >
                  {decidingExchange?.id === exchange.exchangeId && decidingExchange.decision === 'rejected'
                    ? (lang === 'ja' ? '却下中…' : 'Rejecting…')
                    : tShiftExchange(lang, 'rejectButton')}
                </button>
              </div>
            </div>
          );
        })}
    </section>
  );
}
