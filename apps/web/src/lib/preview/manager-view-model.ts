import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import type { ManagerAlert, ShiftAssignment, ShiftTypeDef, StaffMember } from '@/lib/demo/cafe/types';

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

/** 要確認 alerts from pending correction requests only - Preview has no staffing-requirements data to derive a shortage alert from (unlike the demo, which hardcodes `STAFFING_REQUIREMENTS`), so no shortage alert is fabricated here. */
export function toManagerViewAlerts(
  pendingCorrectionRequests: WorkforceShiftRequest[],
  staffById: Map<string, WorkforceStaffManageEntry>,
): ManagerAlert[] {
  return pendingCorrectionRequests.map((r) => {
    const staffName = staffById.get(r.employeeId)?.name ?? r.employeeId;
    const message = typeof r.details.message === 'string' && r.details.message ? r.details.message : '勤務時間の修正を依頼しています。';
    return { id: r.requestId, label: `${staffName}（${r.workDate}）: ${message}`, tone: 'danger' as const };
  });
}
