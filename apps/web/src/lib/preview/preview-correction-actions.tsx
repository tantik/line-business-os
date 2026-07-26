'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewDecideCorrectionRequest } from './actions/attendance-actions';
import { previewWriteMessageJa, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';

/**
 * Phase 1N-4C Slice B2a - preview-specific manager client island for
 * correction-request approve/reject. Calls only
 * `previewDecideCorrectionRequest` (never the dashboard `attendance-actions.ts`).
 * `requestId` is the only client-supplied identifier - a legitimate
 * target-record id, re-verified server-side against the strict tenant and
 * resolved location before the decision is written.
 */
export interface PreviewCorrectionActionsProps {
  pendingRequests: WorkforceShiftRequest[];
  staff: WorkforceStaffManageEntry[] | null;
}

function toFeedback(result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: '対応しました。' };
  return { ok: false, text: previewWriteMessageJa(result.status) };
}

export function PreviewCorrectionActions({ pendingRequests, staff }: PreviewCorrectionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function handleDecide(requestId: string, decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('decision', decision);
      const result = await previewDecideCorrectionRequest(formData);
      setFeedback(toFeedback(result));
      if (result.status === 'success') router.refresh();
    });
  }

  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));

  if (pendingRequests.length === 0) {
    return (
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>修正申請への対応</h2>
        <p style={{ marginTop: 8, ...mutedText }}>対応が必要な修正申請はありません。</p>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>修正申請への対応</h2>
      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>スタッフ</th>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>日付</th>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>内容</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pendingRequests.map((r) => (
            <tr key={r.requestId}>
              <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? '-'}</td>
              <td style={tableCell}>{r.workDate}</td>
              <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : '-'}</td>
              <td style={{ ...tableCell, display: 'flex', gap: 6 }}>
                <button type="button" style={buttonPrimary} onClick={() => handleDecide(r.requestId, 'approved')} disabled={isPending}>
                  承認
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => handleDecide(r.requestId, 'rejected')}
                  disabled={isPending}
                >
                  却下
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : '#F87171' }}>{feedback.text}</p> : null}
    </section>
  );
}
