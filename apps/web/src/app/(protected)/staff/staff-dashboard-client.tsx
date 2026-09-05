'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkforceMyStaffProfile } from '@/lib/workforce/staff-profile';
import { shiftTypeDisplayLabel, type WorkforceShiftType } from '@/lib/workforce/shift-types';
import type { WorkforceShiftRequest } from '@/lib/workforce/shift-requests';
import type { WorkforceShiftAssignment } from '@/lib/workforce/shift-assignments';
import type { WorkforceShiftExchange } from '@/lib/workforce/shift-exchanges';
import type { WorkforceAttendance } from '@/lib/workforce/attendance';
import type { WorkforceStaffMessage } from '@/lib/workforce/staff-messages';
import type { InventoryItemStatus } from '@/lib/inventory/items';
import type { PurchaseNeededItem } from '@/lib/purchases/items';
import type { OperationsExpectedTask, OperationsItemResponse } from '@/lib/operations/tasks';
import type { OperationsTemplateItem } from '@/lib/operations/templates';
import type { WorkforceRecipeGroup } from '@/lib/workforce/recipes';
import type { RecipeTranslationField } from '@/lib/content/recipe-translation-workspace';
import { addIsoDays, utcIsoToLocalDateTime } from '@/lib/workforce/timezone';
import { getMyScheduleWeek } from '@/lib/workforce/schedule-actions';
import {
  buildStaffScheduleRoster,
  computeStaffAttentionCellKeys,
  toStaffViewAssignments,
  toStaffViewShiftTypes,
} from '@/lib/workforce/staff-schedule-view-model';
import { estimatedEarningsSummary } from '@/lib/workforce/estimated-earnings';
import { ShiftTable } from '@/components/demo/cafe/ShiftTable';
import { ShiftLegend } from '@/components/demo/cafe/ShiftLegend';
import { Modal } from '@/components/demo/cafe/Modal';
import { LangProvider, useLang } from '@/lib/demo/cafe/i18n';
import {
  customShiftTimeRangeLabel,
  earningsEstimatedSuffix,
  earningsWorkedHoursValue,
  existingExchangeMessage,
  scheduledThisWeekValue,
  tStaffDashboard,
} from './staff-dashboard-i18n';
import { buttonDisabled, buttonPrimary, buttonSecondary, card, colors, mutedText } from '@/lib/ui/theme';
import {
  correctionStatusBadgeStyle,
  correctionStatusLabel,
  formatRequestedCorrectionChange,
  primaryCard,
  todayIsoInTimeZone,
} from '../_ui/workforce-theme';
import { EntryPointsCard } from '../_ui/entry-points-card';
import { BrandBadge } from '../_ui/brand-badge';
import { ShiftExchangeRequestForm } from './shift-exchange-request-form';
import { CorrectionRequestForm } from './correction-request-form';
import { WorkStatusCard } from './work-status-card';
import { TransportForm } from './transport-form';
import { StaffMailPopup } from './staff-mail-popup';
import { MonthlyShiftPreferenceModal } from './monthly-shift-preference-modal';
import { useIsCompactSchedule } from './use-compact-schedule';
import { AccountMenu } from '../_ui/account-menu';
import { RecipesPopup } from '../_ui/recipes-popup';
import { InventoryPopup } from '../_ui/inventory-popup';
import { PurchasesPopup } from '../_ui/purchases-popup';
import { OperationsStaffPopup } from '../_ui/operations-staff-popup';
import { HelpIconButton } from '@/components/shared/design-kit';
import { markPopupTriggerClick } from '@/lib/ui/popup-timing';
import hoverStyles from '@/lib/ui/theme.module.css';

/** Manager -> Staff live-sync poll interval, matching `_client-preview`'s `PreviewStaffSchedule` (Founder P1, 2026-08-13, Contract 3): targets the single displayed week only, never the whole page. */
const SCHEDULE_POLL_INTERVAL_MS = 2500;

/**
 * Founder Preview QA (2026-08-25, Staff Shift Schedule v2 fix-up): matches
 * `page.tsx`'s own `MAX_WEEK_OFFSET` sanity cap (not exported there, so
 * mirrored here -- keep in sync with `page.tsx`'s `parseWeekOffset`). Prev/
 * This week/Next used to be `<Link href="/staff?weekOffset=...">` -- a full
 * server navigation that re-ran this page's entire data batch just to move
 * one week, which was slow and visibly "jumped" (Founder bugs #4/#6).
 * Follows the exact pattern already shipped and Founder-approved on
 * `/manager` (`manager-dashboard-client.tsx`, "Round 3" week-navigation
 * performance fix): a pure client-side `activeWeekOffset` filter over the
 * already-preloaded assignment window, `window.history.replaceState` only,
 * never `router.push`/`router.refresh()`.
 */
const MIN_WEEK_OFFSET = -8;
const MAX_WEEK_OFFSET = 8;

