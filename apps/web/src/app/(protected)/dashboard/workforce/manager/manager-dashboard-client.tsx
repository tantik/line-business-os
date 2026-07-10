'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceWriteResult } from '@/lib/workforce/result-types';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { runAutoDistribution, publishSchedule, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
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
  shiftTypes: WorkforceShiftType[] | null;
  requests: WorkforceShiftRequest[] | null;
  assignments: WorkforceShiftAssignment[] | null;
}

function describeWriteError(result: Exclude<WorkforceWriteResult<unknown>, { status: 'success' }>): string {
  switch (result.status) {
    case 'not_found':
      return 'Not found.';
    case 'not_authenticated':
      return 'Please sign in again.';
    case 'no_membership':
      return 'You are not a member of this workspace.';
    default:
      return result.message;
  }
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
  shiftTypes,
  requests,
  assignments,
}: ManagerDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const dates = useMemo(() => weekDates(periodStart), [periodStart]);

  const shiftTypeById = useMemo(
    () => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])),
    [shiftTypes],
  );
  const staffById = useMemo(() => new Map((staff ?? []).map((s) => [s.staffId, s])), [staff]);

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
          message: `Created ${r.draftCount} draft shift(s). Shortages: ${r.shortages.length}, unplaced: ${r.unplaced.length}, staff with no submitted preferences: ${r.nonSubmitters.length}.`,
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

  return (
    <>
      {banner ? (
        <div style={{ ...(banner.tone === 'error' ? alertDanger : alertSuccess), marginTop: 16 }}>{banner.message}</div>
      ) : null}

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                  <td style={tableCell}>{st.code}</td>
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
                    <tr key={r.requestId}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>
                        {r.isUnavailable ? 'Unavailable' : shiftTypeById.get(r.shiftTypeId ?? '')?.code ?? '-'}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Weekly schedule ({periodStart} - {periodEnd})
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/dashboard/workforce/manager?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              Prev week
            </Link>
            <Link href="/dashboard/workforce/manager" style={buttonSecondary}>
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
                      const entry = assignmentFor(s.staffId, date);
                      if (!entry) {
                        return (
                          <td key={date} style={{ ...tableCell, ...mutedText }}>
                            -
                          </td>
                        );
                      }
                      const shiftType = entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId) : undefined;
                      const unassigning = pendingAction === `unassign-${entry.assignment.assignmentId}`;
                      return (
                        <td key={date} style={tableCell}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span>
                              {shiftType?.code ?? 'Custom'}{' '}
                              <span style={badgeStyle(entry.assignment.published ? 'active' : 'neutral')}>
                                {entry.assignment.published ? 'Published' : 'Draft'}
                              </span>
                            </span>
                            <button
                              type="button"
                              style={isPending && unassigning ? buttonDisabled : buttonSecondary}
                              disabled={isPending}
                              onClick={() => handleUnassign(entry)}
                            >
                              {unassigning ? 'Unassigning...' : 'Unassign'}
                            </button>
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
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Actions</h2>
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
      </section>

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/workforce" style={{ ...linkAccent, fontSize: 14, textDecoration: 'underline' }}>
          Back to Workforce
        </Link>
      </p>
    </>
  );
}
