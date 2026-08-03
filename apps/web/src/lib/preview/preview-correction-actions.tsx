'use client';

import { useTransition, useState } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewDecideCorrectionRequest } from './actions/attendance-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, demoColors, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';

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
  /**
   * Called after a successful approve/reject so the caller
   * (`PreviewCorrectionRequestsPanel`) can re-fetch via
   * `previewGetCorrectionRequestsManagerData()` - never `router.refresh()`.
   * Owned by that parent (not by this component) because the shared `Modal`
   * unmounts this component on close; state owned here would be silently
   * discarded every time the dialog closes. Preview Manager architecture,
   * perf phase 3.
   */
  onDecided: () => Promise<void>;
}

function toFeedback(lang: Lang, result: PreviewWriteResult<unknown>): { ok: boolean; text: string } {
  if (result.status === 'success') return { ok: true, text: tManager(lang, 'respondedFeedback') };
  return { ok: false, text: previewWriteMessage(lang, result.status) };
}

export function PreviewCorrectionActions({ pendingRequests, staff, onDecided }: PreviewCorrectionActionsProps) {
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManager>[1]) => tManager(lang, key);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function handleDecide(requestId: string, decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('decision', decision);
      const result = await previewDecideCorrectionRequest(formData);
      setFeedback(toFeedback(lang, result));
      if (result.status === 'success') await onDecided();
    });
  }

  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));

  if (pendingRequests.length === 0) {
    return (
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('correctionRequestsModalTitle')}</h2>
        <p style={{ marginTop: 8, ...mutedText }}>{t('noPendingCorrections')}</p>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{t('correctionRequestsModalTitle')}</h2>
      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('staffColumn')}</th>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('dateColumnShort')}</th>
            <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('contentColumn')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {pendingRequests.map((r) => (
            <tr key={r.requestId}>
              <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? t('dash')}</td>
              <td style={tableCell}>{r.workDate}</td>
              <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : t('dash')}</td>
              <td style={{ ...tableCell, display: 'flex', gap: 6 }}>
                <button type="button" style={buttonPrimary} onClick={() => handleDecide(r.requestId, 'approved')} disabled={isPending}>
                  {t('approve')}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => handleDecide(r.requestId, 'rejected')}
                  disabled={isPending}
                >
                  {t('reject')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {feedback ? <p style={{ marginTop: 12, color: feedback.ok ? undefined : demoColors.dangerText }}>{feedback.text}</p> : null}
    </section>
  );
}
