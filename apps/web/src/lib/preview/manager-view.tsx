import Link from 'next/link';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeLineLink } from '@/lib/workforce/employee-line-links';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import {
  badgeStyle,
  buttonDisabled,
  buttonSecondary,
  card,
  colors,
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
 * Phase 1N-4C Slice B1 - action-free, read-only manager display for the Mame
 * To Cha preview. Deliberately NOT `'use client'` and imports nothing from
 * `staff-actions.ts`/`schedule-actions.ts`/`attendance-actions.ts` and no
 * mutation-form component (`StaffForm`/`LineLinkForm`/`ShiftCellEditor`) - a
 * plain server component has no client bundle at all, so there is no
 * `next build` client-reference-manifest entry for this file to register a
 * Server Action against, structurally (not just visually) closing the gap
 * found in the prior read-only-prop approach (verified via
 * `.next/server/server-reference-manifest.json` inspection - see
 * `scripts/verify-preview-no-server-actions.mjs`).
 *
 * Intentionally a separate, smaller component rather than an extraction of
 * the full dashboard display layer (architecture plan reuse principle:
 * shared data types + data loaders, not page re-exports) - the dashboard's
 * `ManagerDashboardClient` stays untouched and fully interactive.
 */
export interface PreviewManagerViewProps {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  staff: WorkforceStaffManageEntry[] | null;
  lineLinks: WorkforceEmployeeLineLink[] | null;
  shiftTypes: WorkforceShiftType[] | null;
  requests: WorkforceShiftRequest[] | null;
  assignments: WorkforceShiftAssignment[] | null;
  correctionRequests: WorkforceShiftRequest[] | null;
  attendance: WorkforceAttendance[] | null;
  /** Public preview route base, e.g. `/mame-to-cha` - used for week-navigation links only. */
  basePath: string;
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function PreviewManagerView({
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  staff,
  lineLinks,
  shiftTypes,
  requests,
  assignments,
  correctionRequests,
  attendance,
  basePath,
}: PreviewManagerViewProps) {
  const dates = weekDates(periodStart);
  const todayIso = todayIsoInTimeZone(timeZone);

  const shiftTypeById = new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st]));
  const staffById = new Map((staff ?? []).map((s) => [s.staffId, s]));
  const isLineLinkedByEmployeeId = new Map((lineLinks ?? []).filter((l) => l.isActive).map((l) => [l.employeeId, true]));
  const attendanceById = new Map((attendance ?? []).map((a) => [a.attendanceId, a]));

  const pendingCorrections = (correctionRequests ?? []).filter((r) => r.status === 'pending');
  const decidedCorrections = (correctionRequests ?? [])
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10);

  const localAssignments = (assignments ?? []).map((a) => {
    const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
    const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
    return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
  });

  function assignmentFor(staffId: string, date: string) {
    return localAssignments.find((a) => a.assignment.employeeId === staffId && a.workDate === date);
  }

  return (
    <>
      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Staff</h2>
        {staff === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Staff list is temporarily unavailable.</p>
        ) : staff.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No staff added yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Name</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Position</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Employment type</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Status</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>LINE</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staffId}>
                  <td style={tableCell}>{s.name}</td>
                  <td style={tableCell}>{s.positionLabel ?? '-'}</td>
                  <td style={tableCell}>{s.employmentType ?? '-'}</td>
                  <td style={tableCell}>
                    <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={tableCell}>
                    <span style={badgeStyle(isLineLinkedByEmployeeId.get(s.staffId) ? 'active' : 'neutral')}>
                      {isLineLinkedByEmployeeId.get(s.staffId) ? 'Linked' : 'Not linked'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Weekly schedule ({periodStart} - {periodEnd})
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`${basePath}/manager?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week
            </Link>
            <Link
              href={`${basePath}/manager`}
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              This week
            </Link>
            <Link href={`${basePath}/manager?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
              Next week
            </Link>
          </div>
        </div>

        {staff === null || staff.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>Add staff to see the weekly schedule.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Staff</th>
                  {dates.map((date) => (
                    <th key={date} style={{ ...tableHeaderCell, textAlign: 'left' }}>
                      {formatWeekday(date)}
                      <br />
                      {date.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.staffId}>
                    <td style={tableCell}>{s.name}</td>
                    {dates.map((date) => {
                      const entry = assignmentFor(s.staffId, date);
                      if (!entry) {
                        return (
                          <td key={date} style={tableCell}>
                            <span style={mutedText}>-</span>
                          </td>
                        );
                      }
                      const shiftType = entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId) : undefined;
                      return (
                        <td key={date} style={tableCell}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={shiftChipStyle(shiftChipColors(entry.assignment.shiftTypeId))}>
                                {shiftType?.code ?? 'Custom'}
                              </span>
                              <span style={badgeStyle(entry.assignment.published ? 'active' : 'neutral')}>
                                {entry.assignment.published ? 'Published' : 'Draft'}
                              </span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ margin: '16px 0 0', paddingTop: 16, borderTop: `1px solid ${colors.border}`, ...mutedText }}>
          スケジュールの編集や自動割り当ては、このプレビューでは利用できません。
        </p>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Shift types</h2>
        {shiftTypes === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Shift types are temporarily unavailable.</p>
        ) : shiftTypes.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>No shift types configured yet.</p>
        ) : (
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Code</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Label</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Time</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Break</th>
              </tr>
            </thead>
            <tbody>
              {shiftTypes.map((st) => (
                <tr key={st.shiftTypeId}>
                  <td style={tableCell}>
                    <span style={shiftChipStyle(shiftChipColors(st.shiftTypeId))}>{st.code}</span>
                  </td>
                  <td style={tableCell}>{st.labelJa || st.labelEn || '-'}</td>
                  <td style={tableCell}>
                    {st.startsAtLocal} - {st.endsAtLocal}
                  </td>
                  <td style={tableCell}>{st.breakMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Submitted shift preferences ({periodStart} - {periodEnd})</h2>
        {requests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Shift preferences are temporarily unavailable.</p>
        ) : (
          (() => {
            const inPeriod = requests.filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd);
            if (inPeriod.length === 0) {
              return <p style={{ margin: '8px 0 0', ...mutedText }}>No shift preferences submitted for this week yet.</p>;
            }
            return (
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Staff</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Preference</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod.map((r) => (
                    <tr key={r.requestId} style={r.workDate === todayIso ? todayRowStyle : undefined}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
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
            );
          })()
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Correction requests</h2>
        {correctionRequests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>Correction requests are temporarily unavailable.</p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Needs action
            </p>
            {pendingCorrections.length === 0 ? (
              <p style={{ margin: '8px 0 0', ...mutedText }}>No pending correction requests.</p>
            ) : (
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Staff</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Message</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Attendance</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Transportation</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Daily message</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCorrections.map((r) => {
                    const message = typeof r.details.message === 'string' ? r.details.message : '-';
                    const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                    return (
                      <tr key={r.requestId}>
                        <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                        <td style={tableCell}>{r.workDate}</td>
                        <td style={tableCell}>{message}</td>
                        <td style={tableCell}>
                          {relatedAttendance
                            ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                            : '-'}
                        </td>
                        <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                        <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {decidedCorrections.length > 0 ? (
              <div style={{ marginTop: 16, background: colors.surfaceElevated, borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>Recently decided</h3>
                <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Staff</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Date</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Message</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedCorrections.map((r) => (
                      <tr key={r.requestId}>
                        <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                        <td style={tableCell}>{r.workDate}</td>
                        <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : '-'}</td>
                        <td style={tableCell}>
                          <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
