/**
 * Manager Attention Layer — Cafe v2.1 Mission 2.
 *
 * Pure derivation only: takes counts already computed by existing,
 * reliable data (pending correction requests, actionable shift-exchange
 * requests, inventory shortages) and turns them into an ordered list of
 * attention items. Introduces no new business rule, no new persisted
 * state, and no new lifecycle -- every count it consumes already exists as
 * a `useMemo` on the Manager dashboard (`pendingCorrections.length`,
 * `pendingExchanges.length`) or an existing server-computed Inventory
 * field (`InventoryItemStatus.status === 'shortage'`). Kept as a pure
 * function (not embedded directly in JSX) so it is unit-testable and so a
 * future reliable operational state can add one more line here without
 * touching any dashboard markup.
 */

export type ManagerAttentionCategory = 'correction' | 'exchange' | 'unavailable_conflict' | 'inventory';

export interface ManagerAttentionItem {
  category: ManagerAttentionCategory;
  count: number;
}

export interface ManagerAttentionInput {
  pendingCorrectionCount: number;
  pendingExchangeCount: number;
  /**
   * Cafe v2.1 QA audit P2-10, 2026-08-17: how many employee/date pairs have
   * both a submitted `isUnavailable` preference request AND a draft-or-published
   * shift assignment for that same date -- a conflict that was previously
   * silently possible to publish. Computed by `computeUnavailableConflictCellKeys`
   * from data the Manager dashboard already loads (no new query).
   */
  unavailableConflictCount: number;
  /** `null` when Inventory is not enabled for this tenant, or its read failed -- omitted from the result, not shown as zero. */
  inventoryShortageCount: number | null;
}

/** Order is fixed and deliberate: Manager-decision items (someone is waiting on a yes/no) and schedule-safety items before operational/stock items. */
export function computeManagerAttention(input: ManagerAttentionInput): ManagerAttentionItem[] {
  const items: ManagerAttentionItem[] = [];
  if (input.pendingCorrectionCount > 0) {
    items.push({ category: 'correction', count: input.pendingCorrectionCount });
  }
  if (input.pendingExchangeCount > 0) {
    items.push({ category: 'exchange', count: input.pendingExchangeCount });
  }
  if (input.unavailableConflictCount > 0) {
    items.push({ category: 'unavailable_conflict', count: input.unavailableConflictCount });
  }
  if (input.inventoryShortageCount !== null && input.inventoryShortageCount > 0) {
    items.push({ category: 'inventory', count: input.inventoryShortageCount });
  }
  return items;
}

/**
 * Manager Attention UX Reconciliation (2026-08-21): a Manager decision is
 * required (`action_required`) for correction/exchange -- someone is waiting
 * on a yes/no -- versus an operational/schedule-safety condition worth
 * inspecting but with no single decision to make (`warning`) for
 * unavailable-conflict/inventory. Fixed, not configurable -- do not invent a
 * third tier without new evidence a category actually needs one (see the
 * mission brief's "do not invent critical without evidence").
 */
export type ManagerAttentionSeverity = 'action_required' | 'warning';

export const ATTENTION_SEVERITY_BY_CATEGORY: Record<ManagerAttentionCategory, ManagerAttentionSeverity> = {
  correction: 'action_required',
  exchange: 'action_required',
  unavailable_conflict: 'warning',
  inventory: 'warning',
};

export interface ManagerAttentionSummary {
  total: number;
  actionRequiredCount: number;
  warningCount: number;
}

/** Level-1 "Needs attention N / X require action, Y warnings" summary -- pure sum over the already-computed category counts, no new source of truth. */
export function computeManagerAttentionSummary(items: readonly ManagerAttentionItem[]): ManagerAttentionSummary {
  let actionRequiredCount = 0;
  let warningCount = 0;
  for (const item of items) {
    if (ATTENTION_SEVERITY_BY_CATEGORY[item.category] === 'action_required') actionRequiredCount += item.count;
    else warningCount += item.count;
  }
  return { total: actionRequiredCount + warningCount, actionRequiredCount, warningCount };
}

/** Minimal shape a pending correction request needs for the Level-3 attention queue. */
export interface AttentionCorrectionQueueInput {
  requestId: string;
  employeeId: string;
  workDate: string;
}

/** Minimal shape a pending shift-exchange request needs for the Level-3 attention queue. */
export interface AttentionExchangeQueueInput {
  exchangeId: string;
  employeeId: string;
  /** `null` when the referenced shift assignment could not be resolved. */
  workDate: string | null;
  /** Mirrors the popup's own `canApprove` (an 'exchange' request with no accepted candidate yet cannot be approved) -- the queue item surfaces the same disabled-reason text, does not invent a new rule. */
  canApprove: boolean;
}

