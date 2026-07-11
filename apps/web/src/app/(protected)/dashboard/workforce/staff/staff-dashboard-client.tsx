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
  buttonSecondary,
  card,
  colors,
  linkAccent,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
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

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Week ({periodStart} - {periodEnd})
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/dashboard/workforce/staff?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week
            </Link>
            <Link href="/dashboard/workforce/staff" style={buttonSecondary}>
              This week
            </Link>
            <Link href={`/dashboard/workforce/staff?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
              Next week
            </Link>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>My published schedule</h2>
        {assignments === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your schedule is temporarily unavailable.</p>
        ) : myScheduleThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No published shifts for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Shift</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {myScheduleThisWeek.map((entry) => (
                <tr key={entry.assignment.assignmentId}>
                  <td style={tableCell}>
                    {formatWeekday(entry.workDate)} {entry.workDate.slice(5)}
                  </td>
                  <td style={tableCell}>
                    {entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId)?.code ?? 'Custom' : 'Custom'}
                  </td>
                  <td style={tableCell}>
                    {entry.startsAtLocal} - {entry.endsAtLocal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>My submitted shift preferences</h2>
        {requests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your shift preferences are temporarily unavailable.</p>
        ) : myRequestsThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No shift preferences submitted for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Preference</th>
              </tr>
            </thead>
            <tbody>
              {myRequestsThisWeek.map((r) => (
                <tr key={r.requestId}>
                  <td style={tableCell}>{r.workDate}</td>
                  <td style={tableCell}>{r.isUnavailable ? 'Unavailable' : shiftTypeById.get(r.shiftTypeId ?? '')?.code ?? '-'}</td>
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
        <h2 style={{ margin: 0, fontSize: 16 }}>My work reports this week</h2>
        {attendance === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Your work reports are temporarily unavailable.</p>
        ) : myAttendanceThisWeek.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No work reports submitted for this week yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Clock in</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Clock out</th>
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
                  <tr key={a.attendanceId}>
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
        <h2 style={{ margin: 0, fontSize: 16 }}>Submit a correction request</h2>
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
                  <tr key={r.requestId}>
                    <td style={tableCell}>{r.workDate}</td>
                    <td style={tableCell}>{message}</td>
                    <td style={tableCell}>
                      <span style={badgeStyle(r.status === 'approved' ? 'active' : r.status === 'rejected' ? 'inactive' : 'neutral')}>
                        {r.status}
                      </span>
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
