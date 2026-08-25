'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceStaffManageEntry } from '@/lib/workforce/employees';
import type { WorkforceEmployeeLineLink } from '@/lib/workforce/employee-line-links';
import type { WorkforceEmployeeInvitation } from '@/lib/workforce/invitations';
import type { WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest, ShiftRequestDecision } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceStaffMessage } from '@/lib/workforce/staff-messages';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import type { PurchaseNeededItem } from '@/lib/purchases/items';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { shiftTypeDisplayLabel, shiftTypesForWeekLegend } from '@/lib/workforce/shift-types';
import { setEmployeeActive } from '@/lib/workforce/staff-actions';
import { decideCorrectionRequest } from '@/lib/workforce/attendance-actions';
import { assignShiftExchangeReplacement, decideShiftExchange } from '@/lib/workforce/shift-exchange-actions';
import {
  archiveStaffMessageAction,
  markStaffMessageReadAction,
  submitManagerMessage,
} from '@/lib/workforce/staff-messages-actions';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import {
  buildManagerAttentionQueue,
  computeManagerAttention,
  computePendingCorrectionCellKeys,
  computeUnavailableConflictCellKeys,
  computeUnavailableConflictRecords,
  computeDailyStaffingCoverage,
} from '@/lib/workforce/manager-attention';
import { weekOffsetForWorkDate } from '@/lib/workforce/period';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import {
  dailyStaffingShortageExplanation,
  scheduleHeadingValue,
  staffSummaryLabel,
  tManagerDashboard,
} from './manager-dashboard-i18n';
import { AttentionPanel } from './attention-panel';
import { EntryPointsCard } from '../_ui/entry-points-card';
import { BrandBadge } from '../_ui/brand-badge';
import { AccountMenu } from '../_ui/account-menu';
import { ManageStaffPopup } from './manage-staff-popup';
import { InventoryPopup } from '../_ui/inventory-popup';
import { PurchasesPopup } from '../_ui/purchases-popup';
import { RecipesPopup } from '../_ui/recipes-popup';
import { ShiftCellEditorModal } from './shift-cell-editor';
import { StaffNameDetailPopup } from './staff-name-detail-popup';
import { CorrectionRequestsPopup } from './correction-requests-popup';
import { ShiftRequestsReviewPopup } from './shift-requests-review-popup';
import { ShiftExchangeRequestsPopup } from './shift-exchange-requests-popup';
import { StaffMessagesPopup } from './staff-messages-popup';
import { SettingsSection } from './settings-section';
import type { WorkforceScheduleSettings } from '@/lib/workforce/schedule-settings';
import { ConfirmDialog, HelpIconButton, Modal } from '@/components/shared/design-kit';
import { markPopupTriggerClick } from '@/lib/ui/popup-timing';
import hoverStyles from '@/lib/ui/theme.module.css';
import dashboardStyles from './manager-dashboard.module.css';
import {
  alertDanger,
  buttonDisabled,
  buttonSecondary,
  colors,
  mutedText,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';
import {
  CUSTOM_CHIP_TONE,
  primaryCard,
  shiftChipColors,
  shiftChipStyle,
  todayIsoInTimeZone,
} from '../_ui/workforce-theme';
import { describeWriteError } from './error-copy';

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

/** WP-8: red "!" marker for the understaffed-day column header (the per-cell alert corner used a smaller variant of this shape until the Weekly Schedule redesign folded it directly into `cellAlertCornerStyle`). */
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

const understaffedMarkerStyle = dangerMarkerStyle;

/**
 * Weekly Schedule redesign follow-up (Founder Review, 2026-08-22 continued):
 * the grid previously used `table-layout: auto` with the shared `tableCell`/
 * `tableHeaderCell` tokens' own `borderBottom` only, so column widths and row
 * heights drifted with whatever text happened to be longest that week, and
 * there was no visible per-cell boundary at all. `table-layout: fixed` plus
 * an explicit `<colgroup>` locks every date column to the same width
 * regardless of content; a full `border` on every cell (not just
 * `borderBottom`) restores a real grid-line look -- easy to trace which row/
 * column a cell belongs to, matching the `_client-preview/mame-to-cha`
 * reference table -- while a small `borderSpacing` on the `<table>` (paired
 * with `borderCollapse: 'separate'`) still keeps a thin gap between cells
 * instead of them sharing one collapsed border.
 */
const scheduleTableHeaderCellStyle: CSSProperties = {
  ...tableHeaderCell,
  textAlign: 'left',
  verticalAlign: 'middle',
  border: `1px solid ${colors.border}`,
  padding: '4px 6px',
  background: colors.surfaceElevated,
};
const scheduleTableCellStyle: CSSProperties = { ...tableCell, border: `1px solid ${colors.border}`, padding: '3px' };
const scheduleTodayTint = { background: colors.accentMuted } as const;

/**
 * Weekly Schedule redesign (2026-08-22): the schedule grid cell is now a
 * single whole-cell `<button>` (native keyboard support for free -- Enter/
 * Space, real focus ring, no separate "Assign"/"Edit" button squeezed
 * inside), styled either as a shift chip (filled cell, `tone` from
 * `shiftChipColors`) or a quiet dashed "+" affordance (empty cell, `tone`
 * null). Two small always-decorative overlays (the alert corner and the
 * draft/published dot below) carry secondary state -- the button's own
 * `aria-label`/`title` (built in `renderScheduleCellContent`) is the single
 * source of truth for what a screen reader or a mouse-hover tooltip reports,
 * so those overlays stay `aria-hidden`.
 */
function scheduleCellButtonStyle(tone: { background: string; color: string } | null): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    height: 44,
    padding: '6px 10px',
    borderRadius: 8,
    border: tone ? '1px solid transparent' : `1px dashed ${colors.border}`,
    background: tone ? tone.background : 'transparent',
    color: tone ? tone.color : colors.textMuted,
    fontSize: 12.5,
    fontWeight: 600,
    lineHeight: 1.25,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

const cellAlertCornerStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 13,
  height: 13,
  borderRadius: '50%',
  color: '#fff',
  fontSize: 9.5,
  fontWeight: 700,
  lineHeight: '13px',
  textAlign: 'center',
};

