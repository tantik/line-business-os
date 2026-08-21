import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeManagerAttention,
  computeManagerAttentionSummary,
  computeUnavailableConflictCellKeys,
  computeUnavailableConflictRecords,
  computePendingCorrectionCellKeys,
  computeUnderstaffedDateKeys,
  buildManagerAttentionQueue,
} from './manager-attention.js';

test('computeManagerAttention returns an empty list when nothing needs action (the calm state)', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 0,
    pendingExchangeCount: 0,
    unavailableConflictCount: 0,
    inventoryShortageCount: 0,
  });
  assert.deepEqual(items, []);
});

test('computeManagerAttention omits inventory entirely when the count is null (module disabled or read failed), never shows it as zero', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 0,
    pendingExchangeCount: 0,
    unavailableConflictCount: 0,
    inventoryShortageCount: null,
  });
  assert.deepEqual(items, []);
});

test('computeManagerAttention includes only categories with a positive count', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 2,
    pendingExchangeCount: 0,
    unavailableConflictCount: 0,
    inventoryShortageCount: 0,
  });
  assert.deepEqual(items, [{ category: 'correction', count: 2 }]);
});

test('computeManagerAttention orders decision-needed items (correction, exchange), then unavailable-conflict, before operational items (inventory)', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 1,
    pendingExchangeCount: 1,
    unavailableConflictCount: 2,
    inventoryShortageCount: 5,
  });
  assert.deepEqual(items, [
    { category: 'correction', count: 1 },
    { category: 'exchange', count: 1 },
    { category: 'unavailable_conflict', count: 2 },
    { category: 'inventory', count: 5 },
  ]);
});

test('computeManagerAttention carries the exact counts through unchanged', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 3,
    pendingExchangeCount: 7,
    unavailableConflictCount: 4,
    inventoryShortageCount: 12,
  });
  assert.equal(items.find((i) => i.category === 'correction')?.count, 3);
  assert.equal(items.find((i) => i.category === 'exchange')?.count, 7);
  assert.equal(items.find((i) => i.category === 'unavailable_conflict')?.count, 4);
  assert.equal(items.find((i) => i.category === 'inventory')?.count, 12);
});

test('computeUnavailableConflictCellKeys flags an employee/date with both an Unavailable preference and an assigned shift', () => {
  const keys = computeUnavailableConflictCellKeys(
    [{ employeeId: 'emp-1', workDate: '2026-08-17', kind: 'preference', isUnavailable: true }],
    [{ employeeId: 'emp-1', workDate: '2026-08-17' }],
  );
  assert.deepEqual([...keys], ['emp-1:2026-08-17']);
});

test('computeUnavailableConflictCellKeys ignores a non-unavailable preference and a correction-kind request', () => {
  const keys = computeUnavailableConflictCellKeys(
    [
      { employeeId: 'emp-1', workDate: '2026-08-17', kind: 'preference', isUnavailable: false },
      { employeeId: 'emp-2', workDate: '2026-08-17', kind: 'correction', isUnavailable: true },
    ],
    [
      { employeeId: 'emp-1', workDate: '2026-08-17' },
      { employeeId: 'emp-2', workDate: '2026-08-17' },
    ],
  );
  assert.deepEqual([...keys], []);
});

test('computeUnavailableConflictCellKeys ignores an Unavailable preference with no assignment on that date, and an unassigned cell', () => {
  const keys = computeUnavailableConflictCellKeys(
    [{ employeeId: 'emp-1', workDate: '2026-08-17', kind: 'preference', isUnavailable: true }],
    [{ employeeId: null, workDate: '2026-08-17' }],
  );
  assert.deepEqual([...keys], []);
});

test('computeUnavailableConflictCellKeys does not cross-match different dates for the same employee', () => {
  const keys = computeUnavailableConflictCellKeys(
    [{ employeeId: 'emp-1', workDate: '2026-08-17', kind: 'preference', isUnavailable: true }],
    [{ employeeId: 'emp-1', workDate: '2026-08-18' }],
  );
  assert.deepEqual([...keys], []);
});

test('computePendingCorrectionCellKeys flags a pending correction on a past day', () => {
  const keys = computePendingCorrectionCellKeys(
    [{ employeeId: 'emp-1', workDate: '2026-08-17' }],
    '2026-08-20',
  );
  assert.deepEqual([...keys], ['emp-1:2026-08-17']);
});

test('computePendingCorrectionCellKeys ignores a pending correction on today or a future day', () => {
  const keys = computePendingCorrectionCellKeys(
    [
      { employeeId: 'emp-1', workDate: '2026-08-20' },
      { employeeId: 'emp-2', workDate: '2026-08-21' },
    ],
    '2026-08-20',
  );
  assert.deepEqual([...keys], []);
});

test('computeUnderstaffedDateKeys flags a date whose assigned headcount is below that weekday\'s required count', () => {
  // 2026-08-17 is a Monday -> Monday-first index 0.
  const keys = computeUnderstaffedDateKeys(
    ['2026-08-17'],
    [2, 1, 1, 1, 1, 1, 1],
    ['emp-1:2026-08-17'].map(() => '2026-08-17'),
  );
  assert.deepEqual([...keys], ['2026-08-17']);
});