/** Short `MM/DD` form of an ISO date, used only in the schedule heading (Founder Preview QA, 2026-08-25: the full ISO range wrapped the heading onto two lines at 375px in English). Every other date on this page keeps the full ISO string. */
function shortDate(iso: string): string {
  return iso.slice(5).replace('-', '/');
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

const alertSuccess = {
  border: `1px solid ${colors.success}`,
  background: colors.successMuted,
  color: colors.success,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
} as const;

export interface StaffDashboardClientProps {
  tenantName: string;
  locationName: string;
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  weekOffset: number;
  profile: WorkforceMyStaffProfile;
  /** The caller's own real display name, decrypted server-side via `api.workforce_staff_roster` (0061). `null` only if the roster read itself failed -- falls back to no name shown, never a placeholder. */
  displayName: string | null;
  /** Every visible coworker's (plus the caller's own) real display name, keyed by employee id -- same source as `displayName`, threaded through to the schedule grid so it can show real names instead of synthesized "Staff N" labels. */
  staffNameById: Record<string, string>;
  shiftTypes: WorkforceShiftType[] | null;
  /** The caller's own `kind: 'preference'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  requests: WorkforceShiftRequest[] | null;
  /**
   * The full ±8-week, this-location, PUBLISHED assignment window (every
   * employee, not just the caller) -- already narrowed server-side
   * (`page.tsx`) to `published && locationId === <this location>`. Powers
   * the coworker-roster/self-pin/self-highlight/All-Only-me schedule grid
   * below (`ShiftTable`), mirroring `_client-preview`'s `windowAssignments`.
   * RLS on `api.workforce_shift_assignments` remains the real boundary; a
   * plain Staff reader is already limited to published rows tenant-wide.
   */
  assignments: WorkforceShiftAssignment[] | null;
  /** The caller's own attendance rows (self-scoped by RLS), not date-filtered by the caller. */
  attendance: WorkforceAttendance[] | null;
  /** The caller's own `kind: 'correction'` shift requests (self-scoped by RLS), not date-filtered by the caller. */
  correctionRequests: WorkforceShiftRequest[] | null;
  /** This location's shift-exchange requests (RLS-scoped to the caller's tenant/location; a plain Staff reader sees requester/replacement rows they're a party to plus open offers, per `api.workforce_shift_exchanges`). */
  exchanges: WorkforceShiftExchange[] | null;
  /** The caller's own single thread (self-scoped by RLS, `wf_staff_messages_self_select`) -- Staff<->Manager Mail module (0090), also the exact data `StaffMailPopup` renders (no separate fetch). `null` when the read failed. */
  staffMessages: WorkforceStaffMessage[] | null;
  /** Whether the tenant's separate `inventory` top-level module (ADR 0010) is enabled -- gates only the entry-point card below; the real Inventory page/RLS remain the authorization boundary. */
  inventoryEnabled: boolean;
  /** Whether the tenant's separate `operations` top-level module (0099/0111) is enabled -- gates only this entry point's visibility, mirroring `manager-dashboard-client.tsx`'s own `operationsEnabled`; the real `/operations` page and its RLS remain the authorization boundary regardless of this flag. */
  operationsEnabled: boolean;
  /** This location's inventory item statuses -- also the exact data the Inventory popup below renders (no separate fetch), same pattern the Manager dashboard's own `InventoryPopup` uses. `null` when the module is disabled or the read failed. */
  inventoryItems: InventoryItemStatus[] | null;
  /** Pure UX affordance (RLS is the real boundary regardless): whether this staff member also holds `inventory.item.manage`. Almost always false for a plain staff account. */
  inventoryCanManage: boolean;
  /** Signed photo URLs for `inventoryItems`, keyed by `itemId` -- threaded straight to the Inventory popup. */
  inventoryMediaUrlByItemId: Record<string, string>;
  /** Manager-only decrypted staff-id -> display-name map for the Inventory popup's "counted by" line (see page.tsx). Always empty when `inventoryCanManage` is false. */
  inventoryStaffNameById: Record<string, string>;
  /** This location's Purchases shopping list -- also the exact data the Purchases popup below renders (no separate fetch). `null` when the module is disabled or the read failed. */
  purchasesItems: PurchaseNeededItem[] | null;
  /** Manager-only decrypted staff-id -> display-name map for the Purchases popup's "bought by" line. Always empty for a plain staff account. */
  purchasesStaffNameById: Record<string, string>;
  /** Today's expected Operations tasks at this Staff member's own location, already filtered server-side -- also the exact data the Staff Operations popup renders (no separate fetch). `null` when the module is disabled or the read failed. */
  operationsTasks: OperationsExpectedTask[] | null;
  /** Every active checklist item referenced by `operationsTasks` (tenant-wide catalog, same read `manager/page.tsx`'s Operations popup uses). `null` when the module is disabled or the read failed. */
  operationsItems: OperationsTemplateItem[] | null;
  /** Every already-materialised task's recorded responses, keyed by `instanceId` -- see `page.tsx`. */
  operationsResponsesByInstanceId: Record<string, OperationsItemResponse[]>;
  /** Today's ISO business date, used as the Operations popup's business-date label. */
  operationsBusinessDate: string;
  /**
   * Recipes popup data (Founder direction, 2026-08-24: Staff's Recipes
   * button opens the same popup Manager's does, instead of navigating to
   * the standalone `/recipes` page) -- same shape/source `manager/page.tsx`
   * fetches, threaded through to the shared `RecipesPopup` (`_ui/`).
   */
  recipeGroups: WorkforceRecipeGroup[] | null;
  recipeTitleFieldByRecipeId: Record<string, RecipeTranslationField>;
  recipeMediaUrlByRecipeId: Record<string, string>;
  /** Pure UX affordance (RLS is the real boundary regardless): whether the popup shows Add/Edit/Delete controls. */
  recipeCanManage: boolean;
  /** `?popup=` query param, parsed server-side (page.tsx) -- auto-opens the matching popup on first render (e.g. a bookmarked/redirected `/recipes`, `/inventory`, or `/operations` visit). */
  initialPopup: 'recipes' | 'inventory' | 'purchases' | 'operations' | null;
  locationId: string;
}

/** Display-only hours between two `HH:MM` local times, for the weekly-hours summary. Does not account for breaks. */
function hoursBetween(startsAtLocal: string, endsAtLocal: string): number {
  const [startH = 0, startM = 0] = startsAtLocal.split(':').map(Number);
  const [endH = 0, endM = 0] = endsAtLocal.split(':').map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

/**
 * Outer wrapper: mounts the one shared `LangProvider` (`@/lib/demo/cafe/i18n`,
 * the same JA/EN mechanism `_client-preview` uses) around the whole Staff
 * page body, so `StaffDashboardBody` and everything it renders (`ShiftTable`,
 * `ShiftLegend`, `Modal`, `ShiftExchangeRequestForm`, the language toggle
 * itself) can call `useLang()`/receive a `lang` prop. Split out because a
 * component cannot call `useLang()` above its own `LangProvider` ancestor.
 */
export function StaffDashboardClient(props: StaffDashboardClientProps) {
  return (
    <LangProvider>
      <StaffDashboardBody {...props} />
    </LangProvider>
  );
}

function StaffDashboardBody({
  tenantName,
  locationName,
  timeZone,
  periodStart,
  periodEnd,
  weekOffset,
  profile,
  displayName,
  staffNameById,
  shiftTypes,
  requests,
  assignments,
  attendance,
  correctionRequests,
  exchanges,
  staffMessages,
  inventoryEnabled,
  operationsEnabled,
  inventoryItems,
  inventoryCanManage,
  inventoryMediaUrlByItemId,
  inventoryStaffNameById,
  purchasesItems,
  purchasesStaffNameById,
  operationsTasks,
  operationsItems,
  operationsResponsesByInstanceId,
  operationsBusinessDate,
  recipeGroups,
  recipeTitleFieldByRecipeId,
  recipeMediaUrlByRecipeId,
  recipeCanManage,
  initialPopup,
  locationId,
}: StaffDashboardClientProps) {
  const router = useRouter();
  const { lang } = useLang();
  const t = (key: Parameters<typeof tStaffDashboard>[1]) => tStaffDashboard(lang, key);
  const [banner, setBanner] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [scheduleHelpOpen, setScheduleHelpOpen] = useState(false);
  const [exchangeHelpOpen, setExchangeHelpOpen] = useState(false);
  const [recipesPopupOpen, setRecipesPopupOpen] = useState(initialPopup === 'recipes');
  const [inventoryPopupOpen, setInventoryPopupOpen] = useState(initialPopup === 'inventory');
  const [purchasesPopupOpen, setPurchasesPopupOpen] = useState(initialPopup === 'purchases');
  const [operationsPopupOpen, setOperationsPopupOpen] = useState(initialPopup === 'operations');
  const [mailPopupOpen, setMailPopupOpen] = useState(false);
  // Full 7-day week always visible, no page-level horizontal scroll, at
  // 375px/390px viewport widths (Staff Shift Schedule v2, 2026-08-25) --
  // switches `ShiftTable`'s existing (previously unused) `compact` prop.
  const isCompactSchedule = useIsCompactSchedule();

  // Client-side week navigation (Founder Preview QA, 2026-08-25) -- see
  // `MIN_WEEK_OFFSET`/`MAX_WEEK_OFFSET`'s doc comment above. `weekOffset`/
  // `periodStart`/`periodEnd` remain the server-seeded fallback/initial
  // values; everything actually displayed below reads `activeWeekOffset`/
  // `activePeriodStart`/`activePeriodEnd` instead.
  const [activeWeekOffset, setActiveWeekOffset] = useState(weekOffset);
  const activePeriodStart = useMemo(
    () => addIsoDays(periodStart, (activeWeekOffset - weekOffset) * 7),
    [periodStart, activeWeekOffset, weekOffset],
  );
  const activePeriodEnd = useMemo(
    () => addIsoDays(periodEnd, (activeWeekOffset - weekOffset) * 7),
    [periodEnd, activeWeekOffset, weekOffset],
  );

  function weekHref(targetOffset: number) {
    return targetOffset === 0 ? '/staff' : `/staff?weekOffset=${targetOffset}`;
  }

  function navigateToWeek(targetOffset: number) {
    if (targetOffset === activeWeekOffset || targetOffset < MIN_WEEK_OFFSET || targetOffset > MAX_WEEK_OFFSET) return;
    // Pure client-side date-range filter over the already-preloaded
    // `windowAssignments` window below -- no Server Action call, no
    // `router.push`/`router.refresh()` (which would re-run this whole
    // page's data batch and reset scroll).
    setActiveWeekOffset(targetOffset);
    window.history.replaceState(null, '', weekHref(targetOffset));
  }

  // Swipe-to-change-week on the schedule grid itself (Founder Preview QA,
  // 2026-08-25, bug #5) -- a horizontal finger swipe calls the same
  // `navigateToWeek` the ‹/This week/› buttons use, matching the swipe
  // gesture staff would expect from a modern calendar-style app. A small
  // deadzone (SWIPE_THRESHOLD) plus requiring the horizontal delta to
  // meaningfully dominate the vertical one keeps an ordinary vertical page
  // scroll, or a tap on a cell, from misfiring as a week change.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 48;

  function handleScheduleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleScheduleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    navigateToWeek(activeWeekOffset + (deltaX < 0 ? 1 : -1));
  }

  // Reset the "Request a correction" sub-form whenever a different date is
  // opened (or the modal closes) -- otherwise it could stay expanded across
  // dates that already have their own correction/no correction state.
  useEffect(() => {
    setShowCorrectionForm(false);
  }, [selectedDate]);

  // Items currently marked "bought" in Purchases -- fed into the Inventory
  // popup below as a reminder icon (`InventoryPopup`'s `boughtItemIds`).
  // Reuses `purchasesItems` (already fetched for the Purchases popup itself,
  // see page.tsx) rather than a second query -- both popups share the exact
  // same server read.
  const inventoryBoughtItemIds = useMemo(
    () => (purchasesItems ?? []).filter((i) => i.purchaseStatus === 'bought').map((i) => i.itemId),
    [purchasesItems],
  );

  // Staff<->Manager Mail (0090): manager-authored, unread, non-archived/
  // deleted messages in the caller's own single thread -- shown as inline
  // label text on the Mail entry-point button (Founder's own devtools
  // mockup rendered the count that way, e.g. "Mail 1" -- `EntryPointsCardButton`
  // has no separate badge prop today, see that button's own `label` below).
  const unreadMailCount = useMemo(
    () => (staffMessages ?? []).filter((m) => m.senderRole === 'manager' && !m.isRead && !m.archivedAt && !m.deletedAt).length,
    [staffMessages],
  );

  const shiftTypeById = useMemo(() => new Map((shiftTypes ?? []).map((st) => [st.shiftTypeId, st])), [shiftTypes]);

  // The full ±8-week, this-location window seeded once from the initial page
  // load's `assignments` prop, then spliced with a background poll of just
  // the currently displayed week (`getMyScheduleWeek`) -- same pattern
  // `_client-preview`'s `PreviewStaffSchedule` uses -- so a Manager's publish
  // becomes visible here without a manual reload.
  const [windowAssignments, setWindowAssignments] = useState<WorkforceShiftAssignment[]>(assignments ?? []);

  useEffect(() => {
    setWindowAssignments(assignments ?? []);
  }, [assignments]);

  useEffect(() => {
    if (assignments === null) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await getMyScheduleWeek(activeWeekOffset);
        if (cancelled || result.status !== 'success') return;
        const fetchedDateSet = new Set(dateRange(result.data.periodStart, result.data.periodEnd));
        setWindowAssignments((prev) => [
          ...prev.filter((a) => !fetchedDateSet.has(utcIsoToLocalDateTime(a.startsAt, timeZone).workDate)),
          ...result.data.assignments,
        ]);
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(poll, SCHEDULE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeWeekOffset, timeZone, assignments]);

  const dates = useMemo(() => dateRange(activePeriodStart, activePeriodEnd), [activePeriodStart, activePeriodEnd]);

  const staffList = useMemo(
    () =>
      buildStaffScheduleRoster(
        windowAssignments,
        profile.staffId,
        { me: t('meLabel'), colleaguePrefix: t('colleaguePrefixLabel') },
        staffNameById,
      ),
    [windowAssignments, profile.staffId, lang, staffNameById],
  );
  const displayShiftTypes = useMemo(
    () => toStaffViewShiftTypes(shiftTypes ?? [], windowAssignments, dates, timeZone),
    [shiftTypes, windowAssignments, dates, timeZone],
  );
  const displayAssignments = useMemo(
    () => toStaffViewAssignments(windowAssignments, dates, timeZone),
    [windowAssignments, dates, timeZone],
  );
  const attentionCellKeys = useMemo(
    () => computeStaffAttentionCellKeys(correctionRequests ?? [], exchanges ?? [], windowAssignments, profile.staffId, timeZone),
    [correctionRequests, exchanges, windowAssignments, profile.staffId, timeZone],
  );

  const selectedAssignment = useMemo(() => {
    if (!selectedDate) return undefined;
    return windowAssignments.find(
      (entry) => entry.employeeId === profile.staffId && utcIsoToLocalDateTime(entry.startsAt, timeZone).workDate === selectedDate,
    );
  }, [selectedDate, windowAssignments, profile.staffId, timeZone]);
  const existingExchangeForSelected = useMemo(() => {
    if (!selectedAssignment) return undefined;
    return (exchanges ?? []).find(
      (exchange) =>
        exchange.shiftId === selectedAssignment.assignmentId && exchange.status !== 'rejected' && exchange.status !== 'cancelled',
    );
  }, [exchanges, selectedAssignment]);
  // Scoped to just the opened date -- `CorrectionRequestForm`'s "related work
  // report" picker should only offer that date's own attendance row(s), not
  // every week's.
  const selectedDateAttendanceOptions = useMemo(
    () => (attendance ?? []).filter((entry) => entry.workDate === selectedDate),
    [attendance, selectedDate],
  );
  const selectedAttendance = useMemo(
    () => selectedDateAttendanceOptions[0] ?? null,
    [selectedDateAttendanceOptions],
  );
  // Distinguishes the "Shift request" modal (a future own shift -- exchange/
  // change/cancel) from the "Shift Details" modal (a past, or today-with-a-
  // report, own shift -- planned vs actual, transport, correction). A
  // published future assignment is the only case that opens the request
  // form; every other openable own-cell case (past date, or today once a
  // report exists -- see `ShiftTable`'s `isCellClickable`) shows details.
  const isFutureOwnShift = Boolean(
    selectedAssignment && selectedAssignment.published && new Date(selectedAssignment.startsAt).getTime() > Date.now(),
  );
  const canRequestExchange = isFutureOwnShift && !existingExchangeForSelected;
  // Resolves a shift's display label the same way everywhere it's shown
  // (future-shift "Shift" row and past-shift "Planned shift" row): the
  // canonical `shiftTypeDisplayLabel` when `shiftTypeId` resolves to a known
  // type, otherwise the assignment's own local start/end time -- never the
  // literal English word "Custom" (Staff Shift Schedule v2, 2026-08-25).
  function shiftLabelFor(entry: WorkforceShiftAssignment): string {
    const st = shiftTypeById.get(entry.shiftTypeId ?? '');
    if (st) return shiftTypeDisplayLabel(st);
    const start = utcIsoToLocalDateTime(entry.startsAt, timeZone).localTime;
    const end = utcIsoToLocalDateTime(entry.endsAt, timeZone).localTime;
    return customShiftTimeRangeLabel[lang](start, end);
  }
  // The most recently submitted correction request for the opened date, if
  // any -- reopening a past shift with an existing correction shows its
  // current state instead of a blank "Request a correction" button.
  const selectedDateCorrection = useMemo(() => {
    const matches = (correctionRequests ?? []).filter((r) => r.kind === 'correction' && r.workDate === selectedDate);
    if (matches.length === 0) return undefined;
    return [...matches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }, [correctionRequests, selectedDate]);

  // Staff must only ever see their own, published shifts in the weekly-hours summary here -- never a co-worker's row, never a manager's unpublished draft.
  const myScheduleThisWeek = useMemo(() => {
    return windowAssignments
      .filter((a) => a.published && a.employeeId === profile.staffId)
      .map((a) => {
        const start = utcIsoToLocalDateTime(a.startsAt, timeZone);
        const end = utcIsoToLocalDateTime(a.endsAt, timeZone);
        return { assignment: a, workDate: start.workDate, startsAtLocal: start.localTime, endsAtLocal: end.localTime };
      })
      .filter((entry) => entry.workDate >= activePeriodStart && entry.workDate <= activePeriodEnd)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.startsAtLocal.localeCompare(b.startsAtLocal));
  }, [windowAssignments, profile.staffId, timeZone, activePeriodStart, activePeriodEnd]);

  const todayIso = useMemo(() => todayIsoInTimeZone(timeZone), [timeZone]);

  const todayAttendance = useMemo(() => (attendance ?? []).find((a) => a.workDate === todayIso) ?? null, [attendance, todayIso]);

  const weeklyHours = useMemo(
    () => myScheduleThisWeek.reduce((sum, entry) => sum + hoursBetween(entry.startsAtLocal, entry.endsAtLocal), 0),
    [myScheduleThisWeek],
  );

  // Worked-this-month / hourly wage / estimated earnings summary (Staff
  // Shift Schedule v2, 2026-08-25). `estimatedEarningsSummary` itself is
  // untouched -- this is purely wiring the caller's own already-loaded
  // `attendance` and `profile.hourlyWageYen` into it. Gracefully omits the
  // wage/estimate portion (never fabricates one) when `hourlyWageYen` is
  // genuinely not on file for this staff member.
  const earnings = useMemo(
    () => estimatedEarningsSummary(attendance ?? [], todayIso.slice(0, 7), profile.hourlyWageYen),
    [attendance, todayIso, profile.hourlyWageYen],
  );

  function handleFormSuccess(message: string) {
    setBanner(message);
    router.refresh();
  }

  /**
   * Transportation cost and Daily message now show their own inline status
   * next to their heading (Founder direction, 2026-08-24) -- a page-level
   * banner on every save would be redundant, and outright noisy for
   * Transportation cost's autosave-on-type. Still refreshes server data
   * (so `todayAttendance` reflects the just-saved value elsewhere on the
   * page), just without `handleFormSuccess`'s banner.
   */
  function refreshAfterQuietSave() {
    router.refresh();
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
        {/* `minWidth: 0` + `overflowWrap: anywhere` let a long tenant/location name wrap onto further lines within this block
            instead of the header row falling back to its `flexWrap` and pushing the account menu onto its own row (Founder
            header redesign, 2026-08-24: identity moves to the account menu on the right, this side is tenant + location only,
            matching the multi-location mockup -- "ORUWA Cafe" / "Main Store" -- and no longer "Staff -- {name}"). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
          <BrandBadge label={tenantName} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.textPrimary, overflowWrap: 'anywhere' }}>{tenantName}</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, overflowWrap: 'anywhere', ...mutedText }}>{locationName}</p>
          </div>
        </div>
        {/* No header Updates/unread badge or read/seen persistence yet -- explicitly deferred by the Founder (Staff Shift Schedule v2, 2026-08-25); the "!" cell indicators below (`attentionCellKeys`) are the only attention signal this iteration ships, and this is a platform-wide notification capability, not something to half-stub here. */}
        <AccountMenu
          displayName={displayName ?? t('pageTitle')}
          positionLabel={profile.positionLabel ?? t('notSetLabel')}
          signOutLabel={t('signOut')}
        />
      </header>

      <WorkStatusCard todayAttendance={todayAttendance} timeZone={timeZone} lang={lang} />

      <EntryPointsCard
        heading={t('entryPointsHeading')}
        buttons={[
          { key: 'recipes', label: t('navRecipes'), onClick: () => setRecipesPopupOpen(true) },
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
          // Purchases has no module flag of its own -- it rides Inventory's
          // (`core.has_module_access(tenant_id, 'inventory')`), so its
          // entry point is gated by the same `inventoryEnabled` condition as
          // Inventory itself. Matches manager-dashboard-client.tsx. The
          // PurchasesPopup keeps its own "temporarily unavailable" fallback
          // for other failure scenarios; this only hides the action.
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
          {
            key: 'mail',
            label: unreadMailCount > 0 ? `${t('navMail')} ${unreadMailCount}` : t('navMail'),
            onClick: () => {
              markPopupTriggerClick('staff-mail');
              setMailPopupOpen(true);
            },
          },
          ...(operationsEnabled
            ? [
                {
                  key: 'operations',
                  label: t('navOperations'),
                  onClick: () => {
                    markPopupTriggerClick('operations');
                    setOperationsPopupOpen(true);
                  },
                },
              ]
            : []),
        ]}
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

      <InventoryPopup
        open={inventoryPopupOpen}
        onClose={() => setInventoryPopupOpen(false)}
        tenantName={tenantName}
        locationName={locationName}
        locationId={locationId}
        locationTimezone={timeZone}
        items={inventoryItems}
        mediaUrlByItemId={inventoryMediaUrlByItemId}
        staffNameById={inventoryStaffNameById}
        canManage={inventoryCanManage}
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
        staffNameById={purchasesStaffNameById}
      />

      <OperationsStaffPopup
        open={operationsPopupOpen}
        onClose={() => setOperationsPopupOpen(false)}
        tenantName={tenantName}
        locationName={locationName}
        tasks={operationsTasks}
        items={operationsItems}
        responsesByInstanceId={operationsResponsesByInstanceId}
        businessDate={operationsBusinessDate}
      />

      {banner ? <div style={{ ...alertSuccess, marginTop: 16 }}>{banner}</div> : null}

      <section style={primaryCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16, whiteSpace: 'nowrap' }}>
              {t('scheduleHeading')} ({shortDate(activePeriodStart)} - {shortDate(activePeriodEnd)})
            </h2>
            <HelpIconButton ariaLabel={t('scheduleHelpAriaLabel')} onClick={() => setScheduleHelpOpen(true)} />
          </div>
          {/* Founder Preview QA (2026-08-25, round 4): the icon navigator
              from Round 2/3 read as small/secondary next to the full-width
              Recipes/Inventory/Purchases row above it -- these three buttons
              now share the row equally (`flex: 1`, same pattern
              `EntryPointsCard` already uses), stretched to `width: '100%'`
              so they take their own full-width line under the heading
              instead of clustering to one side with empty space beside
              them. Plain `<button onClick>` (never `<Link href>`) still
              drives the pure client-side `navigateToWeek` week switch, no
              full page reload/jump (bugs #2/#4/#6). Real words stay in
              `aria-label`/`title` since the visible glyph is just `‹`/`›`. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box' }}>
            <button
              type="button"
              className={hoverStyles.buttonSecondary}
              style={{ ...buttonSecondary, flex: 1, boxSizing: 'border-box', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, lineHeight: 1 }}
              aria-label={t('prevWeek')}
              title={t('prevWeek')}
              onClick={() => navigateToWeek(activeWeekOffset - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              style={{
                ...(activeWeekOffset === 0 ? buttonDisabled : buttonSecondary),
                flex: 2,
                boxSizing: 'border-box',
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
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
              style={{ ...buttonSecondary, flex: 1, boxSizing: 'border-box', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, lineHeight: 1 }}
              aria-label={t('nextWeek')}
              title={t('nextWeek')}
              onClick={() => navigateToWeek(activeWeekOffset + 1)}
            >
              ›
            </button>
          </div>
        </div>
        {assignments === null ? (
          <p style={{ margin: '8px 0 0', ...mutedText }}>{t('scheduleUnavailable')}</p>
        ) : (
          <>
            <p style={{ margin: '12px 0 0', fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
              {scheduledThisWeekValue[lang](weeklyHours.toFixed(1))}
            </p>
            <div style={{ marginTop: 8 }} onTouchStart={handleScheduleTouchStart} onTouchEnd={handleScheduleTouchEnd}>
              <ShiftTable
                dates={dates}
                todayIso={todayIso}
                staffList={staffList}
                assignments={displayAssignments}
                shiftTypes={displayShiftTypes}
                mode="staff"
                currentStaffId={profile.staffId}
                compact={isCompactSchedule}
                lang={lang}
                attentionCellKeys={attentionCellKeys}
                onCellClick={(staffId, date) => {
                  if (staffId !== profile.staffId) return;
                  setSelectedDate(date);
                }}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <ShiftLegend shiftTypes={displayShiftTypes} lang={lang} numbered={isCompactSchedule} />
            </div>
            {/* Only shown when at least one cell actually carries "!" this week -- explains what
                it means (a pending correction/exchange request on that shift, tap to see it)
                instead of leaving it to a `title` tooltip that never appears on a touch device
                (Founder Preview QA, 2026-08-25, round 3). */}
            {attentionCellKeys.size > 0 ? (
              <p style={{ margin: '6px 0 0', fontSize: 11, ...mutedText }}>{t('attentionIndicatorLegend')}</p>
            ) : null}
            {/* Worked this month / hourly wage / estimated earnings -- gracefully omits the wage/estimate portion (never fabricates one) when no hourly wage is on file. */}
            <p style={{ margin: '8px 0 0', fontSize: 11, ...mutedText }}>
              {earningsWorkedHoursValue[lang](earnings.workedHours.toFixed(1))}
              {earnings.hourlyWageYen !== null && earnings.estimatedEarningsYen !== null
                ? earningsEstimatedSuffix[lang](earnings.hourlyWageYen, earnings.estimatedEarningsYen)
                : ''}
            </p>

            <Modal
              open={selectedDate !== null}
              onClose={() => setSelectedDate(null)}
              title={selectedDate ?? ''}
            >
              {selectedDate && isFutureOwnShift && selectedAssignment ? (
                <>
                  <div style={{ display: 'grid', gap: 0, marginBottom: 12 }}>
                    {[
                      [t('shiftLabel'), shiftLabelFor(selectedAssignment)],
                      [
                        t('timeLabel'),
                        `${utcIsoToLocalDateTime(selectedAssignment.startsAt, timeZone).localTime} - ${utcIsoToLocalDateTime(selectedAssignment.endsAt, timeZone).localTime}`,
                      ],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
                        <span style={mutedText}>{label}</span>
                        <strong style={{ color: colors.textPrimary }}>{value}</strong>
                      </div>
                    ))}
                  </div>
                  {canRequestExchange ? (
                    <div style={{ paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 4px' }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{t('requestChangeHeading')}</p>
                        <HelpIconButton ariaLabel={t('exchangeHelpAriaLabel')} onClick={() => setExchangeHelpOpen(true)} />
                      </div>
                      <ShiftExchangeRequestForm
                        shiftId={selectedAssignment.assignmentId}
                        shiftTypes={shiftTypes}
                        lang={lang}
                        onSuccess={() => {
                          setSelectedDate(null);
                          handleFormSuccess(t('exchangeSubmitted'));
                        }}
                      />
                    </div>
                  ) : existingExchangeForSelected ? (
                    <p style={{ ...mutedText, fontSize: 13 }}>{existingExchangeMessage[lang](existingExchangeForSelected.status)}</p>
                  ) : null}
                </>
              ) : selectedDate && (selectedAssignment || selectedAttendance) ? (
                <>
                  <div style={{ display: 'grid', gap: 0 }}>
                    {(
                      [
                        [t('plannedShiftLabel'), selectedAssignment ? `${shiftLabelFor(selectedAssignment)} (${utcIsoToLocalDateTime(selectedAssignment.startsAt, timeZone).localTime}-${utcIsoToLocalDateTime(selectedAssignment.endsAt, timeZone).localTime})` : '—'],
                        [t('clockInLabel'), selectedAttendance?.clockIn ? utcIsoToLocalDateTime(selectedAttendance.clockIn, timeZone).localTime : '—'],
                        [t('actualBreakLabel'), selectedAttendance ? `${selectedAttendance.actualBreakMinutes}${t('workStatusMinutesSuffix')}` : '—'],
                        [t('clockOutLabel'), selectedAttendance?.clockOut ? utcIsoToLocalDateTime(selectedAttendance.clockOut, timeZone).localTime : '—'],
                        ...(selectedAttendance?.transportationCost != null
                          ? [[t('transportationLabel'), `¥${selectedAttendance.transportationCost}`] as [string, string]]
                          : []),
                      ] as [string, string][]
                    ).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}>
                        <span style={mutedText}>{label}</span>
                        <strong style={{ color: colors.textPrimary }}>{value}</strong>
                      </div>
                    ))}
                  </div>
                  {selectedDateCorrection ? (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>{t('correctionRequestStatusHeading')}</span>
                        <span style={correctionStatusBadgeStyle(selectedDateCorrection.status)}>
                          {correctionStatusLabel(selectedDateCorrection.status, lang)}
                        </span>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 13, ...mutedText }}>
                        {t('correctionRequestedChangeLabel')}: {formatRequestedCorrectionChange(selectedDateCorrection.details, lang)}
                      </p>
                      {typeof selectedDateCorrection.details.message === 'string' && selectedDateCorrection.details.message ? (
                        <p style={{ margin: '4px 0 0', fontSize: 13, ...mutedText }}>
                          {t('correctionMessageLabel')}: {selectedDateCorrection.details.message}
                        </p>
                      ) : null}
                    </div>
                  ) : showCorrectionForm ? (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                      <CorrectionRequestForm
                        attendanceOptions={selectedDateAttendanceOptions}
                        defaultWorkDate={selectedDate}
                        timeZone={timeZone}
                        lang={lang}
                        onSuccess={() => {
                          setSelectedDate(null);
                          handleFormSuccess(t('correctionRequestSubmitted'));
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      style={{ ...buttonSecondary, marginTop: 12 }}
                      onClick={() => setShowCorrectionForm(true)}
                    >
                      {t('requestCorrectionButton')}
                    </button>
                  )}
                </>
              ) : (
                <p style={mutedText}>{t('noShiftOrReport')}</p>
              )}
            </Modal>
          </>
        )}
      </section>

      <Modal open={scheduleHelpOpen} onClose={() => setScheduleHelpOpen(false)} title={t('scheduleHeading')} maxWidth={420}>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('scheduleHelpBody')}</p>
      </Modal>

      <Modal open={exchangeHelpOpen} onClose={() => setExchangeHelpOpen(false)} title={t('exchangeHelpTitle')} maxWidth={420}>
        <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{t('exchangeHelpBody')}</p>
      </Modal>

      <div style={{ marginTop: 16 }}>
        <TransportForm
          workDate={todayIso}
          defaultTransportationCost={todayAttendance?.transportationCost ?? null}
          lang={lang}
          onSuccess={refreshAfterQuietSave}
        />
      </div>

      <StaffMailPopup
        open={mailPopupOpen}
        onClose={() => setMailPopupOpen(false)}
        messages={staffMessages}
        timeZone={timeZone}
        lang={lang}
        onChange={() => router.refresh()}
      />

      <section style={{ ...card, marginTop: 16 }}>
        {shiftTypes === null ? (
          <p style={{ margin: 0, ...mutedText }}>{t('shiftTypesUnavailable')}</p>
        ) : (
          <button type="button" style={{ ...buttonPrimary, width: '100%', justifyContent: 'center' }} onClick={() => setMonthlyModalOpen(true)}>
            {t('preferenceModalTitle')}
          </button>
        )}
      </section>

      {shiftTypes !== null ? (
        <MonthlyShiftPreferenceModal
          open={monthlyModalOpen}
          onClose={() => setMonthlyModalOpen(false)}
          shiftTypes={shiftTypes}
          requests={requests ?? []}
          lang={lang}
          onSuccess={(message) => handleFormSuccess(message)}
        />
      ) : null}
    </>
  );
}
