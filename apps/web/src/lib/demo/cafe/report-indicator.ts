import type { WorkReport } from './types';

type IndicatorReport = Pick<WorkReport, 'hasCorrectionRequest' | 'correctionRequest' | 'message'>;

/**
 * The cell marker means that the manager still needs to act.
 * A decided correction remains visible in its report, but no longer keeps the
 * red exclamation mark on the schedule.
 */
export function reportNeedsManagerAttention(report: IndicatorReport | undefined): boolean {
  if (!report) return false;
  if (report.hasCorrectionRequest) {
    return (report.correctionRequest?.status ?? 'pending') === 'pending';
  }
  return Boolean(report.message);
}
