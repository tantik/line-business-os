import Link from 'next/link';
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
} from '@/app/(protected)/dashboard/workforce/_ui/workforce-theme';

/**
 * Phase 1N-4C Slice B1 - action-free, read-only staff display for the Mame
 * To Cha preview. Same rationale as `manager-view.tsx`: a plain (non-`'use
 * client'`) server component that imports no Server Action and no
 * mutation-form component (`ShiftPreferenceForm`/`WorkReportForm`/
 * `CorrectionRequestForm`), so it cannot register a Server Action reference
 * in the client bundle at all.
 */
export interface PreviewStaffViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  shiftTypes: WorkforceShiftType[] | null;
  /** The caller's own `kind: 'preference'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  requests: WorkforceShiftRequest[] | null;
  /** Already narrowed server-side to this caller's own published assignments in the selected week's date range. */
  assignments: WorkforceShiftAssignment[] | null;
  /** The caller's own attendance rows (self-scoped by RLS), not date-filtered by the caller. */
  attendance: WorkforceAttendance[] | null;
  /** The caller's own `kind: 'correction'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  correctionRequests: WorkforceShiftRequest[] | null;
  /** Public preview route base, e.g. `/mame-to-cha` - used for week-navigation links only. */
  basePath: string;
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

export function PreviewStaffView({
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
  basePath,
}: PreviewStaffViewProps) {
  const shiftTypeById = new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st]));

  const myRequestsThisWeek = (requests ?? [])
    .filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd)
    .sort((a, b) => a.workDate.localeCompare(b.workDate));

  // Staff must only ever see their own, published shifts here -- never a co-worker's row, never a manager's unpublished draft.
  const myScheduleThisWeek = (assignments ?? [])
    .filter((a) => a.published && a.employeeId === profile.staffId)
    .map((a) => {
      const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
      const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
      return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
    })
    .filter((entry) => entry.workDate >= periodStart && entry.workDate <= periodEnd)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startsAtLocal.localeCompare(b.startsAtLocal));

  const myAttendanceThisWeek = (attendance ?? [])
    .filter((a) => a.workDate >= periodStart && a.workDate <= periodEnd)
    .sort((a, b) => a.workDate.localeCompare(b.workDate));

  const myCorrectionsThisWeek = (correctionRequests ?? [])
    .filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd)
    .sort((a, b) => a.workDate.localeCompare(b.workDate));

  const todayIso = todayIsoInTimeZone(timeZone);

  const weeklyHours = myScheduleThisWeek.reduce((sum, entry) => sum + hoursBetween(entry.startsAtLocal, entry.endsAtLocal), 0);

  return (
    <>
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
            <Link href={`${basePath}/staff?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week / 前週
            </Link>
            <Link
              href={`${basePath}/staff`}
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              This week / 今週
            </Link>
            <Link href={`${basePath}/staff?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
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
        <h2 style={{ margin: 0, fontSize: 16 }}>My submitted shift preferences / シフト希望</h2>
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
        <p style={{ margin: '12px 0 0', ...mutedText }}>シフト希望の提出は、このプレビューでは利用できません。</p>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>My work reports this week / 勤務報告</h2>
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
        <p style={{ margin: '12px 0 0', ...mutedText }}>勤務報告の提出は、このプレビューでは利用できません。</p>
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
              </tr>
            </thead>
            <tbody>
              {myCorrectionsThisWeek.map((r) => {
                const message = typeof r.details.message === 'string' ? r.details.message : '-';
                return (
                  <tr key={r.requestId} style={r.workDate === todayIso ? todayRowStyle : undefined}>
                    <td style={tableCell}>{r.workDate}</td>
                    <td style={tableCell}>{message}</td>
                    <td style={tableCell}>
                      <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ margin: '12px 0 0', ...mutedText }}>修正依頼の提出は、このプレビューでは利用できません。</p>
      </section>
    </>
  );
}
