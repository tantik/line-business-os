'use client';

import { useEffect, useRef, useState } from 'react';
import { PreviewManagerToday, type PreviewManagerTodayProps } from './preview-manager-today';
import { previewGetManagerTodaySignals } from './actions/today-signals-actions';
import type { ManagerCorrectionSummary } from './manager-view-model';

/**
 * Staff→Manager live-sync poll interval (Founder P1, 2026-08-13, Contract
 * 3). Deliberately targeted (pending corrections + pending exchanges only,
 * `previewGetManagerTodaySignals`), never a full page reload/router refresh -
 * meets the ~1-3s propagation target without refreshing Inventory/Staff/
 * Recipes/Schedule state this panel doesn't own.
 */
const TODAY_SIGNALS_POLL_INTERVAL_MS = 2500;

export interface PreviewManagerLiveTodayProps
  extends Omit<PreviewManagerTodayProps, 'pendingCorrections' | 'pendingExchanges' | 'correctionSummaries'> {
  initialPendingCorrections: number;
  initialPendingExchanges: number;
  initialCorrectionSummaries: ManagerCorrectionSummary[];
  /** Real decrypted names, already resolved server-side for this Manager session - a poll response only ever carries `employeeId`, never a name (see `today-signals-actions.ts`), so this map resolves the display name for any newly-seen pending correction. */
  staffNameById: Record<string, string>;
}

/**
 * `'use client'` wrapper that owns a live-polled copy of just the
 * corrections/exchanges signals `PreviewManagerToday` renders, so a
 * Staff-submitted correction request appears here automatically while the
 * Manager tab stays open - the rest of the page (Inventory, Schedule grid,
 * Staff/Recipes management) is untouched and keeps its own existing
 * refresh/no-refresh behavior.
 */
export function PreviewManagerLiveToday({
  initialPendingCorrections,
  initialPendingExchanges,
  initialCorrectionSummaries,
  staffNameById,
  ...rest
}: PreviewManagerLiveTodayProps) {
  const [pendingCorrections, setPendingCorrections] = useState(initialPendingCorrections);
  const [pendingExchanges, setPendingExchanges] = useState(initialPendingExchanges);
  const [correctionSummaries, setCorrectionSummaries] = useState(initialCorrectionSummaries);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (inFlightRef.current || document.visibilityState !== 'visible') return;
      inFlightRef.current = true;
      try {
        const result = await previewGetManagerTodaySignals();
        if (cancelled || result.status !== 'success') return;
        setPendingCorrections(result.data.pendingCorrections.length);
        setPendingExchanges(result.data.pendingExchangeCount);
        setCorrectionSummaries(
          result.data.pendingCorrections.map((r) => ({
            requestId: r.requestId,
            workDate: r.workDate,
            staffName: staffNameById[r.employeeId] ?? null,
            message: r.message,
          })),
        );
      } finally {
        inFlightRef.current = false;
      }
    };
    const id = setInterval(poll, TODAY_SIGNALS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [staffNameById]);

  return (
    <PreviewManagerToday
      {...rest}
      pendingCorrections={pendingCorrections}
      pendingExchanges={pendingExchanges}
      correctionSummaries={correctionSummaries}
    />
  );
}
