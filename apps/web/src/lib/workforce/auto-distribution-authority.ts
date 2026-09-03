import type { AutoDistributeStaffingRequirement, WindowCode } from './auto-distribute';

/**
 * Server-authority helper for the canonical Manager "auto-create schedule"
 * workflow. Pure: no I/O, no `'use server'`/`'use client'`, unit-testable
 * with plain values.
 *
 * `autoDistribute()` only ever fills a windowed shift type when that
 * (weekday, windowCode) has a positive `requiredHeadcount`. The canonical
 * Server Action must therefore build the staffing-requirement matrix itself,
 * from the tenant/location's own active windows + stored schedule settings,
 * and never trust a client-supplied requirement array. This is the single
 * source of truth for that matrix -- `previewRunAutoDistribution` uses it
 * too, so the preview demo surface and the canonical Manager surface derive
 * requirements identically.
 *
 * One row per (weekday 0-6 x active window code), carrying that weekday's
 * configured headcount. `weekday` follows `Date#getUTCDay()` (0 = Sunday),
 * matching `AutoDistributeStaffingRequirement`.
 */
const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export function buildAuthoritativeStaffingRequirements(
  activeWindowCodes: readonly WindowCode[],
  requiredHeadcountByWeekday: number[] | null | undefined,
): AutoDistributeStaffingRequirement[] {
  if (activeWindowCodes.length === 0) return [];

  const headcounts = requiredHeadcountByWeekday ?? [0, 0, 0, 0, 0, 0, 0];
  const requirements: AutoDistributeStaffingRequirement[] = [];
  for (const weekday of ALL_WEEKDAYS) {
    const requiredHeadcount = headcounts[weekday] ?? 0;
    for (const windowCode of activeWindowCodes) {
      requirements.push({ weekday, windowCode, requiredHeadcount });
    }
  }
  return requirements;
}

/** At least one (weekday, window) requires someone -- otherwise a run can only ever be a no-op for every windowed shift type. */
export function hasPositiveStaffingRequirement(
  requirements: readonly { requiredHeadcount: number }[],
): boolean {
  return requirements.some((requirement) => requirement.requiredHeadcount > 0);
}
