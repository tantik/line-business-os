import type { WindowCode } from '@/lib/workforce/auto-distribute';
import type { RunAutoDistributionRequirementInput } from '@/lib/workforce/schedule-input';

/**
 * Phase 1N-4C Slice B2a (post-review fix) - pure helper turning the manager's
 * staffing-requirement rows (raw string form-field values, as a
 * `'use client'` island collects them) into the validated
 * `RunAutoDistributionRequirementInput[]` shape `previewRunAutoDistribution`
 * forwards to the existing, unchanged `autoDistribute()` algorithm.
 *
 * WHY this exists: `autoDistribute()` only creates a windowed-shift-type
 * draft assignment when the required headcount for that (date, windowCode)
 * exceeds the already-preserved headcount (`auto-distribute.ts`, the
 * windowed fill loop's `filled >= required` check) - an empty
 * `staffingRequirements` array makes `required` default to `0` for every
 * window, so `filled >= required` (0 >= 0) is immediately true and every
 * windowed preference is reported `unplaced` with reason
 * `no_staffing_requirement`, producing zero draft assignments. Confirmed
 * empirically against the real algorithm during review. The preview button
 * must therefore always send at least one real requirement row - this
 * module is the smallest safe way to collect one without inventing a hidden
 * default headcount the manager never specified.
 *
 * No I/O, no `server-only`/`'use client'` import - usable from both the
 * client island (to build the payload) and `node:test` (to verify the
 * filtering/validation logic) without a DOM.
 */
export interface StaffingRequirementRowInput {
  /** Raw `<input type="date">` value, or blank/invalid. */
  workDate: string;
  /** Raw `<select>` value - blank means "not yet chosen" (dropped, never guessed). */
  windowCode: string;
  /** Raw `<input type="number">` value as a string. */
  requiredHeadcount: string;
}

const KNOWN_WINDOW_CODES: ReadonlySet<string> = new Set(['ALL', 'AM', 'PM', 'A-P', 'SHORT_AM']);
const MAX_REQUIRED_HEADCOUNT = 100;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseRow(row: StaffingRequirementRowInput): RunAutoDistributionRequirementInput | null {
  if (!ISO_DATE_PATTERN.test(row.workDate)) return null;
  // Reject a syntactically-shaped but non-existent calendar date (e.g. 2026-02-30).
  if (new Date(`${row.workDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== row.workDate) return null;

  const windowCode = row.windowCode.trim().toUpperCase();
  if (!KNOWN_WINDOW_CODES.has(windowCode)) return null;

  const requiredHeadcount = Number.parseInt(row.requiredHeadcount, 10);
  if (!Number.isInteger(requiredHeadcount) || requiredHeadcount < 0 || requiredHeadcount > MAX_REQUIRED_HEADCOUNT) return null;
  if (String(requiredHeadcount) !== row.requiredHeadcount.trim()) return null;

  return { workDate: row.workDate, windowCode: windowCode as WindowCode, requiredHeadcount };
}

/**
 * Filters `rows` down to only the well-formed ones (a blank/incomplete row a
 * manager hasn't finished filling in is silently dropped, never guessed at
 * or defaulted) and maps each to the shape the existing
 * `parseRunAutoDistributionInput`/`autoDistribute()` contract expects.
 *
 * An empty result (every row was blank/invalid, or `rows` itself was empty)
 * is a legitimate, expected outcome the caller must check for - see
 * `previewRunAutoDistribution`, which rejects it with `invalid_input` rather
 * than forwarding a request that can only ever produce a no-op for windowed
 * shift types.
 */
export function buildStaffingRequirements(rows: StaffingRequirementRowInput[]): RunAutoDistributionRequirementInput[] {
  const result: RunAutoDistributionRequirementInput[] = [];
  for (const row of rows) {
    const parsed = parseRow(row);
    if (parsed) result.push(parsed);
  }
  return result;
}

/**
 * A validated `requiredHeadcount: 0` row is legitimate on its own (it
 * expresses "no one is needed for this window"), but a request whose
 * *every* row is zero can never produce a draft assignment for any windowed
 * shift type either (the fill loop's `filled >= required` check is
 * immediately true for a required value of 0, exactly like the empty-array
 * case). At least one validated requirement must have `requiredHeadcount > 0`
 * before auto-distribution is worth running at all.
 *
 * Used identically by the client island (to decide whether to call the
 * Server Action) and the Server Action itself (as the authoritative,
 * post-parse check) - one rule, one place.
 */
export function hasPositiveHeadcount(requirements: readonly { requiredHeadcount: number }[]): boolean {
  return requirements.some((r) => r.requiredHeadcount > 0);
}

/**
 * Coarse, pre-validation check on the Server Action's raw `unknown` input,
 * deliberately run before any tenant/module/location resolution or Supabase
 * call. Not the authoritative parser (`parseRunAutoDistributionInput` +
 * `hasPositiveHeadcount` remain that, run after full parsing) - this exists
 * only so a request that could not possibly do real work (no
 * `staffingRequirements` array, or every entry's `requiredHeadcount` is
 * non-positive) is rejected before doing any work at all, not merely before
 * calling the algorithm.
 */
export function rawInputHasPositiveRequirement(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const staffingRequirements = (input as Record<string, unknown>).staffingRequirements;
  if (!Array.isArray(staffingRequirements)) return false;
  return staffingRequirements.some((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const headcount = (item as Record<string, unknown>).requiredHeadcount;
    return typeof headcount === 'number' && headcount > 0;
  });
}
