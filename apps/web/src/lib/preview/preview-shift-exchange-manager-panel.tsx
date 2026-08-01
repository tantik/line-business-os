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
  const [feedback, setFeedback] = useState<string | null>(null);
  const relevant = exchanges.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted');

  function decide(exchangeId: string, decision: 'approved' | 'rejected') {
    const data = new FormData();
    data.set('exchangeId', exchangeId);
    data.set('decision', decision);
    setFeedback(null);
    startTransition(async () => {
      const result = await previewDecideShiftExchange(data);
      if (result.status === 'success') router.refresh();
      else setFeedback(previewWriteMessage(lang, result.status));
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
                  {tShiftExchange(lang, 'approveButton')}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  disabled={pending}
                  onClick={() => decide(exchange.exchangeId, 'rejected')}
                >
                  {tShiftExchange(lang, 'rejectButton')}
                </button>
              </div>
            </div>
          );
        })}
    </section>
  );
}
