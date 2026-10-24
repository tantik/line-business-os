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

export type ManagerAttentionCategory =
  | 'correction'
  | 'exchange'
  | 'issue'
  | 'operations'
  | 'unavailable_conflict'
  | 'clock_in_without_shift'
  | 'inventory';

export interface ManagerAttentionItem {
  category: ManagerAttentionCategory;
  count: number;
  /**
   * QA3 (2026-10-14): set only for the mixed-severity categories (`issue`,
   * `operations`) -- how many of `count` are action-required; the rest are
   * warnings/notices. Omitted for every fixed-severity category, whose split
   * comes from `ATTENTION_SEVERITY_BY_CATEGORY` alone.
   */
  actionRequiredCount?: number;
}

/** Severity split of one mixed-severity category's open items. */
export interface AttentionSeverityCounts {
  actionRequired: number;
  notice: number;
}

export interface ManagerAttentionInput {
  pendingCorrectionCount: number;
  pendingExchangeCount: number;
  /** Open issues split by severity (see `countOpenIssuesForAttention`). `null`/omitted when the Issues module is disabled or its read failed -- omitted from the result, not shown as zero. */
  openIssueCounts?: AttentionSeverityCounts | null;
  /** Open Operations exceptions split by their own severity (see `countOpenOperationsExceptionsForAttention`). `null`/omitted when Operations is disabled or its read failed. */
  openOperationsExceptionCounts?: AttentionSeverityCounts | null;
  /**
   * Cafe v2.1 QA audit P2-10, 2026-08-17: how many employee/date pairs have
   * both a submitted `isUnavailable` preference request AND a draft-or-published
   * shift assignment for that same date -- a conflict that was previously
   * silently possible to publish. Computed by `computeUnavailableConflictCellKeys`
   * from data the Manager dashboard already loads (no new query).
   */
  unavailableConflictCount: number;
  /** QA4 F11-C: clock-ins with no shift that day (see `computeClockInWithoutShift`). Omitted/0 = no item. */
  clockInWithoutShiftCount?: number;
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
  const issues = input.openIssueCounts;
  if (issues && issues.actionRequired + issues.notice > 0) {
    items.push({ category: 'issue', count: issues.actionRequired + issues.notice, actionRequiredCount: issues.actionRequired });
  }
  const operations = input.openOperationsExceptionCounts;
  if (operations && operations.actionRequired + operations.notice > 0) {
    items.push({ category: 'operations', count: operations.actionRequired + operations.notice, actionRequiredCount: operations.actionRequired });
  }
  if (input.unavailableConflictCount > 0) {
    items.push({ category: 'unavailable_conflict', count: input.unavailableConflictCount });
  }
  if (input.clockInWithoutShiftCount && input.clockInWithoutShiftCount > 0) {
    items.push({ category: 'clock_in_without_shift', count: input.clockInWithoutShiftCount });
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

/**
 * Default severity per category. `issue` and `operations` (QA3, 2026-10-14)
 * are mixed: each open item carries its own severity (a critical issue / an
 * `action_required` exception vs. a normal issue / a `warning` exception),
 * so their summary split comes from `ManagerAttentionItem.actionRequiredCount`
 * and their queue items carry their own `severity`; the value here is only
 * the fallback when that split is absent.
 */
export const ATTENTION_SEVERITY_BY_CATEGORY: Record<ManagerAttentionCategory, ManagerAttentionSeverity> = {
  correction: 'action_required',
  exchange: 'action_required',
  issue: 'action_required',
  operations: 'action_required',
  unavailable_conflict: 'warning',
  clock_in_without_shift: 'warning',
  inventory: 'warning',
};

/** Minimal shape `countOpenIssuesForAttention` needs from an `api.issues_open` row. */
export interface AttentionIssueInput {
  issueId: string;
  kind: string;
  severity: string | null;
  status: string;
  businessDate: string;
  note: string;
  operationsExceptionId: string | null;
}

/** Minimal shape the Operations attention counting needs from an `api.operations_open_exceptions` row. */
export interface AttentionOperationsExceptionInput {
  exceptionId: string;
  severity: string;
  source: string;
  businessDate: string | null;
  templateName: string | null;
  createdAt: string;
}

/**
 * Which open issues the Attention panel counts, and at which severity.
 * Only `kind='issue'` rows with `status='open'` (not yet acknowledged by a
 * Manager) count -- handovers are notes, not problems, and an acknowledged
 * issue has already been seen. `severity='important'` is action-required
 * (the exact rule the Issues entry-point's own red badge already uses, so the
 * two never disagree); any other severity is a notice. An issue cross-linked
 * to an exception that is itself still open is skipped so the same problem is
 * not counted twice (that link is reserved for a future slice; nothing writes
 * it today).
 */
export function classifyIssueForAttention(
  issue: AttentionIssueInput,
  openExceptionIds: ReadonlySet<string> = new Set(),
): 'action_required' | 'warning' | null {
  if (issue.kind !== 'issue' || issue.status !== 'open') return null;
  if (issue.operationsExceptionId && openExceptionIds.has(issue.operationsExceptionId)) return null;
  return issue.severity === 'important' ? 'action_required' : 'warning';
}

export function countOpenIssuesForAttention(
  issues: readonly AttentionIssueInput[] | null,
  openExceptionIds: ReadonlySet<string> = new Set(),
): AttentionSeverityCounts | null {
  if (!issues) return null;
  const counts: AttentionSeverityCounts = { actionRequired: 0, notice: 0 };
  for (const issue of issues) {
    const severity = classifyIssueForAttention(issue, openExceptionIds);
    if (severity === 'action_required') counts.actionRequired += 1;
    else if (severity === 'warning') counts.notice += 1;
  }
  return counts;
}

/** Every open Operations exception counts; its own `severity` (`action_required` | `warning`) decides the tier -- the view only returns still-open exceptions. */
export function countOpenOperationsExceptionsForAttention(
  exceptions: readonly AttentionOperationsExceptionInput[] | null,
): AttentionSeverityCounts | null {
  if (!exceptions) return null;
  const counts: AttentionSeverityCounts = { actionRequired: 0, notice: 0 };
  for (const exception of exceptions) {
    if (exception.severity === 'action_required') counts.actionRequired += 1;
    else counts.notice += 1;
  }
  return counts;
}

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
    const actionRequired =
      item.actionRequiredCount !== undefined
        ? Math.min(Math.max(item.actionRequiredCount, 0), item.count)
        : ATTENTION_SEVERITY_BY_CATEGORY[item.category] === 'action_required'
          ? item.count
          : 0;
    actionRequiredCount += actionRequired;
    warningCount += item.count - actionRequired;
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
  /** DEBT-119 f: the request kind, so the queue row can say what was asked (cancel / change / exchange) instead of calling every request an exchange. Optional; passed through unchanged. */
  requestKind?: 'exchange' | 'change' | 'cancel';
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
  | { id: string; category: 'exchange'; severity: 'action_required'; exchangeId: string; employeeId: string; workDate: string | null; canApprove: boolean; requestKind?: 'exchange' | 'change' | 'cancel' }
  | { id: string; category: 'issue'; severity: ManagerAttentionSeverity; issueId: string; businessDate: string; note: string }
  | {
      id: string;
      category: 'operations';
      severity: ManagerAttentionSeverity;
      /** Same grouping key as the Operations popup's `AttentionSection` (task + source + severity). */
      groupKey: string;
      templateName: string | null;
      source: string;
      /** How many open exceptions this group collapses. */
      count: number;
      /** Business date of the newest exception in the group (by `createdAt`). */
      latestBusinessDate: string | null;
    }
  | { id: string; category: 'unavailable_conflict'; severity: 'warning'; employeeId: string; workDate: string }
  | {
      id: string;
      category: 'clock_in_without_shift';
      severity: 'warning';
      attendanceId: string;
      employeeId: string;
      workDate: string;
      /** Clock-in instant (UTC ISO); the panel formats it in the location time zone. */
      clockIn: string;
      /** `true` while the staff member has not clocked out yet. */
      stillWorking: boolean;
    }
  | { id: string; category: 'inventory'; severity: 'warning'; shortageCount: number; topItems: readonly AttentionInventoryItemInput[] };

const INVENTORY_QUEUE_ITEM_PREVIEW_COUNT = 3;

export interface BuildManagerAttentionQueueInput {
  pendingCorrections: readonly AttentionCorrectionQueueInput[];
  pendingExchanges: readonly AttentionExchangeQueueInput[];
  /** Raw open issues -- filtered/classified here by `classifyIssueForAttention`, the same rule the counts use. Omit when the module is disabled. */
  openIssues?: readonly AttentionIssueInput[];
  /** Raw open Operations exceptions. Omit when the module is disabled. */
  openOperationsExceptions?: readonly AttentionOperationsExceptionInput[];
  unavailableConflicts: readonly AttentionConflictQueueInput[];
  /** QA4 F11-C: output of `computeClockInWithoutShift`. Omit for none. */
  clockInsWithoutShift?: readonly ClockInWithoutShiftRecord[];
  /** Already filtered to `status === 'shortage'` by the caller -- this builder does not re-derive Inventory's own shortage rule. */
  inventoryShortageItems: readonly AttentionInventoryItemInput[];
}

/**
 * Level-3 concrete "who/what/when" items behind the Level-1/2 counts --
 * derives presentation only, no new business state. Ordering is fixed:
 * action-required categories (correction, then exchange), then the
 * mixed-severity issue/operations items (each carrying its own severity,
 * action-required first), before warning categories (unavailable-conflict,
 * then clock-in-without-shift, then inventory); each category's own
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
    items.push({ id: `exchange:${e.exchangeId}`, category: 'exchange', severity: 'action_required', exchangeId: e.exchangeId, employeeId: e.employeeId, workDate: e.workDate, canApprove: e.canApprove, ...(e.requestKind ? { requestKind: e.requestKind } : {}) });
  }

  const severityRank = (s: ManagerAttentionSeverity) => (s === 'action_required' ? 0 : 1);
  const openExceptions = input.openOperationsExceptions ?? [];
  const openExceptionIds = new Set(openExceptions.map((e) => e.exceptionId));

  const issues: { issue: AttentionIssueInput; severity: ManagerAttentionSeverity }[] = [];
  for (const issue of input.openIssues ?? []) {
    const severity = classifyIssueForAttention(issue, openExceptionIds);
    if (severity) issues.push({ issue, severity });
  }
  issues.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.issue.businessDate.localeCompare(b.issue.businessDate) ||
      a.issue.issueId.localeCompare(b.issue.issueId),
  );
  for (const { issue, severity } of issues) {
    items.push({ id: `issue:${issue.issueId}`, category: 'issue', severity, issueId: issue.issueId, businessDate: issue.businessDate, note: issue.note });
  }

  const exceptionSeverity = (e: AttentionOperationsExceptionInput): ManagerAttentionSeverity =>
    e.severity === 'action_required' ? 'action_required' : 'warning';
  // UX review (PR #584): one row per task+source+severity group with a
  // count -- the same grouping the Operations popup's `AttentionSection`
  // uses -- never a wall of identical rows (e.g. 14 repeated
  // `critical_missed` events for one task). Newest exception first within a
  // group; groups ordered action-required first, then by newest exception.
  const newestFirst = [...openExceptions].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.exceptionId.localeCompare(b.exceptionId),
  );
  const groups = new Map<string, { first: AttentionOperationsExceptionInput; count: number }>();
  for (const e of newestFirst) {
    const groupKey = `${e.templateName ?? ''}|${e.source}|${exceptionSeverity(e)}`;
    const existing = groups.get(groupKey);
    if (existing) existing.count += 1;
    else groups.set(groupKey, { first: e, count: 1 });
  }
  const sortedGroups = [...groups.entries()].sort(
    ([, a], [, b]) =>
      severityRank(exceptionSeverity(a.first)) - severityRank(exceptionSeverity(b.first)) ||
      b.first.createdAt.localeCompare(a.first.createdAt),
  );
  for (const [groupKey, group] of sortedGroups) {
    items.push({
      id: `operations:${groupKey}`,
      category: 'operations',
      severity: exceptionSeverity(group.first),
      groupKey,
      templateName: group.first.templateName,
      source: group.first.source,
      count: group.count,
      latestBusinessDate: group.first.businessDate,
    });
  }

  const conflicts = [...input.unavailableConflicts].sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.employeeId.localeCompare(b.employeeId),
  );
  for (const c of conflicts) {
    items.push({ id: `conflict:${c.employeeId}:${c.workDate}`, category: 'unavailable_conflict', severity: 'warning', employeeId: c.employeeId, workDate: c.workDate });
  }

  const offShiftClockIns = [...(input.clockInsWithoutShift ?? [])].sort(
    (a, b) => a.workDate.localeCompare(b.workDate) || a.clockIn.localeCompare(b.clockIn) || a.attendanceId.localeCompare(b.attendanceId),
  );
  for (const r of offShiftClockIns) {
    items.push({
      id: `clock_in_without_shift:${r.attendanceId}`,
      category: 'clock_in_without_shift',
      severity: 'warning',
      attendanceId: r.attendanceId,
      employeeId: r.employeeId,
      workDate: r.workDate,
      clockIn: r.clockIn,
      stillWorking: r.stillWorking,
    });
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

/** Minimal attendance shape `computeClockInWithoutShift` needs. */
export interface ClockInWithoutShiftAttendanceInput {
  attendanceId: string;
  employeeId: string;
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
}

/** Minimal shift shape: the employee and the LOCAL dates the shift starts and ends on (already time-zone resolved by the caller). */
export interface ClockInWithoutShiftAssignmentInput {
  employeeId: string | null;
  startWorkDate: string;
  endWorkDate: string;
}

export interface ClockInWithoutShiftRecord {
  attendanceId: string;
  employeeId: string;
  workDate: string;
  clockIn: string;
  stillWorking: boolean;
}

/** How many days back a still-open (not clocked out) past clock-in is still flagged -- the Manager page preloads shifts for at least this window. */
export const CLOCK_IN_WITHOUT_SHIFT_OPEN_LOOKBACK_DAYS = 7;

function isoDaysBefore(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - days)).toISOString().slice(0, 10);
}