export interface ManagerDashboardClientProps {
  tenantName: string;
  locationName: string;
  locationId: string;
  /** The caller's own decrypted name, for the header account menu -- `null` if the lookup failed (falls back to a generic label, never a placeholder name). */
  displayName: string | null;
  /** The caller's own position label, for the header account menu -- `null` if unset. */
  positionLabel: string | null;
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
  /** Every non-deleted employee thread's messages, tenant-scoped (RLS narrows by the caller's manage-permission location) -- Staff<->Manager Mail module (0090). `null` when the read failed. */
  staffMessages: WorkforceStaffMessage[] | null;
  /** Whether the tenant's separate `inventory` top-level module (ADR 0010) is enabled -- gates only the Attention layer's inventory line; the real Inventory page/RLS remain the authorization boundary. */
  inventoryEnabled: boolean;
  /** This location's inventory item statuses, read-only, for the Attention layer's shortage count. `null` when the module is disabled or the read failed (never rendered as a zero-shortage attention item). Also the exact data the Inventory popup (WP A5a) renders -- no separate fetch. */
  inventoryItems: InventoryItemStatus[] | null;
  /** Signed photo URLs for `inventoryItems`, keyed by `itemId` (see `createInventoryMediaUrlMap`) -- threaded straight to the Inventory popup. */
  inventoryMediaUrlByItemId: Record<string, string>;
  /** This location's Purchases shopping list, read-only -- also the exact data the Purchases popup renders (no separate fetch). `null` when the module is disabled or the read failed. */
  purchasesItems: PurchaseNeededItem[] | null;
  /** `?popup=` query param, parsed server-side (page.tsx) -- auto-opens the matching popup on first render (e.g. a bookmarked/redirected `/inventory`, `/recipes`, or `/purchases` visit). */
  initialPopup: 'inventory' | 'recipes' | 'purchases' | null;
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

/**
 * Round 3 (2026-08-22) week-navigation performance: matches `page.tsx`'s own
 * `MAX_WEEK_OFFSET` sanity cap. Plain Prev/This week/Next clicks used to be
 * `<Link href="/manager?weekOffset=...">` -- a full server navigation that
 * re-ran this page's entire ~16-item data batch (staff, shift types,
 * requests, attendance, invitations, exchanges, inventory, recipes,
 * settings) even though only the assignments actually change per week. The
 * `_client-preview/mame-to-cha` reference surface already proved the fix:
 * preload a bounded assignment window once, then treat week navigation as a
 * pure client-side filter (`activeWeekOffset` state + `window.history.
 * replaceState`, never `router.push`/`router.refresh()`). This page already
 * fetches exactly that window server-side for the shift-exchange panel
 * (`exchangeAssignments`, -8..+8 weeks) -- reused here as the schedule
 * grid's own window instead of adding a second fetch.
 */
const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

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
  displayName,
  positionLabel,
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
  staffMessages,
  inventoryEnabled,
  inventoryItems,
  inventoryMediaUrlByItemId,
  purchasesItems,
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
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  // Add/Edit-staff state, focus-restore ref-maps, and their Escape handling
  // now live inside `ManageStaffPopup` (WP A4) -- this button just opens the
  // popup; `useRestoreFocusOnClose` (via the design-kit `Modal` it wraps)
  // handles returning focus here on every close path.
  const [staffPopupOpen, setStaffPopupOpen] = useState(false);
  const [purchasesPopupOpen, setPurchasesPopupOpen] = useState(initialPopup === 'purchases');
  const [inventoryPopupOpen, setInventoryPopupOpen] = useState(initialPopup === 'inventory');
  // Which Inventory tab the popup should open on -- 'all' from every normal
  // entry point, 'shortage' ("Need reorder") when opened from the Needs
  // attention panel's "Inventory shortage" item, so the manager lands
  // directly on the tab that answers what they clicked, instead of always
  // opening on "All" and requiring an extra manual click.
  const [inventoryPopupInitialFilter, setInventoryPopupInitialFilter] = useState<'all' | 'shortage'>('all');
  // Items currently marked "bought" in Purchases -- fed into the Inventory
  // popup below as a reminder icon (see the identical derivation on the
  // Staff dashboard). Reuses `purchasesItems` (already fetched for the
  // Manager's own Purchases popup), no second query.
  const inventoryBoughtItemIds = useMemo(
    () => (purchasesItems ?? []).filter((i) => i.purchaseStatus === 'bought').map((i) => i.itemId),
    [purchasesItems],
  );
  const [recipesPopupOpen, setRecipesPopupOpen] = useState(initialPopup === 'recipes');
  // WP-11: Correction/Exchange requests moved from always-visible sections into popups, triggered from AttentionPanel's cards.
  const [correctionsPopupOpen, setCorrectionsPopupOpen] = useState(false);
  const [exchangesPopupOpen, setExchangesPopupOpen] = useState(false);
  const [staffMessagesPopupOpen, setStaffMessagesPopupOpen] = useState(false);
  // Shift-requests review popup (v2.1 UI-only, Settings entry point).
  const [shiftRequestsPopupOpen, setShiftRequestsPopupOpen] = useState(false);
  // WP A6: the cell editor is now a design-kit `Modal` (`ShiftCellEditorModal`),
  // which handles its own focus-restore/Escape internally -- no more
  // ref-map/requestAnimationFrame bookkeeping here.
  const [editingCell, setEditingCell] = useState<{ staffId: string; date: string } | null>(null);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [confirmDeactivateStaffId, setConfirmDeactivateStaffId] = useState<string | null>(null);
  const [scheduleHelpOpen, setScheduleHelpOpen] = useState(false);

