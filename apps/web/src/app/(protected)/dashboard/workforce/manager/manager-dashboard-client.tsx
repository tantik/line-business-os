'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeLineLink } from '@/lib/workforce/employee-line-links';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { runAutoDistribution, publishSchedule, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
import { setEmployeeActive } from '@/lib/workforce/staff-actions';
import { decideCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import {
  alertDanger,
  badgeStyle,
  buttonDisabled,
  buttonPrimary,
  buttonSecondary,
  card,
  colors,
  linkAccent,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
import {
  buttonDanger,
  correctionStatusBadgeStyle,
  correctionStatusLabel,
  primaryCard,
  shiftChipColors,
  shiftChipStyle,
  todayIsoInTimeZone,
  todayRowStyle,
} from '../_ui/workforce-theme';
import { describeWriteError } from './error-copy';
import { StaffForm } from './staff-form';
import { LineLinkForm } from './line-link-form';
import { ShiftCellEditor } from './shift-cell-editor';
import { InvitationCell } from './invitation-cell';

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

/**
 * Cafe v0.1 MVP default staffing requirement (Slice 2A): 1 headcount for the
 * AM and PM windows, every day of the week. There is no settings table for
 * this yet -- see `schedule-input.ts`'s `RunAutoDistributionRequirementInput`
 * comment for why this is a plain action argument, not a DB-backed rule.
 */
const DEFAULT_STAFFING_REQUIREMENTS = ([0, 1, 2, 3, 4, 5, 6] as const).flatMap((weekday) => [
  { weekday, windowCode: 'AM' as const, requiredHeadcount: 1 },
  { weekday, windowCode: 'PM' as const, requiredHeadcount: 1 },
]);

export interface ManagerDashboardClientProps {
  locationId: string;
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
  invitations: WorkforceEmployeeInvitation[] | null;
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function ManagerDashboardClient({
  locationId,
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
  invitations,
}: ManagerDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    tone: 'success' | 'error';
    message: string;
    stats?: { label: string; value: number }[];
  } | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);

  const dates = useMemo(() => weekDates(periodStart), [periodStart]);
  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  const shiftTypeById = useMemo(
    () => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])),
    [shiftTypes],
  );
  const staffById = useMemo(() => new Map((staff ?? []).map((s) => [s.staffId, s])), [staff]);
  const isLineLinkedByEmployeeId = useMemo(
    () => new Map((lineLinks ?? []).filter((l) => l.isActive).map((l) => [l.employeeId, true])),
    [lineLinks],
  );
  // At most one PENDING row per employee (DB-enforced, 0064); when none is
  // pending, show the most recently updated row (e.g. a past revoke) so
  // Revoke/Resend history stays visible instead of silently vanishing.
  const latestInvitationByEmployeeId = useMemo(() => {
    const map = new Map<string, WorkforceEmployeeInvitation>();
    for (const inv of invitations ?? []) {
      const existing = map.get(inv.employeeId);
      if (!existing || inv.status === 'pending' || (existing.status !== 'pending' && inv.updatedAt > existing.updatedAt)) {
        map.set(inv.employeeId, inv);
      }
    }
    return map;
  }, [invitations]);
  const attendanceById = useMemo(
    () => new Map((attendance ?? []).map((a) => [a.attendanceId, a])),
    [attendance],
  );

  const pendingCorrections = useMemo(
    () => (correctionRequests ?? []).filter((r) => r.status === 'pending'),
    [correctionRequests],
  );
  const decidedCorrections = useMemo(
    () =>
      (correctionRequests ?? [])
        .filter((r) => r.status !== 'pending')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 10),
    [correctionRequests],
  );

  const localAssignments = useMemo(
    () =>
      (assignments ?? []).map((a) => {
        const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
        const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
        return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
      }),
    [assignments, timeZone],
  );

  function assignmentFor(staffId: string, date: string) {
    return localAssignments.find((a) => a.assignment.employeeId === staffId && a.workDate === date);
  }

  function cellKey(staffId: string, date: string) {
    return `${staffId}:${date}`;
  }

  function handleSetActive(staffId: string, nextActive: boolean) {
    if (!nextActive && !window.confirm('Deactivate this staff member?')) return;
    setBanner(null);
    setPendingAction(`active-${staffId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('staffId', staffId);
      if (nextActive) formData.set('isActive', 'true');
      const result = await setEmployeeActive(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: nextActive ? 'Staff member activated.' : 'Staff member deactivated.' });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handleAutoDistribute() {
    setBanner(null);
    setPendingAction('auto-distribute');
    startTransition(async () => {
      const result = await runAutoDistribution({
        locationId,
        periodStart,
        periodEnd,
        staffingRequirements: DEFAULT_STAFFING_REQUIREMENTS,
        overwriteExisting: false,
      });
      if (result.status === 'success') {
        const r = result.data as RunAutoDistributionActionResult;
        setBanner({
          tone: 'success',
          message: `Created ${r.draftCount} draft shift(s).`,
          stats: [
            { label: 'Draft shifts', value: r.draftCount },
            { label: 'Shortages', value: r.shortages.length },
            { label: 'Unplaced', value: r.unplaced.length },
            { label: 'No preferences submitted', value: r.nonSubmitters.length },
          ],
        });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handlePublish() {
    if (!window.confirm('Publish all draft shifts for this week? Staff will be able to see them.')) return;
    setBanner(null);
    setPendingAction('publish');
    startTransition(async () => {
      const formData = new FormData();
      formData.set('locationId', locationId);
      formData.set('periodStart', periodStart);
      formData.set('periodEnd', periodEnd);
      const result = await publishSchedule(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: `Published ${result.data.published} shift(s).` });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handleUnassign(entry: (typeof localAssignments)[number]) {
    setBanner(null);
    setPendingAction(`unassign-${entry.assignment.assignmentId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('assignmentId', entry.assignment.assignmentId);
      formData.set('locationId', locationId);
      formData.set('employeeId', '');
      if (entry.assignment.shiftTypeId) formData.set('shiftTypeId', entry.assignment.shiftTypeId);
      formData.set('workDate', entry.workDate);
      formData.set('startsAtLocal', entry.startsAtLocal);
      formData.set('endsAtLocal', entry.endsAtLocal);
      formData.set('breakMinutes', String(entry.assignment.breakMinutes));
      if (entry.assignment.role) formData.set('role', entry.assignment.role);
      if (entry.assignment.notes) formData.set('notes', entry.assignment.notes);
      if (entry.assignment.published) formData.set('published', 'true');

      const result = await updateShiftAssignment(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: 'Shift unassigned.' });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handleDecideCorrection(requestId: string, decision: ShiftRequestDecision) {
    setBanner(null);
    setPendingAction(`decide-${requestId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('requestId', requestId);
      formData.set('decision', decision);
      const result = await decideCorrectionRequest(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: decision === 'approved' ? 'Correction approved.' : 'Correction rejected.' });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  return (
    <>
      {banner ? (
        <div style={{ ...(banner.tone === 'error' ? alertDanger : alertSuccess), marginTop: 16 }}>
          <div>{banner.message}</div>
          {banner.stats ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {banner.stats.map((stat) => (
                <span
                  key={stat.label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: colors.surfaceElevated,
                    fontSize: 12,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{stat.value}</strong>
                  <span style={mutedText}>{stat.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Staff</h2>
          {staff !== null && !addingStaff ? (
            <button type="button" style={buttonSecondary} onClick={() => setAddingStaff(true)}>
              + Add staff
            </button>
          ) : null}
        </div>

        {addingStaff ? (
          <StaffForm
            locationId={locationId}
            onSuccess={() => {
              setAddingStaff(false);
              router.refresh();
            }}
            onCancel={() => setAddingStaff(false)}
          />
        ) : null}

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
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>アクセス</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                if (editingStaffId === s.staffId) {
                  return (
                    <tr key={s.staffId}>
                      <td colSpan={7} style={tableCell}>
                        <StaffForm
                          locationId={locationId}
                          employee={s}
                          onSuccess={() => {
                            setEditingStaffId(null);
                            router.refresh();
                          }}
                          onCancel={() => setEditingStaffId(null)}
                        />
                      </td>
                    </tr>
                  );
                }
                const togglingActive = pendingAction === `active-${s.staffId}`;
                return (
                  <tr key={s.staffId}>
                    <td style={tableCell}>{s.name}</td>
                    <td style={tableCell}>{s.positionLabel ?? '-'}</td>
                    <td style={tableCell}>{s.employmentType ?? '-'}</td>
                    <td style={tableCell}>
                      <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={tableCell}>
                      <LineLinkForm
                        employeeId={s.staffId}
                        isLinked={isLineLinkedByEmployeeId.get(s.staffId) ?? false}
                        onSuccess={() => router.refresh()}
                      />
                    </td>
                    <td style={tableCell}>
                      <InvitationCell
                        hasAccountAccess={s.hasAccountAccess}
                        employeeId={s.staffId}
                        invitation={latestInvitationByEmployeeId.get(s.staffId) ?? null}
                        onChange={() => router.refresh()}
                      />
                    </td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" style={buttonSecondary} disabled={isPending} onClick={() => setEditingStaffId(s.staffId)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          style={isPending && togglingActive ? buttonDisabled : s.isActive ? buttonDanger : buttonSecondary}
                          disabled={isPending}
                          onClick={() => handleSetActive(s.staffId, !s.isActive)}
                        >
                          {togglingActive ? 'Saving...' : s.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            <Link href={`/dashboard/workforce/manager?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week
            </Link>
            <Link
              href="/dashboard/workforce/manager"
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              This week
            </Link>
            <Link href={`/dashboard/workforce/manager?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
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
                      const key = cellKey(s.staffId, date);
                      const entry = assignmentFor(s.staffId, date);

                      if (editingCellKey === key) {
                        return (
                          <td key={date} style={tableCell}>
                            <ShiftCellEditor
                              locationId={locationId}
                              workDate={date}
                              rowStaffId={s.staffId}
                              existing={
                                entry
                                  ? { assignment: entry.assignment, startsAtLocal: entry.startsAtLocal, endsAtLocal: entry.endsAtLocal }
                                  : undefined
                              }
                              staff={staff ?? []}
                              shiftTypes={shiftTypes ?? []}
                              onSuccess={() => {
                                setEditingCellKey(null);
                                router.refresh();
                              }}
                              onCancel={() => setEditingCellKey(null)}
                            />
                          </td>
                        );
                      }

                      if (!entry) {
                        return (
                          <td key={date} style={tableCell}>
                            {s.isActive ? (
                              <button type="button" style={buttonSecondary} disabled={isPending} onClick={() => setEditingCellKey(key)}>
                                Assign
                              </button>
                            ) : (
                              <span style={mutedText}>-</span>
                            )}
                          </td>
                        );
                      }
                      const shiftType = entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId) : undefined;
                      const unassigning = pendingAction === `unassign-${entry.assignment.assignmentId}`;
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
                            {entry.assignment.published ? (
                              <span style={{ ...mutedText, fontSize: 12 }}>Published -- read-only</span>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  style={buttonSecondary}
                                  disabled={isPending}
                                  onClick={() => setEditingCellKey(key)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  style={isPending && unassigning ? buttonDisabled : buttonSecondary}
                                  disabled={isPending}
                                  onClick={() => handleUnassign(entry)}
                                >
                                  {unassigning ? 'Unassigning...' : 'Unassign'}
                                </button>
                              </div>
                            )}
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

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Actions</h3>
          <p style={{ margin: '8px 0 12px', ...mutedText }}>
            Auto-distribution uses a fixed cafe default (1 staff for the AM window, 1 for the PM window, every day) --
            there is no settings screen for this yet.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonPrimary}
              disabled={isPending}
              onClick={handleAutoDistribute}
            >
              {pendingAction === 'auto-distribute' ? 'Running...' : 'Run auto-distribution'}
            </button>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonSecondary}
              disabled={isPending}
              onClick={handlePublish}
            >
              {pendingAction === 'publish' ? 'Publishing...' : 'Publish schedule'}
            </button>
          </div>
        </div>
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
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCorrections.map((r) => {
                    const deciding = pendingAction === `decide-${r.requestId}`;
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
                        <td style={tableCell}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              style={isPending ? buttonDisabled : buttonPrimary}
                              disabled={isPending}
                              onClick={() => handleDecideCorrection(r.requestId, 'approved')}
                            >
                              {deciding ? 'Saving...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              style={isPending ? buttonDisabled : buttonSecondary}
                              disabled={isPending}
                              onClick={() => handleDecideCorrection(r.requestId, 'rejected')}
                            >
                              {deciding ? 'Saving...' : 'Reject'}
                            </button>
                          </div>
                        </td>
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
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Attendance</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Transportation</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Daily message</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedCorrections.map((r) => {
                      const relatedAttendance = r.attendanceId ? attendanceById.get(r.attendanceId) : undefined;
                      return (
                        <tr key={r.requestId}>
                          <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                          <td style={tableCell}>{r.workDate}</td>
                          <td style={tableCell}>{typeof r.details.message === 'string' ? r.details.message : '-'}</td>
                          <td style={tableCell}>
                            {relatedAttendance
                              ? `${relatedAttendance.clockIn ? utcIsoToLocalDateTime(relatedAttendance.clockIn, timeZone).localTime : '-'} - ${relatedAttendance.clockOut ? utcIsoToLocalDateTime(relatedAttendance.clockOut, timeZone).localTime : '-'}`
                              : '-'}
                          </td>
                          <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                          <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                          <td style={tableCell}>
                            <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
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