/**
 * QA4 F11-C 「シフト外の出勤」: attendance rows with a clock-in where that
 * staff member has no shift (draft or published) touching that work date --
 * a shift counts when it starts or ends on that local date (an overnight
 * shift covers both days). Considered rows: every clock-in of `todayIso`,
 * plus past clock-ins that are still open (no clock-out) within
 * `CLOCK_IN_WITHOUT_SHIFT_OPEN_LOOKBACK_DAYS`. Closed past days are history,
 * not something to act on now. Pure -- the caller passes data the Manager
 * page already loads (attendance + the preloaded shift window).
 */
export function computeClockInWithoutShift(
  attendance: readonly ClockInWithoutShiftAttendanceInput[],
  assignments: readonly ClockInWithoutShiftAssignmentInput[],
  todayIso: string,
): ClockInWithoutShiftRecord[] {
  const shiftDays = new Set<string>();
  for (const a of assignments) {
    if (!a.employeeId) continue;
    shiftDays.add(`${a.employeeId}:${a.startWorkDate}`);
    shiftDays.add(`${a.employeeId}:${a.endWorkDate}`);
  }
  const oldestOpenDate = isoDaysBefore(todayIso, CLOCK_IN_WITHOUT_SHIFT_OPEN_LOOKBACK_DAYS);
  const records: ClockInWithoutShiftRecord[] = [];
  for (const row of attendance) {
    if (!row.clockIn) continue;
    const isToday = row.workDate === todayIso;
    const isOpenRecentPast = !row.clockOut && row.workDate < todayIso && row.workDate >= oldestOpenDate;
    if (!isToday && !isOpenRecentPast) continue;
    if (shiftDays.has(`${row.employeeId}:${row.workDate}`)) continue;
    records.push({ attendanceId: row.attendanceId, employeeId: row.employeeId, workDate: row.workDate, clockIn: row.clockIn, stillWorking: !row.clockOut });
  }
  return records;
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
