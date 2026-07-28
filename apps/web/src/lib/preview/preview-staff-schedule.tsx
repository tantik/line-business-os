'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DemoHelpButton } from '@/components/demo/cafe/DemoHelpButton';
import { Modal } from '@/components/demo/cafe/Modal';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { CafeStaffScheduleCard } from '@/components/demo/cafe/CafeStaffPresentation';
import { HELP_STAFF_SHIFT_TABLE } from '@/lib/demo/cafe/helpContent';
import type { ShiftAssignment, ShiftTypeDef } from '@/lib/demo/cafe/types';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { buttonDisabled, buttonPrimary, buttonSecondary, demoColors, mutedText } from '@/lib/demo/cafe/theme';
import { todayIsoInTimeZone } from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';
import { PreviewCorrectionRequestForm } from './preview-correction-request-form';

export interface PreviewStaffScheduleProps {
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

function reportTime(value: string | null, timeZone: string): string {
  return value ? utcIsoToLocalDateTime(value, timeZone).localTime : '－';
}

/** Real-data Staff schedule with the same all/self interaction as Demo. */
export function PreviewStaffSchedule({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  shiftTypes,
  assignments,
  attendance,
  basePath,
}: PreviewStaffScheduleProps) {
  const [onlyMe, setOnlyMe] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [correctionDate, setCorrectionDate] = useState<string | null>(null);
  const dates = useMemo(() => dateRange(periodStart, periodEnd), [periodStart, periodEnd]);
  const todayIso = todayIsoInTimeZone(timeZone);

  const displayShiftTypes: ShiftTypeDef[] = (shiftTypes ?? []).map((shiftType) => ({
    id: shiftType.shiftTypeId,
    label: shiftType.code,
    startTime: shiftType.startsAtLocal.slice(0, 5),
    endTime: shiftType.endsAtLocal.slice(0, 5),
    isCustom: shiftType.isCustom,
  }));

  const employeeIds = Array.from(
    new Set((assignments ?? []).filter((item) => item.published && item.employeeId).map((item) => item.employeeId!)),
  );
  employeeIds.sort((a, b) => (a === profile.staffId ? -1 : b === profile.staffId ? 1 : a.localeCompare(b)));
  if (!employeeIds.includes(profile.staffId)) employeeIds.unshift(profile.staffId);

  // Other employees' encrypted names are deliberately not exposed to Staff.
  // Stable neutral labels preserve the full-roster schedule without leaking PII.
  let colleagueNumber = 0;
  const staffList = employeeIds.map((id) => ({
    id,
    name: id === profile.staffId ? '自分' : `スタッフ ${++colleagueNumber}`,
    role: 'staff' as const,
  }));

  const displayAssignments: ShiftAssignment[] = [];
  let weeklyHours = 0;
  for (const assignment of assignments ?? []) {
    if (!assignment.published || !assignment.employeeId) continue;
    const start = utcIsoToLocalDateTime(assignment.startsAt, timeZone);
    const end = utcIsoToLocalDateTime(assignment.endsAt, timeZone);
    if (!dates.includes(start.workDate)) continue;
    displayAssignments.push({
      staffId: assignment.employeeId,
      date: start.workDate,
      shiftTypeId: assignment.shiftTypeId,
    });
    if (assignment.employeeId === profile.staffId) weeklyHours += hoursBetween(start.localTime, end.localTime);
  }

  const selectedAttendance = (attendance ?? []).find((entry) => entry.workDate === selectedDate) ?? null;
  const selectedAssignment = (assignments ?? []).find((entry) => {
    if (entry.employeeId !== profile.staffId) return false;
    return utcIsoToLocalDateTime(entry.startsAt, timeZone).workDate === selectedDate;
  });
  const selectedShift = displayShiftTypes.find((entry) => entry.id === selectedAssignment?.shiftTypeId);

  return (
    <>
      <CafeStaffScheduleCard
        title={
          <>
            シフト表 <DemoHelpButton content={HELP_STAFF_SHIFT_TABLE} />
          </>
        }
        headerActions={
          <div style={{ display: 'inline-flex', border: `1px solid ${demoColors.border}`, borderRadius: 999, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOnlyMe(false)} style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: !onlyMe ? demoColors.accent : 'transparent', color: !onlyMe ? '#fff' : demoColors.textMuted, padding: '6px 14px' }}>全体</button>
            <button type="button" onClick={() => setOnlyMe(true)} style={{ ...buttonSecondary, border: 0, borderRadius: 0, background: onlyMe ? demoColors.accent : 'transparent', color: onlyMe ? '#fff' : demoColors.textMuted, padding: '6px 14px' }}>自分だけ</button>
          </div>
        }
        schedule={
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: demoColors.textPrimary }}>
                {periodStart.slice(5).replace('-', '/')} ～ {periodEnd.slice(5).replace('-', '/')}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Link href={`${basePath}/staff?weekOffset=${weekOffset - 1}`} style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}>← 前の週</Link>
                <Link href={`${basePath}/staff`} aria-disabled={weekOffset === 0} style={{ ...(weekOffset === 0 ? buttonDisabled : buttonSecondary), padding: '5px 9px', fontSize: 11 }}>今日</Link>
                <Link href={`${basePath}/staff?weekOffset=${weekOffset + 1}`} style={{ ...buttonSecondary, padding: '5px 9px', fontSize: 11 }}>次の週 →</Link>
              </div>
            </div>
            {assignments === null ? (
              <p style={{ margin: '8px 4px', ...mutedText }}>シフトを読み込めませんでした。時間をおいて再度お試しください。</p>
            ) : (
              <ShiftTable
                dates={dates}
                todayIso={todayIso}
                staffList={staffList}
                assignments={displayAssignments}
                shiftTypes={displayShiftTypes}
                mode="staff"
                currentStaffId={profile.staffId}
                onlyCurrentStaff={onlyMe}
                compact
                lang="ja"
                onCellClick={(_staffId, date) => setSelectedDate(date)}
              />
            )}
          </>
        }
        legend={<ShiftLegend shiftTypes={displayShiftTypes} lang="ja" />}
        hoursLabel={`実働時間: ${weeklyHours.toFixed(1)}h`}
      />

      <Modal open={selectedDate !== null} onClose={() => setSelectedDate(null)} title={`勤務記録 ${selectedDate ?? ''}`}>
        <div style={{ display: 'grid', gap: 0 }}>
          {[
            ['シフト予定', selectedShift ? `${selectedShift.label}（${selectedShift.startTime}-${selectedShift.endTime}）` : '－'],
            ['出勤', reportTime(selectedAttendance?.clockIn ?? null, timeZone)],
            ['休憩', `${selectedAttendance?.actualBreakMinutes ?? 0}分`],
            ['退勤', reportTime(selectedAttendance?.clockOut ?? null, timeZone)],
            ['交通費', selectedAttendance?.transportationCost == null ? '－' : `¥${selectedAttendance.transportationCost}`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${demoColors.border}` }}>
              <span style={mutedText}>{label}</span><strong>{value}</strong>
            </div>
          ))}
          <div style={{ padding: '10px 0' }}><div style={mutedText}>メッセージ</div><div>{selectedAttendance?.dailyMessage || 'なし'}</div></div>
        </div>
        {selectedDate && selectedDate <= todayIso ? (
          <button type="button" style={{ ...buttonPrimary, marginTop: 12 }} onClick={() => { setCorrectionDate(selectedDate); setSelectedDate(null); }}>勤務時間の修正を依頼</button>
        ) : null}
      </Modal>

      <Modal open={correctionDate !== null} onClose={() => setCorrectionDate(null)} title="勤務時間の修正を依頼">
        <PreviewCorrectionRequestForm attendanceOptions={attendance} defaultWorkDate={correctionDate ?? todayIso} embedded />
      </Modal>
    </>
  );
}
