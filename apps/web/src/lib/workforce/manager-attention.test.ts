import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeManagerAttention, computeUnavailableConflictCellKeys } from './manager-attention.js';

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
