import type { AutoDistributeStaffingRequirement } from './auto-distribute';

/**
 * Server-authority helper for the canonical Manager "auto-create schedule"
 * workflow. Pure: no I/O, no `'use server'`/`'use client'`, unit-testable
 * with plain values.
 *
 * `autoDistribute()` only ever fills a shift type when that (weekday,
 * shiftTypeId) has a positive `requiredHeadcount`. The canonical Server
 * Action must therefore build the staffing-requirement matrix itself, from
 * the tenant/location's own ACTIVE shift types + stored schedule settings,
 * and never trust a client-supplied requirement array. This is the single
 * source of truth for that matrix -- `previewRunAutoDistribution` uses it
 * too, so the preview demo surface and the canonical Manager surface derive
 * requirements identically.
 *
 * Re-keyed from `WindowCode` to `shiftTypeId` (2026-09-04, Auto Scheduling
 * completion mission): the previous version only emitted a row for a shift
 * type whose `code` resolved to one of a small hardcoded alias set
 * (AM/PM/A-P/SHORT_AM/KONS). Every real Manager-created shift type is
 * persisted with `code: CUSTOM_<timestamp>` (`upsertWorkforceShiftType`),
 * which never resolved -- so a tenant whose shift types were all
 * Manager-created got an EMPTY requirement matrix regardless of Settings,
 * surfacing as "No active shift types are set for this location yet." even
 * though Settings visibly showed active shift types. Keying by `shiftTypeId`
 * directly means every active shift type, windowed-code or not, gets a
 * requirement row.
 *
 * One row per (weekday 0-6 x active shift type), carrying that weekday's
 * configured headcount -- `workforce_schedule_settings.required_headcount_by_weekday`
 * remains a flat `number[7]` (one headcount per weekday, applied uniformly
 * across every active shift type at the location); no schema/migration
 * change was needed for this fix.
 */
const ALL_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export function buildAuthoritativeStaffingRequirements(
  activeShiftTypeIds: readonly string[],
  requiredHeadcountByWeekday: number[] | null | undefined,
): AutoDistributeStaffingRequirement[] {
  if (activeShiftTypeIds.length === 0) return [];

  const headcounts = requiredHeadcountByWeekday ?? [0, 0, 0, 0, 0, 0, 0];
  const requirements: AutoDistributeStaffingRequirement[] = [];
  for (const weekday of ALL_WEEKDAYS) {
    const requiredHeadcount = headcounts[weekday] ?? 0;
    for (const shiftTypeId of activeShiftTypeIds) {
      requirements.push({ weekday, shiftTypeId, requiredHeadcount });
    }
  }
  return requirements;
}

/** At least one (weekday, shiftType) requires someone -- otherwise a run can only ever be a no-op. */
export function hasPositiveStaffingRequirement(
  requirements: readonly { requiredHeadcount: number }[],
): boolean {
  return requirements.some((requirement) => requirement.requiredHeadcount > 0);
}
