import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeManagerAttention } from './manager-attention.js';

test('computeManagerAttention returns an empty list when nothing needs action (the calm state)', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 0,
    pendingExchangeCount: 0,
    inventoryShortageCount: 0,
  });
  assert.deepEqual(items, []);
});

test('computeManagerAttention omits inventory entirely when the count is null (module disabled or read failed), never shows it as zero', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 0,
    pendingExchangeCount: 0,
    inventoryShortageCount: null,
  });
  assert.deepEqual(items, []);
});

test('computeManagerAttention includes only categories with a positive count', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 2,
    pendingExchangeCount: 0,
    inventoryShortageCount: 0,
  });
  assert.deepEqual(items, [{ category: 'correction', count: 2 }]);
});

test('computeManagerAttention orders decision-needed items (correction, exchange) before operational items (inventory)', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 1,
    pendingExchangeCount: 1,
    inventoryShortageCount: 5,
  });
  assert.deepEqual(items, [
    { category: 'correction', count: 1 },
    { category: 'exchange', count: 1 },
    { category: 'inventory', count: 5 },
  ]);
});

test('computeManagerAttention carries the exact counts through unchanged', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 3,
    pendingExchangeCount: 7,
    inventoryShortageCount: 12,
  });
  assert.equal(items.find((i) => i.category === 'correction')?.count, 3);
  assert.equal(items.find((i) => i.category === 'exchange')?.count, 7);
  assert.equal(items.find((i) => i.category === 'inventory')?.count, 12);
});