/** Minimal shape an unavailable/schedule conflict needs for the Level-3 attention queue. */
export interface AttentionConflictQueueInput {
  employeeId: string;
  workDate: string;
}

/** Minimal shape a shortage inventory item needs for the Level-3 attention queue. */
export interface AttentionInventoryItemInput {
  itemId: string;
  name: string;
  actualQuantity: number | null;
  requiredQuantity: number;
}

export type ManagerAttentionQueueItem =
  | { id: string; category: 'correction'; severity: 'action_required'; requestId: string; employeeId: string; workDate: string }
  | { id: string; category: 'exchange'; severity: 'action_required'; exchangeId: string; employeeId: string; workDate: string | null; canApprove: boolean }
  | { id: string; category: 'unavailable_conflict'; severity: 'warning'; employeeId: string; workDate: string }
  | { id: string; category: 'inventory'; severity: 'warning'; shortageCount: number; topItems: readonly AttentionInventoryItemInput[] };

const INVENTORY_QUEUE_ITEM_PREVIEW_COUNT = 3;

export interface BuildManagerAttentionQueueInput {
  pendingCorrections: readonly AttentionCorrectionQueueInput[];
  pendingExchanges: readonly AttentionExchangeQueueInput[];
  unavailableConflicts: readonly AttentionConflictQueueInput[];
  /** Already filtered to `status === 'shortage'` by the caller -- this builder does not re-derive Inventory's own shortage rule. */
  inventoryShortageItems: readonly AttentionInventoryItemInput[];
}

/**
 * Level-3 concrete "who/what/when" items behind the Level-1/2 counts --
 * derives presentation only, no new business state. Ordering is fixed:
 * action-required categories (correction, then exchange) before warning
 * categories (unavailable-conflict, then inventory); each category's own
 * items are sorted by `workDate` ascending (soonest/oldest first) then by id,
 * so the result is deterministic regardless of the caller's array order.
 * Inventory collapses to exactly one queue item (the whole shortage list),
 * matching the mission's "one Inventory shortage card, not one row per item"
 * shape -- `topItems` caps at 3 for the compact view; the full list still
 * lives in the existing Inventory popup.
 */
export function buildManagerAttentionQueue(input: BuildManagerAttentionQueueInput): ManagerAttentionQueueItem[] {
  const items: ManagerAttentionQueueItem[] = [];

  const corrections = [...input.pendingCorrections].sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.requestId.localeCompare(b.requestId),
  );
  for (const r of corrections) {
    items.push({ id: `correction:${r.requestId}`, category: 'correction', severity: 'action_required', requestId: r.requestId, employeeId: r.employeeId, workDate: r.workDate });
  }

  const exchanges = [...input.pendingExchanges].sort(
    (a, b) => (a.workDate ?? '9999-99-99').localeCompare(b.workDate ?? '9999-99-99') || a.exchangeId.localeCompare(b.exchangeId),
  );
  for (const e of exchanges) {
    items.push({ id: `exchange:${e.exchangeId}`, category: 'exchange', severity: 'action_required', exchangeId: e.exchangeId, employeeId: e.employeeId, workDate: e.workDate, canApprove: e.canApprove });
  }

  const conflicts = [...input.unavailableConflicts].sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId),
  );
  for (const c of conflicts) {
    items.push({ id: `conflict:${c.employeeId}:${c.workDate}`, category: 'unavailable_conflict', severity: 'warning', employeeId: c.employeeId, workDate: c.workDate });
  }

  if (input.inventoryShortageItems.length > 0) {
    const sortedShortages = [...input.inventoryShortageItems].sort((a, b) => a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId));
    items.push({
      id: 'inventory:shortage',
      category: 'inventory',
      severity: 'warning',
      shortageCount: sortedShortages.length,
      topItems: sortedShortages.slice(0, INVENTORY_QUEUE_ITEM_PREVIEW_COUNT),
    });
  }

  return items;
}

/** Minimal shape `computeUnavailableConflictCellKeys` needs from a shift request -- avoids importing the full `WorkforceShiftRequest` type into this pure-derivation module. */
export interface UnavailableConflictRequestInput {
  employeeId: string;
  workDate: string;
  kind: string;
  isUnavailable: boolean;
}

/** Minimal shape `computeUnavailableConflictCellKeys` needs from a shift assignment. */
export interface UnavailableConflictAssignmentInput {
  employeeId: string | null;
  workDate: string;
}

/**
 * `${employeeId}:${workDate}` keys where the employee submitted an
 * `isUnavailable` preference for that date AND a shift (draft or published)
 * is currently assigned to them on the same date -- the exact conflict
 * P2-10 flags as silently publishable today. Pure: the caller supplies each
 * assignment's own local `workDate` (already timezone-resolved), matching
 * how the Manager dashboard's own `localAssignments` is derived.
 */
