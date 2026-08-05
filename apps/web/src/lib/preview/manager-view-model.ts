import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { deriveActiveScheduleWindowCodes, resolveWindowCode, type WindowCode } from '@/lib/workforce/auto-distribute';
import type { ShiftAssignment, ShiftTypeDef, StaffMember } from '@/lib/demo/cafe/types';
import type { Lang } from '@/lib/demo/cafe/i18n';

/**
 * Pure, read-only mappers from the real Workforce data shapes (Supabase rows
 * already loaded by the preview manager page's server loaders) to the shared
 * cafe-manager presentation types (`@/lib/demo/cafe/types`) consumed by
 * `ShiftTable`/`ShiftLegend`/`ManagerAlerts`. No mock data, no fallback
 * values invented here - a `null` loader result must stay `null` all the way
 * through to the presentation layer's own empty/error state, never silently
 * become an empty array that would read as "zero real records".
 */

/** `ShiftTable`/`ShiftLegend` only ever read `id`/`name`/`role` off a staff entry - Preview has no manager-vs-staff role distinction, so every entry maps to the generic `'staff'` role (no "店長" row label, unlike the demo). */
export function toManagerViewStaff(staff: WorkforceStaffManageEntry[]): Pick<StaffMember, 'id' | 'name' | 'role'>[] {
  return staff.map((s) => ({ id: s.staffId, name: s.name, role: 'staff' as const }));
}

export function toManagerViewShiftTypes(shiftTypes: WorkforceShiftType[]): ShiftTypeDef[] {
  return shiftTypes.map((st) => ({
    id: st.shiftTypeId,
    label: st.labelJa || st.labelEn || st.code,
    startTime: st.startsAtLocal,
    endTime: st.endsAtLocal,
  }));
}

/**
 * Localizes each assignment's `startsAt` instant to a tenant-local `workDate`
 * so it lines up with the `dates` columns `ShiftTable` renders. An unassigned
 * shift (`employeeId: null`) has no staff row to attach to in this per-staff
 * grid, so it is dropped here rather than attributed to a fabricated row -
 * the separate `PreviewShiftEditor` list below still shows every assignment,
 * assigned or not.
 */
export function toManagerViewAssignments(assignments: WorkforceShiftAssignment[], timeZone: string): ShiftAssignment[] {
  return assignments
    .filter((a): a is WorkforceShiftAssignment & { employeeId: string } => a.employeeId !== null)
    .map((a) => ({
      staffId: a.employeeId,
      date: utcIsoToLocalDateTime(a.startsAt, timeZone).workDate,
      shiftTypeId: a.shiftTypeId,
    }));
}

/**
 * Client-facing fallback for a staff member whose decrypted name isn't
 * available (loader failure or unknown id) - never the raw employee UUID.
 * Defined here (a plain server-safe module, no `'use client'` dependency)
 * rather than in `i18n.manager.ts`, which pulls in `makeTranslator` from the
 * `'use client'` `i18n.tsx` - importing that from this module would break
 * the Server Component tree that loads `page.tsx` data through here.
 */
export const UNKNOWN_STAFF_NAME_JA = 'スタッフ';
export const UNKNOWN_STAFF_NAME_EN = 'Staff member';

/** Default text applied when a correction request carries no `details.message`, per language. */
export const DEFAULT_CORRECTION_MESSAGE: Record<Lang, string> = {
  ja: '勤務時間の修正を依頼しています。',
  en: 'Requesting an attendance-time correction.',
};

export interface ManagerCorrectionSummary {
  requestId: string;
  workDate: string;
  /** `null` when the staff dataset failed to load or the id is unknown - the caller applies its own lang-correct fallback name, never a value baked in here. */
  staffName: string | null;
  /** `null` when the request carries no `details.message` - the caller applies its own lang-correct default text. */
  message: string | null;
}

/**
 * Raw, unlocalized correction-request summaries for the language-aware Today
 * panel (`PreviewManagerToday`) - the single source of correction-alert data
 * for the preview Manager screen. Never bakes a JA fallback name/message into
 * a string - `page.tsx` is a Server Component with no real client language
 * state, so baking language here could never track the client's actual
 * toggled language. Fallback resolution happens in `PreviewManagerToday`
 * itself, the one place that knows the real `lang`. (A parallel JA-only
 * `toManagerViewAlerts` used to feed the unrelated, currently-hidden
 * `CafeManagerScreen` alerts block with the same domain data baked into
 * Japanese text - removed as a divergent, language-unsafe duplicate of this
 * function rather than given its own `lang` parameter, since nothing renders
 * it.)
 */
