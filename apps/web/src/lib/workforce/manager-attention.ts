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
