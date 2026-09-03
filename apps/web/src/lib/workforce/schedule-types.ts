import type { NonSubmitter, Shortage, UnplacedEmployee } from './auto-distribute';
import type { WorkforceWriteResult } from './result-types';

/**
 * Kept out of `schedule-actions.ts`: a `'use server'` file may only export
 * async functions (Next.js constraint), so any shared type used by its
 * actions' return values lives here instead.
 */
export interface RunAutoDistributionActionResult {
  shortages: Shortage[];
  unplaced: UnplacedEmployee[];
  nonSubmitters: NonSubmitter[];
  draftCount: number;
  /** Every assignment id this run just inserted -- lets the client offer a same-session "Undo" without a separate query. Empty when draftCount is 0. */
  createdAssignmentIds: string[];
}

/**
 * Why the canonical `runAutoDistribution` refused to run, when the refusal is
 * a configuration/state problem the manager can fix rather than a transient
 * error:
 *   - `no_active_windows`: the resolved location has no active shift type
 *     that maps to a staffing window (AM/PM/ALL/A-P/SHORT_AM).
 *   - `no_staffing_requirement`: every weekday's "required staff per shift"
 *     setting is 0, so a run could only ever be a no-op.
 *
 * A re-run for a week that already has an unconfirmed proposal is NOT an
 * error: `runAutoDistribution` clears that proposal first and replaces it.
 */
export type RunAutoDistributionInvalidConfigReason = 'no_active_windows' | 'no_staffing_requirement';

export type RunAutoDistributionActionOutcome =
  | WorkforceWriteResult<RunAutoDistributionActionResult>
  | { status: 'invalid_config'; reason: RunAutoDistributionInvalidConfigReason };