export function toManagerCorrectionSummaries(
  pendingCorrectionRequests: WorkforceShiftRequest[],
  staffById: Map<string, WorkforceStaffManageEntry>,
): ManagerCorrectionSummary[] {
  return pendingCorrectionRequests.map((r) => ({
    requestId: r.requestId,
    workDate: r.workDate,
    staffName: staffById.get(r.employeeId)?.name ?? null,
    message: typeof r.details.message === 'string' && r.details.message ? r.details.message : null,
  }));
}

/**
 * `requiredHeadcountByWeekday` index for a given ISO date, Monday-first (`0`
 * = Monday .. `6` = Sunday) - the same convention `WEEKDAY_LABELS_MON_FIRST`/
 * `weekdayIndexMonFirst` (`@/lib/demo/cafe/format`) and `getWeekPeriod`
 * (`@/lib/workforce/period`) use for this array elsewhere in the app. Built
 * from `Date.UTC` on the parsed y/m/d components (never a bare `new
 * Date(iso)`/host-timezone-dependent parse), so the weekday is derived purely
 * from the calendar date string itself - correct regardless of which
 * timezone the process happens to run in.
 */
function weekdayIndexMonFirstFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay(); // 0 = Sun .. 6 = Sat
  return jsDay === 0 ? 6 : jsDay - 1; // 0 = Mon .. 6 = Sun
}

/**
 * Real staffing-shortage date set for the Manager シフト表 "!" column
 * indicator: a date is flagged when any of its real active shift windows
 * (AM/PM/etc., per `deriveActiveScheduleWindowCodes`) has fewer assigned
 * staff than `requiredHeadcountByWeekday` (Founder's 2026-08-05 decision:
 * the same per-weekday headcount applies to every active window). Each
 * date's required headcount is looked up by its own actual weekday
 * (`weekdayIndexMonFirstFromIsoDate`), never by its position in `dates` -
 * `dates` happens to be periodStart-ordered Monday..Sunday for every current
 * caller, but nothing in this function's signature enforces that, and a
 * positional lookup would silently score the wrong requirement for any
 * partial or reordered date array. A tenant with zero active windows yields
 * no shortage dates at all - there is no real window to be short against.
 */
export function computeManagerShortageDateSet(
  dates: readonly string[],
  assignments: readonly ShiftAssignment[],
  shiftTypes: readonly WorkforceShiftType[],
  requiredHeadcountByWeekday: readonly number[],
): Set<string> {
  const activeWindowCodes = deriveActiveScheduleWindowCodes(shiftTypes);
  if (activeWindowCodes.length === 0) return new Set();

  // All shift types by id - not just active ones. `activeWindowCodes` above
  // already restricts which windows are scored for shortage; this map is
  // only used to resolve an *existing* assignment's window so it still
  // counts toward that window's filled headcount even if its shift type was
  // deactivated after the assignment was made. Dropping it here would
  // undercount real, already-working staff and flag a shortage that isn't
  // real.
  const shiftTypeById = new Map(shiftTypes.map((st) => [st.shiftTypeId, st]));

  const shortageDates = new Set<string>();
  dates.forEach((date) => {
    const required = requiredHeadcountByWeekday[weekdayIndexMonFirstFromIsoDate(date)] ?? 0;
    const assignedByWindow = new Map<WindowCode, number>();
    for (const assignment of assignments) {
      if (assignment.date !== date || !assignment.shiftTypeId) continue;
      const shiftType = shiftTypeById.get(assignment.shiftTypeId);
      if (!shiftType) continue;
      const windowCode = resolveWindowCode(shiftType.code);
      if (!windowCode) continue;
      assignedByWindow.set(windowCode, (assignedByWindow.get(windowCode) ?? 0) + 1);
    }
    const hasShortage = activeWindowCodes.some((windowCode) => (assignedByWindow.get(windowCode) ?? 0) < required);
    if (hasShortage) shortageDates.add(date);
  });
  return shortageDates;
}
