import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManagerAttentionQueue } from './manager-attention.js';

/** DEBT-119 f: the queue row names the request kind, so a cancel is never shown as an exchange. */
test('buildManagerAttentionQueue passes each shift request kind through; omitted kind stays absent', () => {
  const items = buildManagerAttentionQueue({
    pendingCorrections: [],
    pendingExchanges: [
      { exchangeId: 'x-cancel', employeeId: 'e1', workDate: '2026-10-01', canApprove: true, requestKind: 'cancel' },
      { exchangeId: 'x-exchange', employeeId: 'e2', workDate: '2026-10-02', canApprove: false, requestKind: 'exchange' },
      { exchangeId: 'x-legacy', employeeId: 'e3', workDate: '2026-10-03', canApprove: true },
    ],
    unavailableConflicts: [],
    inventoryShortageItems: [],
  });
  const kinds = items.map((i) => (i.category === 'exchange' ? [i.exchangeId, i.requestKind ?? null] : null));
  assert.deepEqual(kinds, [
    ['x-cancel', 'cancel'],
    ['x-exchange', 'exchange'],
    ['x-legacy', null],
  ]);
  assert.equal('requestKind' in items[2]!, false);
});
