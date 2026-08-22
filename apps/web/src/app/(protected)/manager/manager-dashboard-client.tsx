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
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { shiftTypeDisplayLabel, shiftTypesForWeekLegend } from '@/lib/workforce/shift-types';
import type { RunAutoDistributionActionResult } from '@/lib/workforce/schedule-types';
import { runAutoDistribution, undoAutoDistribution, publishSchedule } from '@/lib/workforce/schedule-actions';
import { setEmployeeActive } from '@/lib/workforce/staff-actions';
import { decideCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { assignShiftExchangeReplacement, decideShiftExchange } from '@/lib/workforce/shift-exchange-actions';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import {
  buildManagerAttentionQueue,
  computeManagerAttention,
  computePendingCorrectionCellKeys,
  computeUnavailableConflictCellKeys,
  computeUnavailableConflictRecords,
  computeUnderstaffedDateKeys,
} from '@/lib/workforce/manager-attention';
import { weekOffsetForWorkDate } from '@/lib/workforce/period';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import { PreviewLanguageToggle } from '@/lib/preview/preview-language-toggle';
import { SignOutButton } from '@/components/sign-out-button';
import {
  autoDistributionCreatedMessage,
  preferencesHeadingValue,
  publishedCountMessage,
  scheduleHeadingValue,
  staffSummaryLabel,
  tManagerDashboard,
  unavailableConflictBadgeLabel,
} from './manager-dashboard-i18n';
import { AttentionPanel } from './attention-panel';
import { BrandBadge } from './brand-badge';
import { EntryPointsCard } from '../_ui/entry-points-card';
import { ManageStaffPopup } from './manage-staff-popup';
import { InventoryPopup } from './inventory-popup';
import { RecipesPopup } from './recipes-popup';
import { ShiftCellEditorModal } from './shift-cell-editor';
import { StaffNameDetailPopup } from './staff-name-detail-popup';
import { CorrectionRequestsPopup } from './correction-requests-popup';
import { ShiftExchangeRequestsPopup } from './shift-exchange-requests-popup';
import { SettingsSection } from './settings-section';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { ConfirmDialog, HelpIconButton, Modal } from '@/components/shared/design-kit';
import { markPopupTriggerClick } from '@/lib/ui/popup-timing';
import hoverStyles from '@/lib/ui/theme.module.css';
import {
  alertDanger,
  backLink,
  badgeStyle,
  buttonDisabled,
  buttonPrimary,
  buttonSecondary,
  card,
  colors,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
import {
  primaryCard,
  shiftChipColors,
  shiftChipStyle,
  todayIsoInTimeZone,
  todayRowStyle,
} from '../_ui/workforce-theme';
import { describeWriteError } from './error-copy';
import styles from '@/lib/ui/responsive-table.module.css';

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

/** WP-8: red "!" marker, shared shape for both the understaffed-day column header and the per-cell pending-correction indicator. */
const dangerMarkerStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  borderRadius: 999,
  background: colors.danger,
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  flexShrink: 0,
} as const;

const pendingCorrectionMarkerStyle = dangerMarkerStyle;
const understaffedMarkerStyle = dangerMarkerStyle;

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
  /** This location's inventory item statuses, read-only, for the Attention layer's shortage count. `null` when the module is disabled or the read failed (never rendered as a zero-shortage attention item). Also the exact data the Inventory popup (WP A5a) renders -- no separate fetch. */
  inventoryItems: InventoryItemStatus[] | null;
  /** `?popup=` query param, parsed server-side (page.tsx) -- auto-opens the matching popup on first render (e.g. a bookmarked/redirected `/inventory` or `/recipes` visit). */
  initialPopup: 'inventory' | 'recipes' | null;
  /** `?focusCell=employeeId:workDate` query param, parsed server-side (page.tsx) -- set by Attention's "View shift" action so a schedule conflict lands the Manager directly on the affected cell instead of making them search the whole displayed week. `null` on a normal visit. */
  initialFocusCell: { employeeId: string; workDate: string } | null;
  /** Recipe list data for the Recipes popup (WP A5b) -- same reads `/recipes/page.tsx` itself makes; recipe detail is fetched lazily, client-side, only once a specific recipe is opened. */
  recipeGroups: WorkforceRecipeGroup[] | null;
  recipeTitleFieldByRecipeId: Record<string, RecipeTranslationField>;
  recipeMediaUrlByRecipeId: Record<string, string>;
  recipeCanManage: boolean;
  /** Per-weekday staffing requirements + max monthly hours (WP A8's Settings section). `null` when no row has been saved yet -- the section renders its own defaults in that case. */
  scheduleSettings: WorkforceScheduleSettings | null;
}

