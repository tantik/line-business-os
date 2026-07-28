import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { PreviewStaffSchedule } from './preview-staff-schedule';

export interface PreviewStaffViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  shiftTypes: WorkforceShiftType[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  attendance: WorkforceAttendance[] | null;
  basePath: string;
}

/** Action-free server adapter; interaction lives in a narrow client island. */
export function PreviewStaffView(props: PreviewStaffViewProps) {
  return <PreviewStaffSchedule {...props} />;
}
