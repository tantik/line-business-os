import type { NonSubmitter, Shortage, UnplacedEmployee } from './auto-distribute';

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