  const [activeWeekOffset, setActiveWeekOffset] = useState(weekOffset);
  // Seeded once from the already-fetched -8..+8 week `exchangeAssignments`
  // window (falls back to the narrower current-week `assignments` only if
  // that window failed to load) -- see `MIN_WEEK_OFFSET`'s doc comment.
  // `localAssignments` below still filters this down to the displayed
  // week's `dates`, so every existing consumer's behavior is unchanged;
  // only where the data comes from (preloaded window vs. per-week fetch)
  // is different.
  const [scheduleWindowAssignments, setScheduleWindowAssignments] = useState<WorkforceShiftAssignment[]>(
    exchangeAssignments ?? assignments ?? [],
  );
  // Every create/update/remove-shift action below still calls `router.refresh()`
  // to get correct server-verified data after a write (unchanged) -- this
  // keeps the client-held window in sync with that fresh data. Pure Prev/
  // Next/This-week navigation never touches this effect (it only reacts to
  // the `exchangeAssignments`/`assignments` props actually changing, which a
  // plain client-side week switch does not do).
  useEffect(() => {
    setScheduleWindowAssignments(exchangeAssignments ?? assignments ?? []);
  }, [exchangeAssignments, assignments]);
  const activePeriodStart = useMemo(
    () => addIsoDays(periodStart, (activeWeekOffset - weekOffset) * 7),
    [periodStart, activeWeekOffset, weekOffset],
  );
  const activePeriodEnd = useMemo(
    () => addIsoDays(periodEnd, (activeWeekOffset - weekOffset) * 7),
    [periodEnd, activeWeekOffset, weekOffset],
  );
  const dates = useMemo(() => weekDates(activePeriodStart), [activePeriodStart]);
  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  function weekHref(targetOffset: number) {
    return targetOffset === 0 ? '/manager' : `/manager?weekOffset=${targetOffset}`;
  }

