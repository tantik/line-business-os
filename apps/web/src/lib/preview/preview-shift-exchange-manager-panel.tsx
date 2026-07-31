'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
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
}: {
  timeZone: string;
  assignments: WorkforceShiftAssignment[];
  exchanges: WorkforceShiftExchange[];
  staffNameById: Record<string, string>;
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

  return (
    <section style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{tShiftExchange(lang, 'managerTitle')}</h2>
        <span style={badgeStyle(relevant.length > 0 ? 'warning' : 'active')}>{relevant.length}</span>
      </div>
      {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}
      {relevant.length === 0 ? (
        <p style={{ ...mutedText, fontSize: 13 }}>{tShiftExchange(lang, 'noExchanges')}</p>
      ) : (
        relevant.map((exchange) => {
          const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
          const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
          const requester = staffNameById[exchange.requesterEmployeeId] ?? tShiftExchange(lang, 'unknownStaff');
          const replacement = exchange.replacementEmployeeId
            ? staffNameById[exchange.replacementEmployeeId] ?? tShiftExchange(lang, 'unknownStaff')
            : null;
          return (
            <div key={exchange.exchangeId} style={{ ...card, padding: 12, marginTop: 8 }}>
              <strong>{local ? `${local.workDate} ${local.localTime}` : tShiftExchange(lang, 'shiftFallback')}</strong>
              <p style={{ margin: '5px 0', fontSize: 13 }}>
                {requester} → {replacement ?? tShiftExchange(lang, 'waitingForCandidate')}
              </p>
              <p style={{ ...mutedText, margin: '5px 0 9px', fontSize: 12 }}>{exchange.reason}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={replacement && !pending ? buttonPrimary : buttonDisabled}
                  disabled={!replacement || pending}
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
        })
      )}
    </section>
  );
}