test('computeUnderstaffedDateKeys does not flag a date meeting or exceeding its required headcount', () => {
  const keys = computeUnderstaffedDateKeys(
    ['2026-08-17'],
    [1, 1, 1, 1, 1, 1, 1],
    ['2026-08-17', '2026-08-17'],
  );
  assert.deepEqual([...keys], []);
});

test('computeUnderstaffedDateKeys defaults to requiring 1/day when no Settings row has been saved (null)', () => {
  const keys = computeUnderstaffedDateKeys(['2026-08-17'], null, []);
  assert.deepEqual([...keys], ['2026-08-17']);
});

test('computeUnderstaffedDateKeys maps Sunday to the last (index 6) requirement slot, not index 0', () => {
  // 2026-08-16 is a Sunday.
  const keys = computeUnderstaffedDateKeys(['2026-08-16'], [1, 1, 1, 1, 1, 1, 0], []);
  assert.deepEqual([...keys], []);
});

test('computeManagerAttentionSummary counts correction+exchange as action-required, unavailable_conflict+inventory as warnings', () => {
  const summary = computeManagerAttentionSummary([
    { category: 'correction', count: 2 },
    { category: 'exchange', count: 1 },
    { category: 'unavailable_conflict', count: 2 },
    { category: 'inventory', count: 3 },
  ]);
  assert.deepEqual(summary, { total: 8, actionRequiredCount: 3, warningCount: 5 });
});

test('computeManagerAttentionSummary is empty for the calm state', () => {
  assert.deepEqual(computeManagerAttentionSummary([]), { total: 0, actionRequiredCount: 0, warningCount: 0 });
});

test('computeUnavailableConflictRecords splits the same keys computeUnavailableConflictCellKeys flags into employeeId/workDate parts', () => {
  const records = computeUnavailableConflictRecords(
    [{ employeeId: 'emp-1', workDate: '2026-08-17', kind: 'preference', isUnavailable: true }],
    [{ employeeId: 'emp-1', workDate: '2026-08-17' }],
  );
  assert.deepEqual(records, [{ employeeId: 'emp-1', workDate: '2026-08-17' }]);
});

test('buildManagerAttentionQueue orders action-required categories (correction, exchange) before warning categories (conflict, inventory)', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [{ requestId: 'req-1', employeeId: 'emp-1', workDate: '2026-08-20' }],
    pendingExchanges: [{ exchangeId: 'exc-1', employeeId: 'emp-2', workDate: '2026-08-21', canApprove: true }],
    unavailableConflicts: [{ employeeId: 'emp-3', workDate: '2026-08-22' }],
    inventoryShortageItems: [{ itemId: 'item-1', name: 'Milk', actualQuantity: 2, requiredQuantity: 10 }],
  });
  assert.deepEqual(
    items.map((i) => i.category),
    ['correction', 'exchange', 'unavailable_conflict', 'inventory'],
  );
});

test('buildManagerAttentionQueue sorts items within a category by workDate ascending, deterministically regardless of input order', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [
      { requestId: 'req-2', employeeId: 'emp-2', workDate: '2026-08-22' },
      { requestId: 'req-1', employeeId: 'emp-1', workDate: '2026-08-20' },
    ],
    pendingExchanges: [],
    unavailableConflicts: [],
    inventoryShortageItems: [],
  });
  assert.deepEqual(
    items.map((i) => (i.category === 'correction' ? i.requestId : null)),
    ['req-1', 'req-2'],
  );
});

test('buildManagerAttentionQueue collapses inventory shortages into one queue item, capped at 3 topItems', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [],
    pendingExchanges: [],
    unavailableConflicts: [],
    inventoryShortageItems: [
      { itemId: 'item-4', name: 'Cups', actualQuantity: 20, requiredQuantity: 100 },
      { itemId: 'item-1', name: 'Coffee beans', actualQuantity: 1, requiredQuantity: 5 },
      { itemId: 'item-2', name: 'Milk', actualQuantity: 2, requiredQuantity: 10 },
      { itemId: 'item-3', name: 'Sugar', actualQuantity: 0, requiredQuantity: 5 },
    ],
  });
  assert.equal(items.length, 1);
  const inventoryItem = items[0];
  assert.ok(inventoryItem);
  if (inventoryItem.category !== 'inventory') throw new Error('expected inventory item');
  assert.equal(inventoryItem.shortageCount, 4);
  assert.deepEqual(
    inventoryItem.topItems.map((i: { name: string }) => i.name),
    ['Coffee beans', 'Cups', 'Milk'],
  );
});

test('buildManagerAttentionQueue omits inventory entirely when there are no shortages, does not fabricate a zero-count item', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [],
    pendingExchanges: [],
    unavailableConflicts: [],
    inventoryShortageItems: [],
  });
  assert.deepEqual(items, []);
});

test('buildManagerAttentionQueue carries through the exchange canApprove disabled-reason flag unchanged', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [],
    pendingExchanges: [{ exchangeId: 'exc-1', employeeId: 'emp-1', workDate: '2026-08-20', canApprove: false }],
    unavailableConflicts: [],
    inventoryShortageItems: [],
  });
  const exchangeItem = items[0];
  assert.ok(exchangeItem);
  if (exchangeItem.category !== 'exchange') throw new Error('expected exchange item');
  assert.equal(exchangeItem.canApprove, false);
});