export function computeUnavailableConflictCellKeys(
  requests: readonly UnavailableConflictRequestInput[],
  assignments: readonly UnavailableConflictAssignmentInput[],
): Set<string> {
  const unavailableKeys = new Set(
    requests
      .filter((r) => r.kind === 'preference' && r.isUnavailable)
      .map((r) => `${r.employeeId}:${r.workDate}`),
  );
  const conflicts = new Set<string>();
  for (const a of assignments) {
    if (!a.employeeId) continue;
    const key = `${a.employeeId}:${a.workDate}`;
    if (unavailableKeys.has(key)) conflicts.add(key);
  }
  return conflicts;
}

/**
 * Same conflicts as `computeUnavailableConflictCellKeys`, split back into
 * `{ employeeId, workDate }` records for the Level-3 attention queue (which
 * needs the parts, not just the schedule grid's `"employeeId:workDate"`
 * marker key). Reuses that function rather than re-deriving the conflict
 * rule -- `employeeId` (a UUID) and `workDate` (`YYYY-MM-DD`) never contain
 * `:`, so splitting on the last `:` is safe.
 */
export function computeUnavailableConflictRecords(
  requests: readonly UnavailableConflictRequestInput[],
  assignments: readonly UnavailableConflictAssignmentInput[],
): { employeeId: string; workDate: string }[] {
  const keys = computeUnavailableConflictCellKeys(requests, assignments);
  return [...keys].map((key) => {
    const separatorIndex = key.lastIndexOf(':');
    return { employeeId: key.slice(0, separatorIndex), workDate: key.slice(separatorIndex + 1) };
  });
}

/** Minimal shape `computePendingCorrectionCellKeys` needs from a pending correction request. */
export interface PendingCorrectionRequestInput {
  employeeId: string;
  workDate: string;
}

/**
 * `${employeeId}:${workDate}` keys for pending corrections on a PAST day
 * (`workDate < todayIso`) -- the schedule grid's "!" marker (WP-8). The
 * caller passes only already-`status === 'pending'` rows (same
 * `pendingCorrections` derivation the Manager dashboard already has); this
 * function just adds the past-day guard, mirroring
 * `computeUnavailableConflictCellKeys`'s shape.
 */
export function computePendingCorrectionCellKeys(
  pendingCorrections: readonly PendingCorrectionRequestInput[],
  todayIso: string,
): Set<string> {
  const keys = new Set<string>();
  for (const r of pendingCorrections) {
    if (r.workDate < todayIso) keys.add(`${r.employeeId}:${r.workDate}`);
  }
  return keys;
}

/** Monday-first weekday index (0=Mon..6=Sun) matching `requiredHeadcountByWeekday`'s own indexing (see `settings-section.tsx`'s `WEEKDAY_LABELS_MON_FIRST`) -- NOT `Date#getUTCDay()`'s Sunday-first convention. */
function mondayFirstWeekdayIndex(isoDate: string): number {
  const sundayFirst = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return (sundayFirst + 6) % 7;
}

export interface DailyStaffingCoverage {
  workDate: string;
  required: number;
  scheduled: number;
  missing: number;
}

/**
 * Per-date staffing coverage (required vs. actually scheduled headcount) for
 * every date in the displayed week (WP-8's understaffed-day "!" marker;
 * extended, Weekly Schedule Founder Review Round 2, 2026-08-22, to carry the
 * actual numbers -- "Required 3 / Scheduled 2 / Missing 1" -- instead of
 * just a boolean, so the day-header warning can explain itself instead of
 * being an unexplained "!"). Pure frontend derivation:
 * `requiredHeadcountByWeekday` and `assignments` are both already loaded by
 * the Manager dashboard, no new fetch. Defaults to requiring 1 staff/day
 * when no Settings row has been saved yet, matching `settings-section.tsx`'s
 * own `[1,1,1,1,1,1,1]` fallback.
 */
export function computeDailyStaffingCoverage(
  dates: readonly string[],
  requiredHeadcountByWeekday: readonly number[] | null,
  assignmentWorkDates: readonly string[],
): DailyStaffingCoverage[] {
  const required = requiredHeadcountByWeekday ?? [1, 1, 1, 1, 1, 1, 1];
  const assignedCountByDate = new Map<string, number>();
  for (const workDate of assignmentWorkDates) {
    assignedCountByDate.set(workDate, (assignedCountByDate.get(workDate) ?? 0) + 1);
  }
  return dates.map((workDate) => {
    const requiredForDay = required[mondayFirstWeekdayIndex(workDate)] ?? 0;
    const scheduled = assignedCountByDate.get(workDate) ?? 0;
    return { workDate, required: requiredForDay, scheduled, missing: Math.max(0, requiredForDay - scheduled) };
  });
}
