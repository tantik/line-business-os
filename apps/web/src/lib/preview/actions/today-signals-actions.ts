'use server';

import { listShiftRequestsForManager } from '@/lib/workforce/shift-requests';
import { listShiftExchanges } from '@/lib/workforce/shift-exchanges';
import { resolvePreviewManagerContext } from './authorize';
import { mapWorkforceWriteResult, type PreviewWriteResult } from '../write-result';

/**
 * Staff→Manager live-sync poll target (Founder P1, 2026-08-13, Contract 3).
 * Deliberately its own file, not colocated with `schedule-actions.ts` -
 * matches the existing convention (see `staff-schedule-actions.ts`'s doc
 * comment) of one `'use server'` module per bundle registration concern; this
 * one is manager-only, so it is safe to share a file with other manager
 * actions, but is kept separate here since it powers a background poll
 * (`PreviewManagerLiveToday`) rather than a form submission, and returns read
 * data shaped for that one caller.
 *
 * Returns only what `PreviewManagerToday`'s pending-corrections/pending-
 * exchanges tiles need - never staff names (the caller already holds the
 * full, real-name roster client-side from the initial page load and resolves
 * `staffName` itself) and never PII beyond what the existing
 * `toManagerCorrectionSummaries` mapping already sends to this same client
 * today.
 */
export interface PreviewManagerTodaySignals {
  pendingCorrections: { requestId: string; workDate: string; employeeId: string; message: string | null }[];
  pendingExchangeCount: number;
}

export async function previewGetManagerTodaySignals(): Promise<PreviewWriteResult<PreviewManagerTodaySignals>> {
  const contextResult = await resolvePreviewManagerContext('workforce.shift.write');
  if (contextResult.status !== 'ok') return contextResult.result;
  const { supabase, tenantId, locationId } = contextResult.context;

  const [correctionsResult, exchangesResult] = await Promise.all([
    listShiftRequestsForManager(supabase, tenantId, { kind: 'correction' }),
    listShiftExchanges(supabase, tenantId, locationId),
  ]);
  if (correctionsResult.status !== 'success') return mapWorkforceWriteResult(correctionsResult);
  if (exchangesResult.status !== 'success') return mapWorkforceWriteResult(exchangesResult);

  const pending = correctionsResult.data.filter((r) => r.status === 'pending');
  return {
    status: 'success',
    data: {
      pendingCorrections: pending.map((r) => ({
        requestId: r.requestId,
        workDate: r.workDate,
        employeeId: r.employeeId,
        message: typeof r.details.message === 'string' && r.details.message ? r.details.message : null,
      })),
      pendingExchangeCount: exchangesResult.data.filter((e) => e.status === 'open' || e.status === 'accepted').length,
    },
  };
}
