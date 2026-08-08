'use client';

import { useTransition, useState } from 'react';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import { previewDecideCorrectionRequest } from './actions/attendance-actions';
import { previewWriteMessage, type PreviewWriteResult } from './write-result';
import { buttonPrimary, buttonSecondary, card, demoColors, mutedText, tableCell, tableHeaderCell } from '@/lib/demo/cafe/theme';
import { useLang, type Lang } from '@/lib/demo/cafe/i18n';
import { tManager } from '@/lib/demo/cafe/i18n.manager';
import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';

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
  // FA-03: Approve/Reject must go through an explicit confirmation boundary
  // rather than mutating on the first click - `pendingDecision` holds the
  // request/decision the manager is about to confirm; the mutation itself
  // only ever runs from `handleDecide`, called exclusively by the dialog's
  // own `onConfirm` below, never directly from the table row buttons.
  const [pendingDecision, setPendingDecision] = useState<{ requestId: string; decision: 'approved' | 'rejected' } | null>(null);

  function handleDecide(requestId: string, decision: 'approved' | 'rejected') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('decision', decision);
      const result = await previewDecideCorrectionRequest(formData);
      setFeedback(toFeedback(lang, result));
      // Closed only on success (same convention as the Inventory
      // deactivate/permanent-delete confirmations) - a server failure keeps
      // the dialog open with the error shown in place, so a successful
      // decision is never implied when the mutation did not actually apply.
      if (result.status === 'success') {
        setPendingDecision(null);
        await onDecided();
      }
    });
  }

  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const confirmTarget = pendingDecision ? pendingRequests.find((r) => r.requestId === pendingDecision.requestId) ?? null : null;

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
                <button
                  type="button"
                  style={buttonPrimary}
                  onClick={() => setPendingDecision({ requestId: r.requestId, decision: 'approved' })}
                  disabled={isPending}
                >
                  {t('approve')}
                </button>
                <button
                  type="button"
                  style={buttonSecondary}
                  onClick={() => setPendingDecision({ requestId: r.requestId, decision: 'rejected' })}
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

      {pendingDecision && confirmTarget ? (
        <ConfirmDialog
          open
          title={pendingDecision.decision === 'approved' ? t('confirmApproveTitle') : t('confirmRejectTitle')}
          confirmLabel={pendingDecision.decision === 'approved' ? t('approve') : t('reject')}
          cancelLabel={t('cancel')}
          pending={isPending}
          danger={pendingDecision.decision === 'rejected'}
          onCancel={() => setPendingDecision(null)}
          onConfirm={() => handleDecide(confirmTarget.requestId, pendingDecision.decision)}
        >
          <p style={{ margin: 0 }}>
            <strong>{t('confirmDecisionStaffLabel')}:</strong> {staffById.get(confirmTarget.employeeId)?.name ?? t('dash')}
          </p>
          <p style={{ margin: '4px 0 0' }}>
            <strong>{t('confirmDecisionDateLabel')}:</strong> {confirmTarget.workDate}
          </p>
          <p style={{ margin: '4px 0 0' }}>
            <strong>{t('confirmDecisionDetailsLabel')}:</strong>{' '}
            {typeof confirmTarget.details.message === 'string' ? confirmTarget.details.message : t('dash')}
          </p>
          <p style={{ margin: '8px 0 0' }}>
            {pendingDecision.decision === 'approved' ? t('confirmApproveConsequence') : t('confirmRejectConsequence')}
          </p>
          {feedback && !feedback.ok ? (
            <p style={{ margin: '10px 0 0', color: demoColors.dangerText, fontSize: 12 }}>{feedback.text}</p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
