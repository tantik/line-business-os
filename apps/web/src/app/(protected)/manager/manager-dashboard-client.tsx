'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeLineLink } from '@/lib/workforce/employee-line-links';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import { shiftTypeDisplayLabel } from '@/lib/workforce/shift-types';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { runAutoDistribution, publishSchedule, updateShiftAssignment } from '@/lib/workforce/schedule-actions';
import { setEmployeeActive } from '@/lib/workforce/staff-actions';
import { decideCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { decideShiftExchange } from '@/lib/workforce/shift-exchange-actions';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { computeManagerAttention, computeUnavailableConflictCellKeys, type ManagerAttentionCategory } from '@/lib/workforce/manager-attention';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import {
  attentionCorrectionLabel,
  attentionExchangeLabel,
  attentionInventoryLabel,
  attentionUnavailableConflictLabel,
  autoDistributionCreatedMessage,
  breakMinutesValue,
  preferencesHeadingValue,
  publishedCountMessage,
  scheduleHeadingValue,
  tManagerDashboard,
  unavailableConflictBadgeLabel,
} from './manager-dashboard-i18n';
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
  exchangeStatusBadgeStyle,
  exchangeStatusLabel,
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
  tenantName: string;
  locationName: string;
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
  shiftExchanges: WorkforceShiftExchange[] | null;
  exchangeAssignments: WorkforceShiftAssignment[] | null;
  /** Whether the tenant's separate `inventory` top-level module (ADR 0010) is enabled -- gates only the Attention layer's inventory line; the real Inventory page/RLS remain the authorization boundary. */
  inventoryEnabled: boolean;
  /** This location's inventory item statuses, read-only, for the Attention layer's shortage count. `null` when the module is disabled or the read failed (never rendered as a zero-shortage attention item). */
  inventoryItems: InventoryItemStatus[] | null;
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** Renders the requested clock-in/out/break a correction's `details` carries (see `submitCorrectionRequest`/`decideCorrectionRequest`, shift-requests.ts), so Manager sees what will actually be applied on approval -- not just the free-text reason. */
function formatRequestedCorrectionChange(details: Record<string, unknown>): string {
  const clockIn = typeof details.clockInLocal === 'string' ? details.clockInLocal : null;
  const clockOut = typeof details.clockOutLocal === 'string' ? details.clockOutLocal : null;
  const breakMinutes = typeof details.actualBreakMinutes === 'number' ? details.actualBreakMinutes : null;
  const parts: string[] = [];
  if (clockIn || clockOut) parts.push(`${clockIn ?? '-'} - ${clockOut ?? '-'}`);
  if (breakMinutes !== null) parts.push(`${breakMinutes}min break`);
  return parts.length > 0 ? parts.join(', ') : '-';
}

/**
 * Outer wrapper: mounts the shared `LangProvider` (`@/lib/demo/cafe/i18n`,
 * the same JA/EN mechanism the canonical Staff dashboard already uses)
 * around the whole Manager page body -- Cafe v2.1 Mission 2's first adoption
 * of it on this page (previously English-only, no lang mechanism at all).
 * Split out because a component cannot call `useLang()` above its own
 * `LangProvider` ancestor.
 */
export function ManagerDashboardClient(props: ManagerDashboardClientProps) {
  return (
    <LangProvider>
      <ManagerDashboardBody {...props} />
    </LangProvider>
  );
}

const ATTENTION_ANCHOR: Record<ManagerAttentionCategory, string> = {
  correction: '#correction-requests',
  exchange: '#shift-exchange-requests',
  unavailable_conflict: '#weekly-schedule',
  inventory: '/inventory',
};

function ManagerDashboardBody({
  tenantName,
  locationName,
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
  shiftExchanges,
  exchangeAssignments,
  inventoryEnabled,
  inventoryItems,
}: ManagerDashboardClientProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tManagerDashboard>[1]) => tManagerDashboard(lang, key);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    tone: 'success' | 'error';
    message: string;
    stats?: { label: string; value: number }[];
  } | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const addStaffButtonRef = useRef<HTMLButtonElement>(null);

  function closeAddStaffForm() {
    setAddingStaff(false);
    // Restore focus to the control that opened this inline form -- it isn't
    // a true dialog (no focus trap), but leaving focus on the just-removed
    // form controls drops it to <body>, disorienting keyboard/screen-reader use.
    requestAnimationFrame(() => addStaffButtonRef.current?.focus());
  }

  const editStaffButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  function closeEditStaffForm(staffId: string) {
    setEditingStaffId(null);
    requestAnimationFrame(() => editStaffButtonRefs.current.get(staffId)?.focus());
  }
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const cellButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  function closeCellEditor(key: string) {
    setEditingCellKey(null);
    // Same focus-restoration convention as closeAddStaffForm/closeEditStaffForm
    // above -- the Shift Cell Editor isn't a true dialog either, so leaving
    // focus on the just-removed form controls drops it to <body>.
    requestAnimationFrame(() => cellButtonRefs.current.get(key)?.focus());
  }

  // Escape closes whichever inline Add/Edit form is currently open -- these
  // aren't true dialogs (no overlay/focus trap), but a keyboard user still
  // expects Escape to back out of an open form, same as a real dialog would.
  useEffect(() => {
    if (!addingStaff && !editingStaffId && !editingCellKey) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (addingStaff) closeAddStaffForm();
      else if (editingStaffId) closeEditStaffForm(editingStaffId);
      else if (editingCellKey) closeCellEditor(editingCellKey);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addingStaff, editingStaffId, editingCellKey]);

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

  // 'open' (no candidate yet, or a plain change/cancel request) and
  // 'accepted' (a colleague has taken an exchange, awaiting Manager
  // decision) are the two states a Manager can act on -- mirrors
  // `PreviewShiftExchangeManagerPanel`'s `relevant` filter.
  const pendingExchanges = useMemo(
    () => (shiftExchanges ?? []).filter((e) => e.status === 'open' || e.status === 'accepted'),
    [shiftExchanges],
  );
  const decidedExchanges = useMemo(
    () =>
      (shiftExchanges ?? [])
        .filter((e) => e.status === 'approved' || e.status === 'rejected' || e.status === 'cancelled')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 10),
    [shiftExchanges],
  );
  const exchangeAssignmentById = useMemo(
    () => new Map((exchangeAssignments ?? []).map((a) => [a.assignmentId, a])),
    [exchangeAssignments],
  );

  // Server-computed per-item shortage status (`api.inventory_item_status`),
  // same derivation the Inventory dashboard's own count badge already uses
  // -- not a new business rule, just read here too. `null` (not 0) when the
  // module is disabled or the read failed, so the Attention layer omits the
  // line entirely instead of falsely claiming "0 items need restocking".
  const inventoryShortageCount = useMemo(
    () => (inventoryEnabled && inventoryItems ? inventoryItems.filter((i) => i.status === 'shortage').length : null),
    [inventoryEnabled, inventoryItems],
  );

  const attentionLabel: Record<ManagerAttentionCategory, (count: number) => string> = {
    correction: (count) => attentionCorrectionLabel[lang](count),
    exchange: (count) => attentionExchangeLabel[lang](count),
    unavailable_conflict: (count) => attentionUnavailableConflictLabel[lang](count),
    inventory: (count) => attentionInventoryLabel[lang](count),
  };

  const localAssignments = useMemo(
    () =>
      (assignments ?? []).map((a) => {
        const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
        const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
        return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
      }),
    [assignments, timeZone],
  );

  // Cafe v2.1 QA audit P2-10: employee/date pairs with both a submitted
  // Unavailable preference and a currently assigned (draft or published)
  // shift -- previously publishable with no warning at all.
  const unavailableConflictCellKeys = useMemo(
    () => computeUnavailableConflictCellKeys(requests ?? [], localAssignments.map((a) => ({ employeeId: a.assignment.employeeId, workDate: a.workDate }))),
    [requests, localAssignments],
  );

  const attentionItems = useMemo(
    () =>
      computeManagerAttention({
        pendingCorrectionCount: pendingCorrections.length,
        pendingExchangeCount: pendingExchanges.length,
        unavailableConflictCount: unavailableConflictCellKeys.size,
        inventoryShortageCount,
      }),
    [pendingCorrections.length, pendingExchanges.length, unavailableConflictCellKeys, inventoryShortageCount],
  );

  function assignmentFor(staffId: string, date: string) {
    return localAssignments.find((a) => a.assignment.employeeId === staffId && a.workDate === date);
  }

  function cellKey(staffId: string, date: string) {
    return `${staffId}:${date}`;
  }

  function handleSetActive(staffId: string, nextActive: boolean) {
    if (!nextActive && !window.confirm(t('confirmDeactivate'))) return;
    setBanner(null);
    setPendingAction(`active-${staffId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('staffId', staffId);
      if (nextActive) formData.set('isActive', 'true');
      const result = await setEmployeeActive(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: nextActive ? t('staffActivated') : t('staffDeactivated') });
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
          message: autoDistributionCreatedMessage[lang](r.draftCount),
          stats: [
            { label: t('draftShiftsLabel'), value: r.draftCount },
            { label: t('shortagesLabel'), value: r.shortages.length },
            { label: t('unplacedLabel'), value: r.unplaced.length },
            { label: t('nonSubmittersLabel'), value: r.nonSubmitters.length },
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
    if (!window.confirm(t('confirmPublish'))) return;
    setBanner(null);
    setPendingAction('publish');
    startTransition(async () => {
      const formData = new FormData();
      formData.set('locationId', locationId);
      formData.set('periodStart', periodStart);
      formData.set('periodEnd', periodEnd);
      const result = await publishSchedule(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: publishedCountMessage[lang](result.data.published) });
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
        setBanner({ tone: 'success', message: t('shiftUnassigned') });
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
        setBanner({ tone: 'success', message: decision === 'approved' ? t('correctionApproved') : t('correctionRejected') });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handleDecideExchange(exchangeId: string, decision: 'approved' | 'rejected') {
    setBanner(null);
    setPendingAction(`decide-exchange-${exchangeId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('exchangeId', exchangeId);
      formData.set('decision', decision);
      const result = await decideShiftExchange(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: decision === 'approved' ? t('exchangeApproved') : t('exchangeRejected') });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
          <p style={{ margin: '8px 0 0', ...mutedText }}>
            {tenantName} - {locationName}
          </p>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <Link href="/recipes" style={{ ...linkAccent, fontSize: 14, textDecoration: 'underline' }}>
              {t('navRecipes')}
            </Link>
            <Link href="/inventory" style={{ ...linkAccent, fontSize: 14, textDecoration: 'underline' }}>
              {t('navInventory')}
            </Link>
          </nav>
        </div>
        <SignOutButton label={t('signOut')} />
      </header>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <PreviewLanguageToggle variant="dark" />
      </div>

      <section style={{ ...card, borderLeft: `3px solid ${attentionItems.length > 0 ? colors.warning : colors.success}` }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('attentionHeading')}</h2>
        {attentionItems.length === 0 ? (
          <p style={{ margin: '10px 0 0', ...mutedText }}>{t('attentionAllClear')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attentionItems.map((item) => (
              <li
                key={item.category}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  minHeight: 44,
                  borderRadius: 8,
                  background: colors.surfaceElevated,
                }}
              >
                <span style={{ fontSize: 14 }}>{attentionLabel[item.category](item.count)}</span>
                <Link
                  href={ATTENTION_ANCHOR[item.category]}
                  style={{ ...buttonSecondary, textDecoration: 'none', minHeight: 36, display: 'inline-flex', alignItems: 'center' }}
                >
                  {t('attentionReview')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
          <h2 style={{ margin: 0, fontSize: 16 }}>{t('staffHeading')}</h2>
          {staff !== null && !addingStaff ? (
            <button ref={addStaffButtonRef} type="button" style={buttonSecondary} onClick={() => setAddingStaff(true)}>
              {t('addStaff')}
            </button>
          ) : null}
        </div>

        {addingStaff ? (
          <StaffForm
            locationId={locationId}
            onSuccess={() => {
              closeAddStaffForm();
              router.refresh();
            }}
            onCancel={closeAddStaffForm}
          />
        ) : null}

        {staff === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('staffUnavailable')}</p>
        ) : staff.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('staffEmpty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colName')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colPosition')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colEmploymentType')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colLine')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>アクセス</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th>
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
                            closeEditStaffForm(s.staffId);
                            router.refresh();
                          }}
                          onCancel={() => closeEditStaffForm(s.staffId)}
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
                      <span style={badgeStyle(s.isActive ? 'active' : 'inactive')}>{s.isActive ? t('statusActive') : t('statusInactive')}</span>
                    </td>
                    <td style={tableCell}>
                      <LineLinkForm
                        employeeId={s.staffId}
                        isLinked={isLineLinkedByEmployeeId.get(s.staffId) ?? false}
                        onSuccess={() => router.refresh()}
                        lang={lang}
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
                        <button
                          ref={(el) => {
                            editStaffButtonRefs.current.set(s.staffId, el);
                          }}
                          type="button"
                          style={buttonSecondary}
                          disabled={isPending}
                          onClick={() => setEditingStaffId(s.staffId)}
                        >
                          {t('edit')}
                        </button>
                        <button
                          type="button"
                          style={isPending && togglingActive ? buttonDisabled : s.isActive ? buttonDanger : buttonSecondary}
                          disabled={isPending}
                          onClick={() => handleSetActive(s.staffId, !s.isActive)}
                        >
                          {togglingActive ? t('saving') : s.isActive ? t('deactivate') : t('activate')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section id="weekly-schedule" style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{scheduleHeadingValue[lang](periodStart, periodEnd)}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/manager?weekOffset=${weekOffset - 1}`} style={buttonSecondary}>
              {t('prevWeek')}
            </Link>
            <Link
              href="/manager"
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              {t('thisWeek')}
            </Link>
            <Link href={`/manager?weekOffset=${weekOffset + 1}`} style={buttonSecondary}>
              {t('nextWeek')}
            </Link>
          </div>
        </div>

        {staff === null || staff.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('addStaffToSeeSchedule')}</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
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
                                closeCellEditor(key);
                                router.refresh();
                              }}
                              onCancel={() => closeCellEditor(key)}
                            />
                          </td>
                        );
                      }

                      if (!entry) {
                        return (
                          <td key={date} style={tableCell}>
                            {s.isActive ? (
                              <button
                                ref={(el) => {
                                  cellButtonRefs.current.set(key, el);
                                }}
                                type="button"
                                style={buttonSecondary}
                                disabled={isPending}
                                onClick={() => setEditingCellKey(key)}
                              >
                                {t('assign')}
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
                                {entry.assignment.published ? t('statusPublished') : t('statusDraft')}
                              </span>
                            </div>
                            <span style={{ ...mutedText, fontSize: 12 }}>
                              {entry.startsAtLocal} - {entry.endsAtLocal}
                            </span>
                            {unavailableConflictCellKeys.has(key) ? (
                              <span style={badgeStyle('warning')}>{unavailableConflictBadgeLabel[lang]}</span>
                            ) : null}
                            {entry.assignment.published ? (
                              <span style={{ ...mutedText, fontSize: 12 }}>{t('publishedReadOnly')}</span>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  ref={(el) => {
                                    cellButtonRefs.current.set(key, el);
                                  }}
                                  type="button"
                                  style={buttonSecondary}
                                  disabled={isPending}
                                  onClick={() => setEditingCellKey(key)}
                                >
                                  {t('edit')}
                                </button>
                                <button
                                  type="button"
                                  style={isPending && unassigning ? buttonDisabled : buttonSecondary}
                                  disabled={isPending}
                                  onClick={() => handleUnassign(entry)}
                                >
                                  {unassigning ? t('unassigning') : t('unassign')}
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
          <h3 style={{ margin: 0, fontSize: 14 }}>{t('actionsHeading')}</h3>
          <p style={{ margin: '8px 0 12px', ...mutedText }}>{t('autoDistributionDescription')}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonPrimary}
              disabled={isPending}
              onClick={handleAutoDistribute}
            >
              {pendingAction === 'auto-distribute' ? t('running') : t('runAutoDistribution')}
            </button>
            <button
              type="button"
              style={isPending ? buttonDisabled : buttonSecondary}
              disabled={isPending}
              onClick={handlePublish}
            >
              {pendingAction === 'publish' ? t('publishing') : t('publishSchedule')}
            </button>
          </div>
        </div>
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('shiftTypesHeading')}</h2>
        {shiftTypes === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('shiftTypesUnavailable')}</p>
        ) : shiftTypes.length === 0 ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('shiftTypesEmpty')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colCode')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colLabel')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colTime')}</th>
                <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colBreak')}</th>
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
                  <td style={tableCell}>{breakMinutesValue[lang](st.breakMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{preferencesHeadingValue[lang](periodStart, periodEnd)}</h2>
        {requests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('preferencesUnavailable')}</p>
        ) : (
          (() => {
            const inPeriod = requests.filter((r) => r.workDate >= periodStart && r.workDate <= periodEnd);
            if (inPeriod.length === 0) {
              return <p style={{ margin: '8px 0 0', ...mutedText }}>{t('preferencesEmpty')}</p>;
            }
            return (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDate')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colPreference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod.map((r) => (
                    <tr key={r.requestId} style={r.workDate === todayIso ? todayRowStyle : undefined}>
                      <td style={tableCell}>{staffById.get(r.employeeId)?.name ?? r.employeeId}</td>
                      <td style={tableCell}>{r.workDate}</td>
                      <td style={tableCell}>
                        {r.isUnavailable ? (
                          t('unavailableValue')
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
              </div>
            );
          })()
        )}
      </section>

      <section id="correction-requests" style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('correctionsHeading')}</h2>
        {correctionRequests === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('correctionsUnavailable')}</p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('needsActionEyebrow')}
            </p>
            {pendingCorrections.length === 0 ? (
              <p style={{ margin: '8px 0 0', ...mutedText }}>{t('noPendingCorrections')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDate')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colMessage')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colAttendance')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequested')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colTransportation')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDailyMessage')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th>
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
                        <td style={tableCell}>{formatRequestedCorrectionChange(r.details)}</td>
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
                              {deciding ? t('saving') : t('approve')}
                            </button>
                            <button
                              type="button"
                              style={isPending ? buttonDisabled : buttonSecondary}
                              disabled={isPending}
                              onClick={() => handleDecideCorrection(r.requestId, 'rejected')}
                            >
                              {deciding ? t('saving') : t('reject')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            {decidedCorrections.length > 0 ? (
              <div style={{ marginTop: 16, background: colors.surfaceElevated, borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>{t('recentlyDecided')}</h3>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDate')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colMessage')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colAttendance')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequested')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colTransportation')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colDailyMessage')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus2')}</th>
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
                          <td style={tableCell}>{formatRequestedCorrectionChange(r.details)}</td>
                          <td style={tableCell}>{relatedAttendance?.transportationCost ?? '-'}</td>
                          <td style={tableCell}>{relatedAttendance?.dailyMessage ?? '-'}</td>
                          <td style={tableCell}>
                            <span style={correctionStatusBadgeStyle(r.status)}>{correctionStatusLabel(r.status, lang)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section id="shift-exchange-requests" style={card}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{t('exchangesHeading')}</h2>
        {shiftExchanges === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('exchangesUnavailable')}</p>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', ...mutedText, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('needsActionEyebrow')}
            </p>
            {pendingExchanges.length === 0 ? (
              <p style={{ margin: '8px 0 0', ...mutedText }}>{t('noPendingExchanges')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequester')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colShift')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequest')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colReason')}</th>
                    <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingExchanges.map((e) => {
                    const deciding = pendingAction === `decide-exchange-${e.exchangeId}`;
                    const shift = exchangeAssignmentById.get(e.shiftId);
                    const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
                    const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
                    const replacementName = e.replacementEmployeeId
                      ? staffById.get(e.replacementEmployeeId)?.name ?? e.replacementEmployeeId
                      : null;
                    const requestedType = shiftTypes?.find((ty) => ty.shiftTypeId === e.requestedShiftTypeId);
                    const requestLabel =
                      e.requestKind === 'cancel'
                        ? t('requestKindCancellation')
                        : e.requestKind === 'change'
                          ? t('requestKindChange')
                          : t('requestKindExchange');
                    // Mirrors `PreviewShiftExchangeManagerPanel`'s `canApprove`: an
                    // 'exchange' request has nothing to approve into until a
                    // colleague has accepted it (replacementEmployeeId set); the
                    // RPC itself also rejects an approve without one.
                    const canApprove = e.requestKind !== 'exchange' || Boolean(e.replacementEmployeeId);
                    return (
                      <tr key={e.exchangeId}>
                        <td style={tableCell}>{requesterName}</td>
                        <td style={tableCell}>{shiftLocal ? `${shiftLocal.workDate} ${shiftLocal.localTime}` : '-'}</td>
                        <td style={tableCell}>
                          {requestLabel}
                          {e.requestKind === 'exchange' ? ` → ${replacementName ?? t('awaitingCandidate')}` : ''}
                          {e.requestKind === 'change' && requestedType
                            ? ` → ${shiftTypeDisplayLabel(requestedType)} (${requestedType.startsAtLocal.slice(0, 5)}–${requestedType.endsAtLocal.slice(0, 5)})`
                            : ''}
                        </td>
                        <td style={tableCell}>{e.reason}</td>
                        <td style={tableCell}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              style={isPending || !canApprove ? buttonDisabled : buttonPrimary}
                              disabled={isPending || !canApprove}
                              onClick={() => handleDecideExchange(e.exchangeId, 'approved')}
                            >
                              {deciding ? t('saving') : t('approve')}
                            </button>
                            <button
                              type="button"
                              style={isPending ? buttonDisabled : buttonSecondary}
                              disabled={isPending}
                              onClick={() => handleDecideExchange(e.exchangeId, 'rejected')}
                            >
                              {deciding ? t('saving') : t('reject')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}

            {decidedExchanges.length > 0 ? (
              <div style={{ marginTop: 16, background: colors.surfaceElevated, borderRadius: 8, padding: 12 }}>
                <h3 style={{ margin: 0, fontSize: 14, ...mutedText }}>{t('recentlyDecided')}</h3>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colRequester')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colShift')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colReason')}</th>
                      <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStatus2')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decidedExchanges.map((e) => {
                      const shift = exchangeAssignmentById.get(e.shiftId);
                      const shiftLocal = shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone) : null;
                      const requesterName = staffById.get(e.requesterEmployeeId)?.name ?? e.requesterEmployeeId;
                      return (
                        <tr key={e.exchangeId}>
                          <td style={tableCell}>{requesterName}</td>
                          <td style={tableCell}>{shiftLocal ? `${shiftLocal.workDate} ${shiftLocal.localTime}` : '-'}</td>
                          <td style={tableCell}>{e.reason}</td>
                          <td style={tableCell}>
                            <span style={exchangeStatusBadgeStyle(e.status)}>{exchangeStatusLabel(e.status, lang)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/workforce" style={{ ...linkAccent, fontSize: 14, textDecoration: 'underline' }}>
          {t('backToWorkforce')}
        </Link>
      </p>
    </>
  );
}
