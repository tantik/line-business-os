import Link from 'next/link';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { CafeStaffScheduleCard } from '@/components/demo/cafe/CafeStaffPresentation';
import type { ShiftAssignment, ShiftTypeDef } from '@/lib/demo/cafe/types';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { buttonDisabled, buttonSecondary, demoColors, mutedText } from '@/lib/demo/cafe/theme';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';

export interface PreviewStaffViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  shiftTypes: WorkforceShiftType[] | null;
  /** Already narrowed server-side to this caller's own published assignments. */
  assignments: WorkforceShiftAssignment[] | null;
  /** Public preview route base, used for week navigation only. */
  basePath: string;
}

function dateRange(periodStart: string, periodEnd: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function hoursBetween(startsAtLocal: string, endsAtLocal: string): number {
  const [startH = 0, startM = 0] = startsAtLocal.split(':').map(Number);
  const [endH = 0, endM = 0] = endsAtLocal.split(':').map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

/**
 * Real-data adapter for the same compact schedule presentation used by Demo.
 * It intentionally supplies one staff row only: visual parity never widens
 * the authenticated staff member's RLS-scoped data access.
 */
export function PreviewStaffView({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  shiftTypes,
  assignments,
  basePath,
}: PreviewStaffViewProps) {
  const dates = dateRange(periodStart, periodEnd);
  const displayShiftTypes: ShiftTypeDef[] = (shiftTypes ?? []).map((shiftType) => ({
    id: shiftType.shiftTypeId,
    label: shiftType.code,
    startTime: shiftType.startsAtLocal.slice(0, 5),
    endTime: shiftType.endsAtLocal.slice(0, 5),
    isCustom: shiftType.isCustom,
  }));

  const displayAssignments: ShiftAssignment[] = [];
  let weeklyHours = 0;
  for (const assignment of assignments ?? []) {
    if (!assignment.published || assignment.employeeId !== profile.staffId) continue;
    const start = utcIsoToLocalDateTime(assignment.startsAt, timeZone);
    const end = utcIsoToLocalDateTime(assignment.endsAt, timeZone);
    if (!dates.includes(start.workDate)) continue;
    displayAssignments.push({
      staffId: profile.staffId,
      date: start.workDate,
      shiftTypeId: assignment.shiftTypeId,
    });
    weeklyHours += hoursBetween(start.localTime, end.localTime);
  }

  const todayIso = todayIsoInTimeZone(timeZone);

  return (
    <CafeStaffScheduleCard
      title="シフト表"
      headerActions={
        <span
          title="Previewでは本人の公開シフトだけを表示します"
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: demoColors.accent,
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          自分だけ
        </span>
      }
      schedule={
        <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: demoColors.textPrimary }}>
            {periodStart.slice(5).replace('-', '/')} ～ {periodEnd.slice(5).replace('-', '/')}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link
              href={`${basePath}/staff?weekOffset=${weekOffset - 1}`}
              style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}
            >
              ← 前の週
            </Link>
            <Link
              href={`${basePath}/staff`}
              aria-disabled={weekOffset === 0}
              style={{
                ...(weekOffset === 0 ? buttonDisabled : buttonSecondary),
                padding: '5px 9px',
                fontSize: 11,
              }}
            >
              今日
            </Link>
            <Link
              href={`${basePath}/staff?weekOffset=${weekOffset + 1}`}
              style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}
            >
              次の週 →
            </Link>
          </div>
        </div>

        {assignments === null ? (
          <p style={{ margin: '8px 4px', ...mutedText }}>シフトを読み込めませんでした。時間をおいて再度お試しください。</p>
        ) : (
          <ShiftTable
            dates={dates}
            todayIso={todayIso}
            staffList={[{ id: profile.staffId, name: '自分', role: 'staff' }]}
            assignments={displayAssignments}
            shiftTypes={displayShiftTypes}
            mode="staff"
            currentStaffId={profile.staffId}
            onlyCurrentStaff
            compact
            lang="ja"
          />
        )}
        </>
      }
      legend={<ShiftLegend shiftTypes={displayShiftTypes} lang="ja" />}
      hoursLabel={`実働時間: ${weeklyHours.toFixed(1)}h`}
    />
  );
}