  function navigateToWeek(targetOffset: number) {
    if (targetOffset === activeWeekOffset || targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    // Pure client-side date-range filter over the already-preloaded window --
    // no Server Action call, no `router.push`/`router.refresh()` (which would
    // re-run this whole page's data batch and reset scroll).
    setActiveWeekOffset(targetOffset);
    window.history.replaceState(null, '', weekHref(targetOffset));
  }

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

  // Staff<->Manager Mail (0090): staff-authored, unread, non-archived/deleted
  // messages across every thread -- folded into AttentionPanel's Level-1
  // total at that component's own render site (Mail is deliberately not a
  // `ManagerAttentionCategory`, see attention-panel.tsx's own doc comment).
  const unreadMailCount = useMemo(
    () => (staffMessages ?? []).filter((m) => m.senderRole === 'staff' && !m.isRead && !m.archivedAt && !m.deletedAt).length,
    [staffMessages],
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
  // `inventoryItems` now includes deactivated items too (`includeInactive:
  // true`, so the Inventory popup's "Deactivated" tab has something to show)
  // -- `i.isActive` here keeps a deactivated-but-understocked item out of
  // this count and the queue below it, same as the Inventory popup's own
  // Need-reorder/OK tabs already require.
  const inventoryShortageCount = useMemo(
    () => (inventoryEnabled && inventoryItems ? inventoryItems.filter((i) => i.isActive && i.status === 'shortage').length : null),
    [inventoryEnabled, inventoryItems],
  );

  const localAssignments = useMemo(
    () =>
      scheduleWindowAssignments
        .map((a) => {
          const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
          const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
          return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
        })
        .filter((a) => dates.includes(a.workDate)),
    [scheduleWindowAssignments, dates, timeZone],
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

  // Round 3 (2026-08-22): distinct custom (no-shiftTypeId) time ranges
  // actually assigned this week, so a manager who typed a one-off time still
  // gets a legend entry for it -- sorted by start time for a stable reading
  // order.
  const weekCustomTimeRanges = useMemo(() => {
    const seen = new Map<string, { startsAtLocal: string; endsAtLocal: string }>();
    for (const a of localAssignments) {
      if (!dates.includes(a.workDate) || a.assignment.shiftTypeId) continue;
      const key = `${a.startsAtLocal}-${a.endsAtLocal}`;
      if (!seen.has(key)) seen.set(key, { startsAtLocal: a.startsAtLocal, endsAtLocal: a.endsAtLocal });
    }
    return Array.from(seen.values()).sort((x, y) => x.startsAtLocal.localeCompare(y.startsAtLocal));
  }, [localAssignments, dates]);

  // Shift-requests review popup (v2.1 UI-only): month scope + Settings-card
  // summary, both derived from data already loaded (requests/staff) -- no
  // new fetch. `monthPrefix`/`monthLabel` reuse the same `todayIso.slice(0,7)`
  // idiom as `estimatedLabourCost` below, not `getMonthPeriod` (that needs a
  // raw UTC instant this component doesn't have; `todayIso` is already the
  // local calendar date).
  const shiftRequestsMonthPrefix = todayIso.slice(0, 7);
  const shiftRequestsMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
        new Date(`${shiftRequestsMonthPrefix}-01T00:00:00Z`),
      ),
    [shiftRequestsMonthPrefix, lang],
  );
  const shiftRequestsSummary = useMemo(() => {
    if (staff === null || requests === null) return null;
    const activeStaffIds = staff.filter((s) => s.isActive).map((s) => s.staffId);
    const submittedIds = new Set(
      requests.filter((r) => r.workDate.startsWith(shiftRequestsMonthPrefix)).map((r) => r.employeeId),
    );
    const submitted = activeStaffIds.filter((id) => submittedIds.has(id)).length;
    const total = activeStaffIds.length;
    return { submitted, total, missing: total - submitted };
  }, [staff, requests, shiftRequestsMonthPrefix]);

  // Round 3 (2026-08-22): "Estimated labour cost" box below the grid,
  // matching the `_client-preview/mame-to-cha` reference table exactly --
  // current-month worked hours (from `attendance`, not the displayed week's
  // scheduled shifts) times each staff member's hourly wage, summed. An
  // operational estimate for the Manager, not a payroll run.
  const estimatedLabourCost = useMemo(() => {
    const monthPrefix = todayIso.slice(0, 7);
    return (staff ?? []).reduce((sum, s) => {
      const summary = estimatedEarningsSummary(
        (attendance ?? []).filter((row) => row.employeeId === s.staffId),
        monthPrefix,
        s.hourlyWageYen,
      );
      return sum + (summary.estimatedEarningsYen ?? 0);
    }, 0);
  }, [staff, attendance, todayIso]);

  // WP-8: understaffed-day "!" marker (column header) -- dates in the
  // displayed week whose assigned headcount is below the Settings-configured
  // required headcount for that weekday. Pure frontend, reuses data already
  // loaded (scheduleSettings, localAssignments) -- no new fetch.
  //
  // Founder Review Round 2 (2026-08-22): carries the actual
  // required/scheduled/missing numbers now (not just a boolean), so the day
  // header can explain the shortage instead of showing an unexplained "!".
  const dailyStaffingCoverage = useMemo(
    () =>
      computeDailyStaffingCoverage(
        dates,
        scheduleSettings?.requiredHeadcountByWeekday ?? null,
        localAssignments.filter((a) => dates.includes(a.workDate)).map((a) => a.workDate),
      ),
    [dates, scheduleSettings, localAssignments],
  );
  const staffingCoverageByDate = useMemo(
    () => new Map(dailyStaffingCoverage.map((c) => [c.workDate, c])),
    [dailyStaffingCoverage],
  );

  // WP-8: per-cell "!" marker for a PAST day with a pending correction
  // request awaiting Manager review -- same `pendingCorrections` data the
  // Attention layer and the always-visible corrections section already use.
  const pendingCorrectionCellKeys = useMemo(
    () => computePendingCorrectionCellKeys(pendingCorrections, todayIso),
    [pendingCorrections, todayIso],
  );

  // Round 3 (2026-08-22): the actual request object behind each flagged
  // cell, so the Shift Cell Editor can render its own Approve/Reject block
  // instead of a plain notice -- same `workDate < todayIso` condition
  // `computePendingCorrectionCellKeys` already applies (a correction only
  // ever targets a past date).
  const pendingCorrectionByCellKey = useMemo(() => {
    const map = new Map<string, WorkforceShiftRequest>();
    for (const r of pendingCorrections) {
      if (r.workDate < todayIso) map.set(cellKey(r.employeeId, r.workDate), r);
    }
    return map;
  }, [pendingCorrections, todayIso]);

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
                .filter((i) => i.isActive && i.status === 'shortage')
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
    document.getElementById('weekly-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [initialFocusCell, dates]);

  // Attention "View shift" action (unavailable_conflict queue items): if the
  // conflict's date is outside the Manager's currently displayed week,
  // switch weeks first -- Round 3 (2026-08-22): this is now the same
  // client-side `navigateToWeek` plain Prev/Next uses (the target week's
  // assignments are already in the preloaded window), not a `router.push`
  // full navigation.
  function handleViewShift(employeeId: string, workDate: string) {
    if (!dates.includes(workDate)) {
      navigateToWeek(weekOffsetForWorkDate(todayIso, workDate));
    }
    setEditingCell({ staffId: employeeId, date: workDate });
    document.getElementById('weekly-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function assignmentFor(staffId: string, date: string) {
    return localAssignments.find((a) => a.assignment.employeeId === staffId && a.workDate === date);
  }

  function cellKey(staffId: string, date: string) {
    return `${staffId}:${date}`;
  }

  // Shared by the table (>=768px, staff x date grid) and the day-grouped
  // card list (<768px, one card per date) so the assign/edit logic for a
  // single staff/date cell only exists once.
  //
  // Weekly Schedule redesign (2026-08-22): the whole cell is now one
  // `<button>` -- a shift chip (filled) or a quiet "+" (empty), click/tap/
  // Enter/Space anywhere on it opens `ShiftCellEditorModal`. This replaces
  // the previous stacked badges + separate "Assign"/"Edit" button, and
  // (published shifts) the previous "Published -- read-only" dead end --
  // published shifts are click-to-edit too now, gated by the editor's own
  // controlled-edit confirmation (`shift-cell-editor.tsx`), not hidden here.
  function renderScheduleCellContent(s: WorkforceStaffManageEntry, date: string) {
    const key = cellKey(s.staffId, date);
    const entry = assignmentFor(s.staffId, date);
    const isPast = date < todayIso;

    if (!entry) {
      if (!s.isActive) return <span style={mutedText}>-</span>;
      // Founder Review Round 2 (2026-08-22), section 6: a past empty cell is
      // not an ordinary "assign a future shift" affordance -- default
      // presentation is a quiet "-", not "+", so it doesn't read as "you
      // still need to fill this in" the way a genuinely open future/today
      // slot does. It's still the same click target (opens the same editor,
      // which shows its own "Correcting past schedule" notice) -- a
      // secondary, discoverable, keyboard/touch-accessible action, not a
      // hidden one.
      const ariaPrefix = isPast ? t('correctPastScheduleAriaLabelPrefix') : t('assignCellAriaLabelPrefix');
      const ariaLabel = `${ariaPrefix} — ${s.name} — ${date}`;
      return (
        <button
          type="button"
          className={hoverStyles.scheduleCellButton}
          style={scheduleCellButtonStyle(null)}
          disabled={isPending}
          aria-label={ariaLabel}
          title={ariaLabel}
          onClick={() => setEditingCell({ staffId: s.staffId, date })}
        >
          <span aria-hidden="true">{isPast ? '—' : '+'}</span>
        </button>
      );
    }

    // A custom shift with no resolvable shift type still has a real time on
    // the assignment itself -- show that instead of a generic "Custom",
    // which was also the site of the raw internal `CUSTOM_<timestamp>` code
    // leaking into the UI (this label must always go through
    // `shiftTypeDisplayLabel`, never `shiftType.code`, when a type does
    // resolve -- see that function's own doc comment).
    const shiftType = entry.assignment.shiftTypeId ? shiftTypeById.get(entry.assignment.shiftTypeId) : undefined;
    const timeRange = `${entry.startsAtLocal}-${entry.endsAtLocal}`;
    // Section 14: name AND time, not name alone -- a Manager scanning the
    // grid must not have to cross-reference the legend just to see when a
    // shift runs. A true custom shift (no resolvable type) has no separate
    // name to add -- its "label" already *is* the time range.
    const label = shiftType ? shiftTypeDisplayLabel(shiftType) : timeRange;
    const cellText = shiftType ? `${label} · ${timeRange}` : label;
    const tone = shiftChipColors(entry.assignment.shiftTypeId, activeShiftTypeIds);
    const hasCorrectionAlert = pendingCorrectionCellKeys.has(key);
    const hasConflictAlert = !hasCorrectionAlert && unavailableConflictCellKeys.has(key);

    // Founder Review Round 2 (2026-08-22), section 1/13: Draft/Published is
    // no longer part of this cell's identity at all -- no status dot, no
    // badge. Shift type (color + name + time) is the only identity a cell
    // carries; a conflict/correction is a small, secondary corner mark,
    // never the whole cell.
    const ariaParts = [t('editCellAriaLabelPrefix'), s.name, date, cellText];
    if (hasCorrectionAlert) ariaParts.push(t('pendingCorrectionCellAriaLabel'));
    else if (hasConflictAlert) ariaParts.push(t('attentionConflictSummary'));
    const ariaLabel = ariaParts.join(' — ');

    return (
      <button
        type="button"
        className={hoverStyles.scheduleCellButton}
        style={scheduleCellButtonStyle(tone)}
        disabled={isPending}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setEditingCell({ staffId: s.staffId, date })}
      >
        <span aria-hidden="true" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cellText}</span>
        {hasCorrectionAlert || hasConflictAlert ? (
          <span aria-hidden="true" style={{ ...cellAlertCornerStyle, background: hasCorrectionAlert ? colors.danger : colors.warning }}>
            !
          </span>
        ) : null}
      </button>
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

  // Staff<->Manager Mail (0090): mark-read/archive/delete are quiet, no
  // page-level banner (mark-read in particular can fire several times in a
  // row when a thread with multiple unread messages is opened -- see
  // `StaffMessagesPopup`'s own opening effect) -- same `startTransition`/
  // `pendingAction`/`router.refresh()` shape as `handleDecideCorrection`
  // otherwise.
  function handleMarkMessageRead(messageId: string) {
    setPendingAction(`mark-read-message-${messageId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('messageId', messageId);
      await markStaffMessageReadAction(formData);
      router.refresh();
      setPendingAction(null);
    });
  }

  function handleArchiveMessage(messageId: string) {
    setPendingAction(`archive-message-${messageId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('messageId', messageId);
      await archiveStaffMessageAction(formData);
      router.refresh();
      setPendingAction(null);
    });
  }

  function handleSendManagerMessage(employeeId: string, body: string) {
    setBanner(null);
    setPendingAction(`send-message-${employeeId}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('employeeId', employeeId);
      formData.set('body', body);
      const result = await submitManagerMessage(formData);
      if (result.status !== 'success') {
        setBanner({ tone: 'error', message: describeWriteError(result) });
      }
      router.refresh();
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
          gap: 10,
          paddingBottom: 14,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        {/* Matches the Staff header redesign (Founder mockup, 2026-08-24): tenant + location replace the personalized page
            title, and the caller's own identity moves to the account menu on the right. `minWidth: 0` + `overflowWrap:
            anywhere` let a long tenant/location name wrap within this block instead of pushing the account menu down. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
          <BrandBadge label={tenantName} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.textPrimary, overflowWrap: 'anywhere' }}>{tenantName}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, overflowWrap: 'anywhere', ...mutedText }}>{locationName}</p>
          </div>
        </div>
        <AccountMenu
          displayName={displayName ?? t('pageTitle')}
          positionLabel={positionLabel ?? t('notSetLabel')}
          signOutLabel={t('signOut')}
        />
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
                    setInventoryPopupInitialFilter('all');
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
          ...(inventoryEnabled
            ? [
                {
                  key: 'purchases',
                  label: t('navPurchases'),
                  onClick: () => {
                    markPopupTriggerClick('purchases');
                    setPurchasesPopupOpen(true);
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
          setInventoryPopupInitialFilter('shortage');
          setInventoryPopupOpen(true);
        }}
        onViewShift={handleViewShift}
        unreadMailCount={unreadMailCount}
        onOpenMail={() => {
          markPopupTriggerClick('staff-messages');
          setStaffMessagesPopupOpen(true);
        }}
      />

      {banner ? (
        <div style={{ ...(banner.tone === 'error' ? alertDanger : alertSuccess), marginTop: 16 }}>
          <div>{banner.message}</div>
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
        initialStatusFilter={inventoryPopupInitialFilter}
        tenantName={tenantName}
        locationName={locationName}
        locationId={locationId}
        locationTimezone={timeZone}
        items={inventoryItems}
        mediaUrlByItemId={inventoryMediaUrlByItemId}
        staffNameById={staffNameById}
        canManage
        boughtItemIds={inventoryBoughtItemIds}
      />

      <PurchasesPopup
        open={purchasesPopupOpen}
        onClose={() => setPurchasesPopupOpen(false)}
        tenantName={tenantName}
        locationName={locationName}
        locationId={locationId}
        locationTimezone={timeZone}
        items={purchasesItems}
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
            <h2 style={{ margin: 0, fontSize: 16 }}>{scheduleHeadingValue[lang](activePeriodStart, activePeriodEnd)}</h2>
            <HelpIconButton ariaLabel={t('scheduleHelpAriaLabel')} onClick={() => setScheduleHelpOpen(true)} />
          </div>
          {/* Founder Review Round 2 (2026-08-22), section 21: compact icon
              navigator instead of three full-width text buttons -- the
              visible date range already lives in the heading above
              (`scheduleHeadingValue`), so these only need to convey
              prev/next/today, not repeat it. Real words stay in
              `aria-label`/`title` for screen readers and mouse-hover.
              Round 3 (2026-08-22): plain `<button onClick>` instead of
              `<Link href>` -- these are now a pure client-side week switch
              (`navigateToWeek`), never a real navigation. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className={hoverStyles.buttonSecondary}
              style={{ ...buttonSecondary, minWidth: 36, padding: '8px 12px', textAlign: 'center' }}
              aria-label={t('prevWeek')}
              title={t('prevWeek')}
              onClick={() => navigateToWeek(activeWeekOffset - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              style={{ ...(activeWeekOffset === 0 ? buttonDisabled : buttonSecondary), padding: '8px 14px' }}
              className={activeWeekOffset === 0 ? undefined : hoverStyles.buttonSecondary}
              aria-disabled={activeWeekOffset === 0}
              disabled={activeWeekOffset === 0}
              onClick={() => navigateToWeek(0)}
            >
              {t('thisWeek')}
            </button>
            <button
              type="button"
              className={hoverStyles.buttonSecondary}
              style={{ ...buttonSecondary, minWidth: 36, padding: '8px 12px', textAlign: 'center' }}
              aria-label={t('nextWeek')}
              title={t('nextWeek')}
              onClick={() => navigateToWeek(activeWeekOffset + 1)}
            >
              ›
            </button>
          </div>
        </div>

        {/* Founder Review Round 2 (2026-08-22): Draft/Published, Run auto-
            create, and Publish schedule are no longer everyday grid-header
            actions -- Manager UX doesn't manage publication state at all
            now (every manual save is visible to staff immediately, see
            `schedule-actions.ts`); the bulk/automatic tooling (Run now,
            Publish, the scheduled-automation preview) moved into the
            Settings section below, alongside its own future "day of the
            month" configuration -- Founder direction, same session. This
            card is click-a-cell-to-edit only now. */}

        {staff === null || staff.length === 0 ? (
          <p style={{ margin: '12px 0 0', ...mutedText }}>{t('addStaffToSeeSchedule')}</p>
        ) : (
          <>
          {/* Founder direction (2026-08-24): the Weekly Schedule grid stays a
              real table at every viewport, never the shared
              tableView/cardView desktop-table/mobile-card split every other
              wide table in this app uses -- a per-day card here would hide
              the whole week's shape and force much more scrolling than the
              compact, horizontally-scrollable table already gives on a
              narrow screen (fixed `<colgroup>` widths plus this cell text's
              own `overflow: hidden; textOverflow: ellipsis` already shrink
              gracefully -- no separate mobile layout needed). */}
          <div className={dashboardStyles.scheduleTableWrap}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '3px 3px', fontSize: 13 }}>
              <colgroup>
                <col style={{ width: '16%' }} />
                {dates.map((date) => (
                  <col key={date} style={{ width: `${84 / 7}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...scheduleTableHeaderCellStyle, textAlign: 'center', borderTopLeftRadius: 8 }}>{t('colStaff')}</th>
                  {dates.map((date, dateIndex) => {
                    const coverage = staffingCoverageByDate.get(date);
                    const shortageLabel = coverage && coverage.missing > 0 ? dailyStaffingShortageExplanation[lang](coverage.required, coverage.scheduled, coverage.missing) : null;
                    const isToday = date === todayIso;
                    const isLastCol = dateIndex === dates.length - 1;
                    return (
                      <th
                        key={date}
                        style={{
                          ...scheduleTableHeaderCellStyle,
                          textAlign: 'center',
                          ...(isToday ? scheduleTodayTint : {}),
                          ...(isLastCol ? { borderTopRightRadius: 8 } : {}),
                        }}
                      >
                        {/* Round 3 follow-up (2026-08-23): the shortage
                            marker is an absolutely-positioned overlay
                            (top-right of the cell) instead of a flex
                            sibling, so it can no longer push the day/date
                            text sideways in the columns that happen to have
                            one -- every column's text sits at the same
                            position regardless of whether its own marker is
                            present. */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
                          <span>
                            {formatWeekday(date)}
                            <br />
                            {date.slice(8)}
                          </span>
                          {shortageLabel ? (
                            <span
                              role="img"
                              aria-label={shortageLabel}
                              title={shortageLabel}
                              style={{ ...understaffedMarkerStyle, position: 'absolute', top: 0, right: 0 }}
                            >
                              !
                            </span>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.map((s, staffIndex) => {
                  const isLastRow = staffIndex === staff.length - 1;
                  return (
                    <tr key={s.staffId}>
                      <td style={{ ...scheduleTableCellStyle, ...(isLastRow ? { borderBottomLeftRadius: 8 } : {}) }}>
                        <button
                          type="button"
                          className={hoverStyles.staffNameCell}
                          style={{ width: '100%', height: '100%', minHeight: 44, border: 0, cursor: 'pointer', padding: '6px 4px', font: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: 6 }}
                          onClick={() => setStaffDetailId(s.staffId)}
                        >
                          {s.name}
                        </button>
                      </td>
                      {dates.map((date, dateIndex) => {
                        const isToday = date === todayIso;
                        const isLastCol = dateIndex === dates.length - 1;
                        return (
                          <td
                            key={date}
                            style={{
                              ...scheduleTableCellStyle,
                              ...(isToday ? scheduleTodayTint : {}),
                              ...(isLastRow && isLastCol ? { borderBottomRightRadius: 8 } : {}),
                            }}
                          >
                            {renderScheduleCellContent(s, date)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {weekLegendTypes.length > 0 || weekCustomTimeRanges.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {weekLegendTypes.map((st) => (
                <span key={st.shiftTypeId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={shiftChipStyle(shiftChipColors(st.shiftTypeId, activeShiftTypeIds))}>{shiftTypeDisplayLabel(st)}</span>
                  <span style={{ ...mutedText, fontSize: 12 }}>{st.startsAtLocal}-{st.endsAtLocal}</span>
                </span>
              ))}
              {weekCustomTimeRanges.map((range) => (
                <span key={`custom:${range.startsAtLocal}-${range.endsAtLocal}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={shiftChipStyle(CUSTOM_CHIP_TONE)}>{t('shiftTypeCustom')}</span>
                  <span style={{ ...mutedText, fontSize: 12 }}>{range.startsAtLocal}-{range.endsAtLocal}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, background: colors.surfaceElevated }}>
              <span style={{ fontSize: 12.5, ...mutedText }}>{t('estimatedLabourCostLabel')}</span>
              <strong style={{ fontSize: 18 }}>¥{estimatedLabourCost.toLocaleString('ja-JP')}</strong>
            </div>
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
        key={editingCell ? cellKey(editingCell.staffId, editingCell.date) : 'none'}
        open={editingCell !== null}
        onClose={() => setEditingCell(null)}
        title={editingCell ? `${staffById.get(editingCell.staffId)?.name ?? ''} - ${editingCell.date}` : ''}
        locationId={locationId}
        workDate={editingCell?.date ?? ''}
        todayIso={todayIso}
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
        problemNotice={
          editingCell
            ? (() => {
                const key = cellKey(editingCell.staffId, editingCell.date);
                // Round 3 (2026-08-22): a pending correction is now handled
                // by the Modal's own dedicated Approve/Reject block (see
                // `correctionRequest` below), not this plain-text notice.
                if (pendingCorrectionCellKeys.has(key)) return undefined;
                if (unavailableConflictCellKeys.has(key)) return t('attentionConflictSummary');
                return undefined;
              })()
            : undefined
        }
        correctionRequest={editingCell ? (pendingCorrectionByCellKey.get(cellKey(editingCell.staffId, editingCell.date)) ?? null) : null}
        onCorrectionDecided={() => router.refresh()}
        onSuccess={(kind) => {
          setEditingCell(null);
          if (kind === 'removed') setBanner({ tone: 'success', message: t('shiftUnassigned') });
          router.refresh();
        }}
      />

      <SettingsSection
        locationId={locationId}
        settings={scheduleSettings}
        shiftTypes={shiftTypes}
        onShiftTypesChanged={() => router.refresh()}
        onRequirementsChanged={() => router.refresh()}
        shiftRequestsSummary={shiftRequestsSummary}
        onOpenShiftRequests={() => setShiftRequestsPopupOpen(true)}
        lang={lang}
      />

      <ShiftRequestsReviewPopup
        open={shiftRequestsPopupOpen}
        onClose={() => setShiftRequestsPopupOpen(false)}
        requests={requests}
        staff={staff ?? []}
        shiftTypes={shiftTypes}
        activeShiftTypeIds={activeShiftTypeIds}
        monthPrefix={shiftRequestsMonthPrefix}
        monthLabel={shiftRequestsMonthLabel}
        todayIso={todayIso}
        lang={lang}
      />

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

      <StaffMessagesPopup
        open={staffMessagesPopupOpen}
        onClose={() => setStaffMessagesPopupOpen(false)}
        messages={staffMessages}
        staffById={staffById}
        timeZone={timeZone}
        isPending={isPending}
        pendingAction={pendingAction}
        onMarkRead={handleMarkMessageRead}
        onArchive={handleArchiveMessage}
        onSend={handleSendManagerMessage}
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
    </>
  );
}