function weekDates(periodStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addIsoDays(periodStart, i));
}

function formatWeekday(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
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
  initialPopup,
  initialFocusCell,
  recipeGroups,
  recipeTitleFieldByRecipeId,
  recipeMediaUrlByRecipeId,
  recipeCanManage,
  scheduleSettings,
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
    /** Set only right after a successful auto-distribution run with draftCount > 0 -- lets the banner offer a same-session "Undo" (WP-G). Cleared on any other banner-setting action, on Undo itself, and never persisted/reloaded. */
    undoAssignmentIds?: string[];
  } | null>(null);
  const [undoingAutoDistribute, setUndoingAutoDistribute] = useState(false);
  // Add/Edit-staff state, focus-restore ref-maps, and their Escape handling
  // now live inside `ManageStaffPopup` (WP A4) -- this button just opens the
  // popup; `useRestoreFocusOnClose` (via the design-kit `Modal` it wraps)
  // handles returning focus here on every close path.
  const [staffPopupOpen, setStaffPopupOpen] = useState(false);
  const [inventoryPopupOpen, setInventoryPopupOpen] = useState(initialPopup === 'inventory');
  const [recipesPopupOpen, setRecipesPopupOpen] = useState(initialPopup === 'recipes');
  // WP-11: Correction/Exchange requests moved from always-visible sections into popups, triggered from AttentionPanel's cards.
  const [correctionsPopupOpen, setCorrectionsPopupOpen] = useState(false);
  const [exchangesPopupOpen, setExchangesPopupOpen] = useState(false);
  // WP A6: the cell editor is now a design-kit `Modal` (`ShiftCellEditorModal`),
  // which handles its own focus-restore/Escape internally -- no more
  // ref-map/requestAnimationFrame bookkeeping here.
  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [confirmDeactivateStaffId, setConfirmDeactivateStaffId] = useState<string | null>(null);
  const [scheduleHelpOpen, setScheduleHelpOpen] = useState(false);

  const dates = useMemo(() => weekDates(periodStart), [periodStart]);
  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  const shiftTypeById = useMemo(
    () => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])),
    [shiftTypes],
  );
  // WP A8: passed to shiftChipColors so active shift types never collide on
  // the same chip tone (position-based, not hash-based).
  const activeShiftTypeIds = useMemo(() => (shiftTypes ?? []).filter((st) => st.isActive).map((st) => st.shiftTypeId), [shiftTypes]);
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
  // The Inventory popup's "counted by" label needs the same decrypted
  // staffId -> name map the Staff section already has as `staff` -- no
  // separate fetch, just reshaped here.
  const staffNameById = useMemo(
    () => Object.fromEntries((staff ?? []).map((s) => [s.staffId, s.name])),
    [staff],
  );

  const pendingCorrections = useMemo(
    () => (correctionRequests ?? []).filter((r) => r.status === 'pending'),
    [correctionRequests],
  );
  // WP-11: unsliced -- CorrectionRequestsPopup itself caps to the most-recent
  // 10 by default and offers an "Archive" toggle to see the rest, instead of
  // this component silently discarding anything past 10.
  const decidedCorrections = useMemo(
    () => (correctionRequests ?? []).filter((r) => r.status !== 'pending').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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
  // WP-11: unsliced -- ShiftExchangeRequestsPopup itself caps to the
  // most-recent 10 by default and offers an "Archive" toggle for the rest.
  const decidedExchanges = useMemo(
    () =>
      (shiftExchanges ?? [])
        .filter((e) => e.status === 'approved' || e.status === 'rejected' || e.status === 'cancelled')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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

  const unavailableConflictRecords = useMemo(
    () => computeUnavailableConflictRecords(requests ?? [], localAssignments.map((a) => ({ employeeId: a.assignment.employeeId, workDate: a.workDate }))),
    [requests, localAssignments],
  );

  // WP A6: legend row above the schedule grid -- every active shift type
  // plus any type this displayed week still references even if it has since
  // been deactivated.
  const weekLegendTypes = useMemo(
    () =>
      shiftTypesForWeekLegend(
        (shiftTypes ?? []).filter((st) => st.isActive),
        localAssignments.filter((a) => dates.includes(a.workDate)).map((a) => ({ shiftTypeId: a.assignment.shiftTypeId })),
        shiftTypeById,
      ),
    [shiftTypes, localAssignments, dates, shiftTypeById],
  );

  // WP-8: understaffed-day "!" marker (column header) -- dates in the
  // displayed week whose assigned headcount is below the Settings-configured
  // required headcount for that weekday. Pure frontend, reuses data already
  // loaded (scheduleSettings, localAssignments) -- no new fetch.
  const understaffedDateKeys = useMemo(
    () =>
      computeUnderstaffedDateKeys(
        dates,
        scheduleSettings?.requiredHeadcountByWeekday ?? null,
        localAssignments.filter((a) => dates.includes(a.workDate)).map((a) => a.workDate),
      ),
    [dates, scheduleSettings, localAssignments],
  );

  // WP-8: per-cell "!" marker for a PAST day with a pending correction
  // request awaiting Manager review -- same `pendingCorrections` data the
  // Attention layer and the always-visible corrections section already use.
  const pendingCorrectionCellKeys = useMemo(
    () => computePendingCorrectionCellKeys(pendingCorrections, todayIso),
    [pendingCorrections, todayIso],
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

  // Level-3 concrete "who/what/when" queue behind the Level-1/2 counts above
  // (Manager Attention UX Reconciliation, 2026-08-21) -- built from the same
  // `pendingCorrections`/`pendingExchanges`/conflict/inventory data the
  // counts already derive from, no new fetch or business rule.
  const attentionQueueItems = useMemo(
    () =>
      buildManagerAttentionQueue({
        pendingCorrections: pendingCorrections.map((r) => ({ requestId: r.requestId, employeeId: r.employeeId, workDate: r.workDate })),
        pendingExchanges: pendingExchanges.map((e) => {
          const shift = exchangeAssignmentById.get(e.shiftId);
          return {
            exchangeId: e.exchangeId,
            employeeId: e.requesterEmployeeId,
            workDate: shift ? utcIsoToLocalDateTime(shift.startsAt, timeZone).workDate : null,
            // Mirrors ShiftExchangeRequestsPopup's own `canApprove`: an
            // 'exchange' request has nothing to approve into until a
            // colleague has accepted it.
            canApprove: e.requestKind !== 'exchange' || Boolean(e.replacementEmployeeId),
          };
        }),
        unavailableConflicts: unavailableConflictRecords,
        inventoryShortageItems:
          inventoryEnabled && inventoryItems
            ? inventoryItems
                .filter((i) => i.status === 'shortage')
                .map((i) => ({ itemId: i.itemId, name: i.name, actualQuantity: i.actualQuantity, requiredQuantity: i.requiredQuantity }))
            : [],
      }),
    [pendingCorrections, pendingExchanges, exchangeAssignmentById, timeZone, unavailableConflictRecords, inventoryEnabled, inventoryItems],
  );

  // Attention "View shift" deep-link: once the correct week's data has
  // loaded (this only ever fires after a navigation `initialFocusCell`
  // itself triggered, or on first mount from a bookmarked URL), open the
  // same cell editor a manual click would and scroll the schedule into
  // view. `consumedFocusCellRef` prevents re-opening the editor on a later
  // unrelated re-render (e.g. after `router.refresh()` from an unrelated
  // action) once this exact target has already been handled.
  const consumedFocusCellRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialFocusCell) return;
    const key = `${initialFocusCell.employeeId}:${initialFocusCell.workDate}`;
    if (consumedFocusCellRef.current === key) return;
    if (!dates.includes(initialFocusCell.workDate)) return;
    consumedFocusCellRef.current = key;
    setEditingCell({ staffId: initialFocusCell.employeeId, date: initialFocusCell.workDate });
    document.getElementById('weekly-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [initialFocusCell, dates]);

  // Attention "View shift" action (unavailable_conflict queue items): if the
  // conflict's date is already in the Manager's currently displayed week,
  // open the cell editor directly -- no navigation needed. This also makes
  // repeat clicks on the same conflict reliable: routing to a `focusCell`
  // URL that's identical to the current one is a no-op in Next.js (no new
  // navigation, no re-render), so the `initialFocusCell` effect below never
  // re-fires and the editor silently fails to reopen. Only fall back to
  // `router.push` when the conflict is outside the displayed week, since
  // that genuinely requires loading a different week's data first.
  function handleViewShift(employeeId: string, workDate: string) {
    if (dates.includes(workDate)) {
      setEditingCell({ staffId: employeeId, date: workDate });
      document.getElementById('weekly-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const offset = weekOffsetForWorkDate(todayIso, workDate);
    const params = new URLSearchParams();
    if (offset !== 0) params.set('weekOffset', String(offset));
    params.set('focusCell', `${employeeId}:${workDate}`);
    router.push(`/manager?${params.toString()}#weekly-schedule`);
  }

  function assignmentFor(staffId: string, date: string) {
    return localAssignments.find((a) => a.assignment.employeeId === staffId && a.workDate === date);
  }

  function cellKey(staffId: string, date: string) {
    return `${staffId}:${date}`;
  }

  // Shared by the table (>=768px, staff x date grid) and the day-grouped
  // card list (<768px, one card per date) so the assign/edit logic for a
  // single staff/date cell only exists once. Unassign moved into
  // `ShiftCellEditorModal` (WP A6); this just opens that Modal now.
  function renderScheduleCellContent(s: WorkforceStaffManageEntry, date: string) {
    const key = cellKey(s.staffId, date);
    const entry = assignmentFor(s.staffId, date);

    if (!entry) {
      return s.isActive ? (
        <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} disabled={isPending} onClick={() => setEditingCell({ staffId: s.staffId, date })}>
          {t('assign')}
        </button>
      ) : (
        <span style={mutedText}>-</span>
      );
    }

    const shiftType = entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId) : undefined;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={shiftChipStyle(shiftChipColors(entry.assignment.shiftTypeId, activeShiftTypeIds))}>{shiftType?.code ?? 'Custom'}</span>
          <span style={badgeStyle(entry.assignment.published ? 'active' : 'neutral')}>
            {entry.assignment.published ? t('statusPublished') : t('statusDraft')}
          </span>
          {pendingCorrectionCellKeys.has(key) ? (
            <span role="img" aria-label={t('pendingCorrectionCellAriaLabel')} title={t('pendingCorrectionCellAriaLabel')} style={pendingCorrectionMarkerStyle}>
              !
            </span>
          ) : null}
        </div>
        <span style={{ ...mutedText, fontSize: 12 }}>
          {entry.startsAtLocal} - {entry.endsAtLocal}
        </span>
        {unavailableConflictCellKeys.has(key) ? <span style={badgeStyle('warning')}>{unavailableConflictBadgeLabel[lang]}</span> : null}
        {entry.assignment.published ? (
          <span style={{ ...mutedText, fontSize: 12 }}>{t('publishedReadOnly')}</span>
        ) : (
          <button type="button" className={hoverStyles.buttonSecondary} style={buttonSecondary} disabled={isPending} onClick={() => setEditingCell({ staffId: s.staffId, date })}>
            {t('edit')}
          </button>
        )}
      </div>
    );
  }

  function handleSetActive(staffId: string, nextActive: boolean) {
    if (!nextActive) {
      setConfirmDeactivateStaffId(staffId);
      return;
    }
    performSetActive(staffId, true);
  }

  function performSetActive(staffId: string, nextActive: boolean) {
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
          undoAssignmentIds: r.createdAssignmentIds.length > 0 ? r.createdAssignmentIds : undefined,
        });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  function handleUndoAutoDistribute(assignmentIds: string[]) {
    setUndoingAutoDistribute(true);
    startTransition(async () => {
      const result = await undoAutoDistribution({ assignmentIds });
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: t('autoDistributionUndone') });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setUndoingAutoDistribute(false);
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

  function handleAssignReplacement(exchangeId: string, replacementEmployeeId: string) {
    setBanner(null);
    setPendingAction(`assign-replacement-${exchangeId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('exchangeId', exchangeId);
      formData.set('replacementEmployeeId', replacementEmployeeId);
      const result = await assignShiftExchangeReplacement(formData);
      if (result.status === 'success') {
        setBanner({ tone: 'success', message: t('replacementAssigned') });
        router.refresh();
      } else {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      setPendingAction(null);
    });
  }

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          paddingBottom: 20,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BrandBadge label={tenantName} />
          <div>
            <h1 style={{ margin: 0 }}>{t('pageTitle')}</h1>
            <p style={{ margin: '4px 0 0', ...mutedText }}>
              {tenantName} - {locationName}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <PreviewLanguageToggle />
          <SignOutButton label={t('signOut')} />
        </div>
      </header>

      <EntryPointsCard
        heading={t('entryPointsHeading')}
        subtitle={staff === null ? t('staffUnavailable') : staff.length === 0 ? t('staffEmpty') : staffSummaryLabel[lang](staff.filter((s) => s.isActive).length, staff.length)}
        buttons={[
          {
            key: 'recipes',
            label: t('navRecipes'),
            onClick: () => {
              markPopupTriggerClick('recipes');
              setRecipesPopupOpen(true);
            },
          },
          ...(inventoryEnabled
            ? [
                {
                  key: 'inventory',
                  label: t('navInventory'),
                  onClick: () => {
                    markPopupTriggerClick('inventory');
                    setInventoryPopupOpen(true);
                  },
                },
              ]
            : []),
          ...(staff !== null
            ? [
                {
                  key: 'manage-staff',
                  label: t('manageStaff'),
                  onClick: () => {
                    markPopupTriggerClick('manage-staff');
                    setStaffPopupOpen(true);
                  },
                },
              ]
            : []),
        ]}
      />

      <AttentionPanel
        items={attentionItems}
        queueItems={attentionQueueItems}
        lang={lang}
        staffNameById={staffNameById}
        onOpenCorrections={() => {
          markPopupTriggerClick('correction-requests');
          setCorrectionsPopupOpen(true);
        }}
        onOpenExchanges={() => {
          markPopupTriggerClick('shift-exchange-requests');
          setExchangesPopupOpen(true);
        }}
        onOpenInventory={() => {
          markPopupTriggerClick('inventory');
          setInventoryPopupOpen(true);
        }}
        onViewShift={handleViewShift}
      />

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
          {banner.undoAssignmentIds ? (
            <button
              type="button"
              className={hoverStyles.buttonSecondary}
              style={{ ...(undoingAutoDistribute ? buttonDisabled : buttonSecondary), marginTop: 8 }}
              disabled={undoingAutoDistribute}
              onClick={() => handleUndoAutoDistribute(banner.undoAssignmentIds!)}
            >
              {undoingAutoDistribute ? t('undoing') : t('undoAutoDistribution')}
            </button>
          ) : null}
        </div>
      ) : null}

      <ManageStaffPopup
        open={staffPopupOpen}
        onClose={() => setStaffPopupOpen(false)}
        locationId={locationId}
        staff={staff}
        isLineLinkedByEmployeeId={isLineLinkedByEmployeeId}
        latestInvitationByEmployeeId={latestInvitationByEmployeeId}
        isPending={isPending}
        pendingAction={pendingAction}
        onSetActive={handleSetActive}
        onChange={() => router.refresh()}
        lang={lang}
      />

      <ConfirmDialog
        open={confirmDeactivateStaffId !== null}
        title={t('confirmDeactivate')}
        confirmLabel={t('deactivate')}
        cancelLabel={t('cancel')}
        pending={isPending}
        danger
        onCancel={() => setConfirmDeactivateStaffId(null)}
        onConfirm={() => {
          const staffId = confirmDeactivateStaffId;
          setConfirmDeactivateStaffId(null);
          if (staffId) performSetActive(staffId, false);
        }}
      >
        {confirmDeactivateStaffId ? staffById.get(confirmDeactivateStaffId)?.name ?? '' : ''}
      </ConfirmDialog>

      <InventoryPopup
        open={inventoryPopupOpen}
        onClose={() => setInventoryPopupOpen(false)}
        tenantName={tenantName}
        locationName={locationName}
        locationId={locationId}
        locationTimezone={timeZone}
        items={inventoryItems}
        staffNameById={staffNameById}
      />

      <RecipesPopup
        open={recipesPopupOpen}
        onClose={() => setRecipesPopupOpen(false)}
        tenantName={tenantName}
        groups={recipeGroups}
        titleFieldByRecipeId={recipeTitleFieldByRecipeId}
        mediaUrlByRecipeId={recipeMediaUrlByRecipeId}
        canManage={recipeCanManage}
        onChange={() => router.refresh()}
      />

      <section id="weekly-schedule" style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{scheduleHeadingValue[lang](periodStart, periodEnd)}</h2>
            <HelpIconButton ariaLabel={t('scheduleHelpAriaLabel')} onClick={() => setScheduleHelpOpen(true)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/manager?weekOffset=${weekOffset - 1}`} className={hoverStyles.buttonSecondary} style={buttonSecondary}>
              {t('prevWeek')}
            </Link>
            <Link
              href="/manager"
              style={weekOffset === 0 ? buttonDisabled : buttonSecondary}
              aria-disabled={weekOffset === 0}
            >
              {t('thisWeek')}
            </Link>
            <Link href={`/manager?weekOffset=${weekOffset + 1}`} className={hoverStyles.buttonSecondary} style={buttonSecondary}>
              {t('nextWeek')}
            </Link>
          </div>
        </div>

        <p style={{ margin: '8px 0 0', ...mutedText }}>{t('autoDistributionDescription')}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button
            type="button"
            className={hoverStyles.buttonPrimary}
            style={isPending ? buttonDisabled : buttonPrimary}
            disabled={isPending}
            onClick={handleAutoDistribute}
          >
            {pendingAction === 'auto-distribute' ? t('running') : t('runAutoDistribution')}
          </button>
          <button
            type="button"
            className={hoverStyles.buttonSecondary}
            style={isPending ? buttonDisabled : buttonSecondary}
            disabled={isPending}
            onClick={handlePublish}
          >
            {pendingAction === 'publish' ? t('publishing') : t('publishSchedule')}
          </button>
        </div>

        {weekLegendTypes.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {weekLegendTypes.map((st) => (
              <span key={st.shiftTypeId} style={shiftChipStyle(shiftChipColors(st.shiftTypeId, activeShiftTypeIds))}>
                {shiftTypeDisplayLabel(st)} {st.startsAtLocal}-{st.endsAtLocal}
              </span>
            ))}
          </div>
        ) : null}

        {staff === null || staff.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('addStaffToSeeSchedule')}</p>
        ) : (
          <>
          <div className={styles.tableView} style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderCell, textAlign: 'left' }}>{t('colStaff')}</th>
                  {dates.map((date) => (
                    <th key={date} style={{ ...tableHeaderCell, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>
                          {formatWeekday(date)}
                          <br />
                          {date.slice(5)}
                        </span>
                        {/* Fixed-height slot so the header never jumps between weeks, regardless of whether this date is understaffed. */}
                        <span style={{ width: 18, height: 18, flexShrink: 0 }}>
                          {understaffedDateKeys.has(date) ? (
                            <span role="img" aria-label={t('understaffedDayAriaLabel')} title={t('understaffedDayAriaLabel')} style={understaffedMarkerStyle}>
                              !
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.staffId}>
                    <td style={tableCell}>
                      <button type="button" style={{ ...backLink, background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit' }} onClick={() => setStaffDetailId(s.staffId)}>
                        {s.name}
                      </button>
                    </td>
                    {dates.map((date) => (
                      <td key={date} style={tableCell}>
                        {renderScheduleCellContent(s, date)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cardView} style={{ marginTop: 12, flexDirection: 'column', gap: 10 }}>
            {dates.map((date) => (
              <div key={date} style={{ ...card, marginTop: 0 }}>
                <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {formatWeekday(date)} {date.slice(5)}
                  {understaffedDateKeys.has(date) ? (
                    <span role="img" aria-label={t('understaffedDayAriaLabel')} title={t('understaffedDayAriaLabel')} style={understaffedMarkerStyle}>
                      !
                    </span>
                  ) : null}
                </h3>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
                  {staff.map((s) => (
                    <div key={s.staffId} style={{ padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
                      <button
                        type="button"
                        style={{ ...backLink, background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit', display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
                        onClick={() => setStaffDetailId(s.staffId)}
                      >
                        {s.name}
                      </button>
                      {renderScheduleCellContent(s, date)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </section>

      <Modal open={scheduleHelpOpen} onClose={() => setScheduleHelpOpen(false)} title={t('scheduleHelpTitle')} closeLabel={t('cancel')} width="min(480px, 94vw)">
        <div style={{ whiteSpace: 'pre-line' }}>{t('scheduleHelpBody')}</div>
      </Modal>

      <StaffNameDetailPopup
        open={staffDetailId !== null}
        onClose={() => setStaffDetailId(null)}
        staffEntry={staffDetailId ? (staffById.get(staffDetailId) ?? null) : null}
        attendance={attendance ?? []}
        monthPrefix={todayIso.slice(0, 7)}
        lang={lang}
      />

      <ShiftCellEditorModal
        open={editingCell !== null}
        onClose={() => setEditingCell(null)}
        title={editingCell ? `${staffById.get(editingCell.staffId)?.name ?? ''} - ${editingCell.date}` : ''}
        locationId={locationId}
        workDate={editingCell?.date ?? ''}
        existing={
          editingCell
            ? (() => {
                const entry = assignmentFor(editingCell.staffId, editingCell.date);
                return entry ? { assignment: entry.assignment, startsAtLocal: entry.startsAtLocal, endsAtLocal: entry.endsAtLocal } : undefined;
              })()
            : undefined
        }
        rowStaffId={editingCell?.staffId ?? ''}
        staff={staff ?? []}
        shiftTypes={shiftTypes ?? []}
        onSuccess={(kind) => {
          setEditingCell(null);
          if (kind === 'unassigned') setBanner({ tone: 'success', message: t('shiftUnassigned') });
          router.refresh();
        }}
      />

      <SettingsSection
        locationId={locationId}
        settings={scheduleSettings}
        shiftTypes={shiftTypes}
        onShiftTypesChanged={() => router.refresh()}
        lang={lang}
      />

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
                          <span style={shiftChipStyle(shiftChipColors(r.shiftTypeId, activeShiftTypeIds))}>
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

      <CorrectionRequestsPopup
        open={correctionsPopupOpen}
        onClose={() => setCorrectionsPopupOpen(false)}
        pendingCorrections={pendingCorrections}
        decidedCorrections={decidedCorrections}
        staffById={staffById}
        attendanceById={attendanceById}
        timeZone={timeZone}
        isPending={isPending}
        pendingAction={pendingAction}
        onDecide={handleDecideCorrection}
        lang={lang}
      />

      <ShiftExchangeRequestsPopup
        open={exchangesPopupOpen}
        onClose={() => setExchangesPopupOpen(false)}
        pendingExchanges={pendingExchanges}
        decidedExchanges={decidedExchanges}
        staffById={staffById}
        staff={staff ?? []}
        exchangeAssignmentById={exchangeAssignmentById}
        allAssignments={assignments}
        preferences={requests}
        shiftTypes={shiftTypes}
        timeZone={timeZone}
        isPending={isPending}
        pendingAction={pendingAction}
        onDecide={handleDecideExchange}
        onAssignReplacement={handleAssignReplacement}
        lang={lang}
      />

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/workforce" style={backLink}>
          {t('backToWorkforce')}
        </Link>
      </p>
    </>
  );
}
