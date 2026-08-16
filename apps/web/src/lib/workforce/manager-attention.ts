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

export type ManagerAttentionCategory = 'correction' | 'exchange' | 'inventory';

export interface ManagerAttentionItem {
  category: ManagerAttentionCategory;
  count: number;
}

export interface ManagerAttentionInput {
  pendingCorrectionCount: number;
  pendingExchangeCount: number;
  /** `null` when Inventory is not enabled for this tenant, or its read failed -- omitted from the result, not shown as zero. */
  inventoryShortageCount: number | null;
}

/** Order is fixed and deliberate: Manager-decision items (someone is waiting on a yes/no) before operational/stock items. */
export function computeManagerAttention(input: ManagerAttentionInput): ManagerAttentionItem[] {
  const items: ManagerAttentionItem[] = [];
  if (input.pendingCorrectionCount > 0) {
    items.push({ category: 'correction', count: input.pendingCorrectionCount });
  }
  if (input.pendingExchangeCount > 0) {
    items.push({ category: 'exchange', count: input.pendingExchangeCount });
  }
  if (input.inventoryShortageCount !== null && input.inventoryShortageCount > 0) {
    items.push({ category: 'inventory', count: input.inventoryShortageCount });
  }
  return items;
}
