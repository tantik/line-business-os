'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import {
  badgeStyle,
  buttonDisabled,
  buttonSecondary,
  card,
  colors,
  linkAccent,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
import {
  correctionStatusBadgeStyle,
  correctionStatusLabel,
  primaryCard,
  shiftChipColors,
  shiftChipStyle,
  todayIsoInTimeZone,
  todayRowStyle,
} from '../_ui/workforce-theme';
import { ShiftPreferenceForm } from './shift-preference-form';
import { WorkReportForm } from './work-report-form';
import { CorrectionRequestForm } from './correction-request-form';

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface StaffDashboardClientProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  shiftTypes: WorkforceShiftType[] | null;
  /** The caller's own `kind: 'preference'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  requests: WorkforceShiftRequest[] | null;
  /**
   * Already narrowed server-side (`page.tsx`) to this caller's own published
   * assignments in the selected week's date range -- `listShiftAssignments`
   * itself is shared with the manager view and adds no employee filter, so
   * the server route filters before this ever reaches the browser. The
   * `published && employeeId === profile.staffId` filter below is kept as
   * defense-in-depth only; it must never be the only thing enforcing this.
   */
  assignments: WorkforceShiftAssignment[] | null;
  /** The caller's own attendance rows (self-scoped by RLS), not date-filtered by the caller. */
  attendance: WorkforceAttendance[] | null;
  /** The caller's own `kind: 'correction'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  correctionRequests: WorkforceShiftRequest[] | null;
}

function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** Display-only hours between two `HH:MM` local times, for the weekly-hours summary. Does not account for breaks. */
function hoursBetween(startsAtLocal: string, endsAtLocal: string): number {
  const [startH = 0, startM = 0] = startsAtLocal.split(':').map(Number);
  const [endH = 0, endM = 0] = endsAtLocal.split(':').map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

export function StaffDashboardClient({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  shiftTypes,
  requests,
  assignments,
  attendance,
  correctionRequests,
}: StaffDashboardClientProps) {
  const router = useRouter();
  const [banner, setBanner] = useState<string | null>(null);

  const shiftTypeById = useMemo(() => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])), [shiftTypes]);

  const myRequestsThisWeek = useMemo(
    () => (requests ?? []).filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd).sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [requests, periodStart, periodEnd],
  );

  // Staff must only ever see their own, published shifts here -- never a co-worker's row, never a manager's unpublished draft.
  const myScheduleThisWeek = useMemo(() => {
    return (assignments ?? [])
      .filter((a) => a.published && a.employeeId === profile.staffId)
      .map((a) => {
        const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
        const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
        return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
      })
      .filter((entry) => entry.workDate >= periodStart && entry.workDate <= periodEnd)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startsAtLocal.localeCompare(b.startsAtLocal));
  }, [assignments, profile.staffId, timeZone, periodStart, periodEnd]);

  const myAttendanceThisWeek = useMemo(
    () => (attendance ?? []).filter((a) => a.workDate >= periodStart && a.workDate <= periodEnd).sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [attendance, periodStart, periodEnd],
  );

  const attendanceById = useMemo(() => new Map((attendance ?? []).map((a) => [a.attendanceId, a])), [attendance]);

  const myCorrectionsThisWeek = useMemo(
    () =>
      (correctionRequests ?? [])
        .filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd)
        .sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [correctionRequests, periodStart, periodEnd],
  );

  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  const weeklyHours = useMemo(
    () => myScheduleThisWeek.reduce((sum, entry) => sum + hoursBetween(entry.startsAtLocal, entry.endsAtLocal), 0),
    [myScheduleThisWeek],
  );

  function handleFormSuccess(message: string) {
    setBanner(message);
    router.refresh();
  }

  return (
    <>
      {banner ? <div style={{ ...alertSuccess, marginTop: 16 }}>{banner}</div> : null}

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>My staff profile</h2>
        <dl style={{ margin: '12px 0 0', display: 'grid', rowGap: 8 }}>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Position</dt>
            <dd style={{ margin: 0 }}>{profile.positionLabel ?? 'Not set'}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Employment type</dt>
            <dd style={{ margin: 0 }}>{profile.employmentType}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Status</dt>
            <dd style={{ margin: 0 }}>
              <span style={badgeStyle(profile.isActive ? 'active' : 'inactive')}>{profile.isActive ? 'Active' : 'Inactive'}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            My published schedule / 公開シフト ({periodStart} - {periodEnd})
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/dashboard/workforce/staff?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week / 前週
            </Link>
            <Link
              href="/dashboard/workforce/staff"
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              This week / 今週
            </Link>
            <Link href={`/dashboard/workforce/staff?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
              Next week / 次週
            </Link>
          </div>
        </div>
        {assignments === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your schedule is temporarily unavailable.</p>
        ) : myScheduleThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No published shifts for this week yet.</p>
        ) : (
          <>
            <p style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 600 }}>
              Scheduled this week / 今週の予定時間: {weeklyHours.toFixed(1)}h
            </p>
            <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date / 日付</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Shift / シフト</th>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Time / 時間</th>
                </tr>
              </thead>
              <tbody>
                {myScheduleThisWeek.map((entry) => (
                  <tr key={entry.assignment.assignmentId} style={entry.workDate === todayIso ? todayRowStyle : undefined}>
                    <td style={tableCell}>
                      {formatWeekday(entry.workDate)} {entry.workDate.slice(5)}
                    </td>
                    <td style={tableCell}>
                      <span style={shiftChipStyle(shiftChipColors(entry.assignment.shiftTypeId))}>
                        {entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId)?.code ?? 'Custom' : 'Custom'}
                      </span>
                    </td>
                    <td style={tableCell}>
                      {entry.startsAtLocal} - {entry.endsAtLocal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section style={card}>
        <p style={{ margin: 0, ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submit / 提出</p>
        <h2 style={{ margin: '4px 0 0', fontSize: 16 }}>My submitted shift preferences / シフト希望</h2>
        {requests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your shift preferences are temporarily unavailable.</p>
        ) : myRequestsThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No shift preferences submitted for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date / 日付</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Preference / 希望</th>
              </tr>
            </thead>
            <tbody>
              {myRequestsThisWeek.map((r) => (
                <tr key={r.requestId} style={r.workDate === todayIso ? todayRowStyle : undefined}>
                  <td style={tableCell}>{r.workDate}</td>
                  <td style={tableCell}>
                    {r.isUnavailable ? (
                      'Unavailable'
                    ) : (
                      <span style={shiftChipStyle(shiftChipColors(r.shiftTypeId))}>
                        {shiftTypeById.get(r.shiftTypeId ?? '')?.code ?? '-'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {shiftTypes === null ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>Shift types are temporarily unavailable, so preferences cannot be submitted right now.</p>
        ) : (
          <ShiftPreferenceForm
            shiftTypes={shiftTypes}
            defaultWorkDate={periodStart}
            onSuccess={() => handleFormSuccess('Shift preference submitted.')}
          />
        )}
      </section>

      <section style={card}>
        <p style={{ margin: 0, ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submit / 提出</p>
        <h2 style={{ margin: '4px 0 0', fontSize: 16 }}>My work reports this week / 勤務報告</h2>
        {attendance === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your work reports are temporarily unavailable.</p>
        ) : myAttendanceThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No work reports submitted for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date / 日付</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Clock in / 出勤</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Clock out / 退勤</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Transportation</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Message</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {myAttendanceThisWeek.map((a) => {
                const clockIn = a.clockIn ? utcIsoToLocalDateTime(a.clockIn, timeZone).localTime : '-';
                const clockOut = a.clockOut ? utcIsoToLocalDateTime(a.clockOut, timeZone).localTime : '-';
                return (
                  <tr key={a.attendanceId} style={a.workDate === todayIso ? todayRowStyle : undefined}>
                    <td style={tableCell}>{a.workDate}</td>
                    <td style={tableCell}>{clockIn}</td>
                    <td style={tableCell}>{clockOut}</td>
                    <td style={tableCell}>{a.transportationCost ?? '-'}</td>
                    <td style={tableCell}>{a.dailyMessage ?? '-'}</td>
                    <td style={tableCell}>{a.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <WorkReportForm defaultWorkDate={periodStart} onSuccess={() => handleFormSuccess('Work report submitted.')} />
      </section>

      <section style={card}>
        <p style={{ margin: 0, ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Submit / 提出</p>
        <h2 style={{ margin: '4px 0 0', fontSize: 16 }}>Submit a correction request / 修正依頼</h2>
        <p style={{ margin: '8px 0 0', ...mutedText }}>
          If a submitted work report is wrong, describe the correction here -- your manager reviews it separately.
        </p>
        <CorrectionRequestForm
          attendanceOptions={attendance ?? []}
          defaultWorkDate={periodStart}
          onSuccess={() => handleFormSuccess('Correction request submitted.')}
        />
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>My correction requests this week</h2>
        {correctionRequests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your correction requests are temporarily unavailable.</p>
        ) : myCorrectionsThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No correction requests submitted for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Message</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Status</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Related work report</th>
              </tr>
            </thead>
            <tbody>
              {myCorrectionsThisWeek.map((r) => {
                const message = typeof r.details.message === 'string' ? r.details.message : '-';
                const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                const relatedSummary = relatedAttendance
                  ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                  : '-';
                return (
                  <tr key={r.requestId} style={r.workDate === todayIso ? todayRowStyle : undefined}>
                    <td style={tableCell}>{r.workDate}</td>
                    <td style={tableCell}>{message}</td>
                    <td style={tableCell}>
                      <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status)}</span>
                    </td>
                    <td style={tableCell}>{relatedSummary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/workforce" style={{ ...linkAccent, fontSize: 14, textDecoration: 'underline' }}>
          Back to Workforce
        </Link>
      </p>
    </>
  );
}
