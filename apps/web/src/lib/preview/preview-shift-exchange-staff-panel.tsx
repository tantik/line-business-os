'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { useLang } from '@/lib/demo/cafe/i18n';
import { buttonDisabled, buttonPrimary, buttonSecondary, card, input, mutedText } from '@/lib/demo/cafe/theme';
import {
  previewAcceptShiftExchange,
  previewCancelShiftExchange,
  previewRequestShiftExchange,
} from './actions/shift-exchange-actions';
import { previewWriteMessage } from './write-result';

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
  const futureOwn = assignments.filter(
    (shift) => shift.published && shift.employeeId === employeeId && new Date(shift.startsAt).getTime() > Date.now(),
  );
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
    <section style={{ ...card, marginTop: 18 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{lang === 'ja' ? 'シフト交換' : 'Shift exchange'}</h2>
      <p style={{ ...mutedText, margin: '4px 0 10px', fontSize: 12 }}>
        {lang === 'ja'
          ? '出勤できないシフトを公開し、代わりのスタッフを募集できます。最終変更は店長が承認します。'
          : 'Offer a shift you cannot work. A colleague may accept it; the manager makes the final approval.'}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(previewRequestShiftExchange, new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
        style={{ display: 'grid', gap: 8, maxWidth: 520 }}
      >
        <select name="shiftId" style={input} required defaultValue="">
          <option value="" disabled>
            {lang === 'ja' ? '交換するシフトを選択' : 'Select a shift'}
          </option>
          {futureOwn.map((shift) => {
            const local = utcIsoToLocalDateTime(shift.startsAt, timeZone);
            return (
              <option key={shift.assignmentId} value={shift.assignmentId}>
                {local.workDate} {local.localTime}
              </option>
            );
          })}
        </select>
        <textarea
          name="reason"
          style={{ ...input, minHeight: 68 }}
          maxLength={500}
          required
          placeholder={lang === 'ja' ? '理由（店長と候補スタッフに表示されます）' : 'Reason (visible to manager and candidates)'}
        />
        <button type="submit" style={pending ? buttonDisabled : buttonPrimary} disabled={pending || futureOwn.length === 0}>
          {lang === 'ja' ? '交換を依頼' : 'Request exchange'}
        </button>
      </form>

      {feedback ? <p style={{ color: '#B42318', fontSize: 12 }}>{feedback}</p> : null}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {active.map((exchange) => {
          const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
          const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
          const own = exchange.requesterEmployeeId === employeeId;
          return (
            <div key={exchange.exchangeId} style={{ ...card, padding: 12 }}>
              <strong>{local ? `${local.workDate} ${local.localTime}` : lang === 'ja' ? '対象シフト' : 'Shift'}</strong>
              <p style={{ margin: '4px 0', fontSize: 13 }}>{exchange.reason}</p>
              <p style={{ ...mutedText, margin: '4px 0', fontSize: 12 }}>
                {exchange.status === 'accepted'
                  ? lang === 'ja'
                    ? '候補者が承諾済み・店長確認待ち'
                    : 'Accepted by a colleague; awaiting manager'
                  : own
                    ? lang === 'ja'
                      ? '候補者を募集中'
                      : 'Waiting for a colleague'
                    : lang === 'ja'
                      ? '交換可能'
                      : 'Available to accept'}
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
                  {lang === 'ja' ? '依頼を取消' : 'Cancel request'}
                </button>
              ) : exchange.status === 'open' ? (
                <button
                  type="button"
                  style={buttonPrimary}
                  disabled={pending}
                  onClick={() => {
                    const data = new FormData();
                    data.set('exchangeId', exchange.exchangeId);
                    run(previewAcceptShiftExchange, data);
                  }}
                >
                  {lang === 'ja' ? '代わりに出勤する' : 'Accept this shift'}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {recentResults.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>
            {lang === 'ja' ? '最近の結果' : 'Recent results'}
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {recentResults.map((exchange) => {
              const shift = assignments.find((item) => item.assignmentId === exchange.shiftId);
              const local = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
              const resultLabel =
                exchange.status === 'approved'
                  ? lang === 'ja'
                    ? '承認済み — シフトを更新しました'
                    : 'Approved — schedule updated'
                  : exchange.status === 'rejected'
                    ? lang === 'ja'
                      ? '却下されました'
                      : 'Rejected'
                    : lang === 'ja'
                      ? '取り消しました'
                      : 'Cancelled';
              return (
                <div key={exchange.exchangeId} style={{ ...card, padding: 12 }}>
                  <strong>
                    {local ? `${local.workDate} ${local.localTime}` : lang === 'ja' ? '対象シフト' : 'Shift'}
                  </strong>
                  <p style={{ margin: '4px 0', fontSize: 13 }}>{exchange.reason}</p>
                  <p style={{ ...mutedText, margin: 0, fontSize: 12 }}>{resultLabel}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
