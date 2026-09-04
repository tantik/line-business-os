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
  /** Draft assignments made for an employee with no submitted preference for that date at all (fallback placement) -- see `auto-distribute.ts`'s `AutoDistributeResult.assignedWithoutPreference`. */
  assignedWithoutPreference: { employeeId: string; workDate: string; shiftTypeId: string }[];
  /** Manual/published assignments preserved untouched by this run (never overwritten, never regenerated) -- counted, not detailed, for the Manager result summary. */
  preservedCount: number;
  draftCount: number;
  /** Every assignment id this run just inserted -- lets the client offer a same-session "Undo" without a separate query. Empty when draftCount is 0. */
  createdAssignmentIds: string[];
  /**
   * The real target date range this run actually touched, after the
   * server-side historical-immutability clamp (never before "today" in the
   * location's own timezone) -- always show this to the Manager rather than
   * making them do date math against whatever range they requested.
   */
  effectivePeriodStart: string;
  effectivePeriodEnd: string;
}

/**
 * Why the canonical `runAutoDistribution` refused to run, when the refusal is
 * a configuration/state problem the manager can fix rather than a transient
 * error:
 *   - `no_active_windows`: the resolved location has no active shift type at
 *     all.
 *   - `no_staffing_requirement`: every weekday's "required staff per shift"
 *     setting is 0, so a run could only ever be a no-op.
 *   - `period_in_past`: the requested period is entirely before "today" in
 *     the location's own timezone -- past shifts are immutable, so there is
 *     nothing left to regenerate.
 *
 * A period spanning a calendar-month boundary (the displayed week can
 * straddle two months) is NOT an error -- `runAutoDistribution` splits it
 * into one engine run per calendar month internally so the hour cap is
 * still evaluated correctly per month, and merges the results.
 *
 * A re-run for a period that already has an unconfirmed proposal is NOT an
 * error: `runAutoDistribution` clears that proposal first and replaces it.
 */
export type RunAutoDistributionInvalidConfigReason =
  | 'no_active_windows'
  | 'no_staffing_requirement'
  | 'period_in_past';

export type RunAutoDistributionActionOutcome =
  | WorkforceWriteResult<RunAutoDistributionActionResult>
  | { status: 'invalid_config'; reason: RunAutoDistributionInvalidConfigReason };
