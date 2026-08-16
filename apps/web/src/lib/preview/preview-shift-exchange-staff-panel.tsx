'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { Modal } from '@/components/demo/cafe/Modal';
import { useLang } from '@/lib/demo/cafe/i18n';
import { tShiftExchange } from '@/lib/demo/cafe/i18n.shiftExchange';
import { badgeStyle, buttonDisabled, buttonPrimary, buttonSecondary, card, mutedText } from '@/lib/demo/cafe/theme';
import { previewAcceptShiftExchange, previewCancelShiftExchange } from './actions/shift-exchange-actions';
import { previewWriteMessage } from './write-result';

/**
 * Compact trigger + modal (not a permanently visible large form). Requesting
 * an exchange on one's own shift now happens via the schedule "tap own
 * shift" modal (`preview-staff-schedule.tsx` + `preview-shift-exchange-
 * request-form.tsx`) -- this panel only surfaces accepting a colleague's
 * open shift, cancelling one's own pending request, and recent results.
 */
export function PreviewShiftExchangeStaffPanel({
  employeeId,
  timeZone,
  assignments,
  exchanges,
}: {
  employeeId: string;
  timeZone: string;
  assignments: WorkforceShiftAssignment[];
  exchanges: WorkforceShiftExchange[];
}) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const active = exchanges.filter((exchange) => exchange.status === 'open' || exchange.status === 'accepted');
  const recentResults = exchanges
    .filter(
      (exchange) =>
        exchange.requesterEmployeeId === employeeId || exchange.replacementEmployeeId === employeeId,
    )
    .filter((exchange) => ['approved', 'rejected', 'cancelled'].includes(exchange.status))
    .slice(0, 3);

  function run(action: (data: FormData) => Promise<{ status: string }>, data: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.status === 'success') router.refresh();
      else setFeedback(previewWriteMessage(lang, result.status as Parameters<typeof previewWriteMessage>[1]));
    });
  }

  return (
    <section style={{ ...card, marginTop: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div>
        <strong style={{ fontSize: 14 }}>{tShiftExchange(lang, 'staffTitle')}</strong>
        {active.length > 0 ? (
          <span style={{ marginLeft: 8, ...badgeStyle('warning') }}>{active.length}</span>
        ) : null}
      </div>
      <button type="button" style={buttonSecondary} onClick={() => setIsOpen(true)}>
        {tShiftExchange(lang, 'viewExchanges')}
      </button>

      <Modal open={isOpen} onClose={() => setIsOpen(false)} title={tShiftExchange(lang, 'staffTitle')}>
        <p style={{ ...mutedText, margin: '0 0 10px', fontSize: 12 }}>{tShiftExchange(lang, 'staffDescription')}</p>
        {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}

        {active.length === 0 ? (
          <p style={{ margin: 0, ...mutedText, fontSize: 13 }}>{tShiftExchange(lang, 'noActiveExchanges')}</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {active.map((exchange) => {
              const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
              const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
              const own = exchange.requesterEmployeeId === employeeId;
              return (
                <div key={exchange.exchangeId} style={{ ...card, marginTop: 0, padding: 10 }}>
                  <strong style={{ fontSize: 13.5 }}>{local ? `${local.workDate} ${local.localTime}` : tShiftExchange(lang, 'shiftFallback')}</strong>
                  <p style={{ margin: '4px 0', fontSize: 12.5 }}>{exchange.reason}</p>
                  <p style={{ ...mutedText, margin: '4px 0', fontSize: 12 }}>
                    {exchange.status === 'accepted'
                      ? tShiftExchange(lang, 'statusAccepted')
                      : own
                        ? tShiftExchange(lang, 'statusWaitingOwn')
                        : tShiftExchange(lang, 'statusAvailable')}
                  </p>
                  {own ? (
                    <button
                      type="button"
                      style={buttonSecondary}
                      disabled={pending}
                      onClick={() => {
                        const data = new FormData();
                        data.set('exchangeId', exchange.exchangeId);
                        run(previewCancelShiftExchange, data);
                      }}
                    >
                      {tShiftExchange(lang, 'cancelRequest')}
                    </button>
                  ) : exchange.status === 'open' ? (
                    <button
                      type="button"
                      style={pending ? buttonDisabled : buttonPrimary}
                      disabled={pending}
                      onClick={() => {
                        const data = new FormData();
                        data.set('exchangeId', exchange.exchangeId);
                        run(previewAcceptShiftExchange, data);
                      }}
                    >
                      {tShiftExchange(lang, 'acceptShift')}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {recentResults.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{tShiftExchange(lang, 'recentResults')}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {recentResults.map((exchange) => {
                const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
                const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
                const resultLabel =
                  exchange.status === 'approved'
                    ? tShiftExchange(lang, 'resultApproved')
                    : exchange.status === 'rejected'
                      ? tShiftExchange(lang, 'resultRejected')
                      : tShiftExchange(lang, 'resultCancelled');
                return (
                  <div key={exchange.exchangeId} style={{ ...card, marginTop: 0, padding: 10 }}>
                    <strong style={{ fontSize: 13.5 }}>{local ? `${local.workDate} ${local.localTime}` : tShiftExchange(lang, 'shiftFallback')}</strong>
                    <p style={{ margin: '4px 0', fontSize: 12.5 }}>{exchange.reason}</p>
                    <p style={{ ...mutedText, margin: 0, fontSize: 12 }}>{resultLabel}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
