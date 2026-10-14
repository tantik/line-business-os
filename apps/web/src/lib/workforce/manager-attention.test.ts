import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeManagerAttention,
  computeManagerAttentionSummary,
  computeUnavailableConflictCellKeys,
  computeUnavailableConflictRecords,
  computePendingCorrectionCellKeys,
  computeDailyStaffingCoverage,
  buildManagerAttentionQueue,
  classifyIssueForAttention,
  countOpenIssuesForAttention,
  countOpenOperationsExceptionsForAttention,
  type AttentionIssueInput,
  type AttentionOperationsExceptionInput,
} from './manager-attention.js';

function issue(overrides: Partial<AttentionIssueInput> & { issueId: string }): AttentionIssueInput {
  return { kind: 'issue', severity: 'normal', status: 'open', businessDate: '2026-10-14', note: '', operationsExceptionId: null, ...overrides };
}

function exception(overrides: Partial<AttentionOperationsExceptionInput> & { exceptionId: string }): AttentionOperationsExceptionInput {
  return { severity: 'action_required', source: 'critical_missed', businessDate: '2026-10-14', templateName: 'Opening', createdAt: '2026-10-14T00:00:00.000Z', ...overrides };
}

test('classifyIssueForAttention: open important issue is action-required, open normal/unset-severity issue is a notice', () => {
  assert.equal(classifyIssueForAttention(issue({ issueId: 'i1', severity: 'important' })), 'action_required');
  assert.equal(classifyIssueForAttention(issue({ issueId: 'i2', severity: 'normal' })), 'warning');
  assert.equal(classifyIssueForAttention(issue({ issueId: 'i3', severity: null })), 'warning');
});

test('classifyIssueForAttention ignores handovers, acknowledged and resolved issues', () => {
  assert.equal(classifyIssueForAttention(issue({ issueId: 'h1', kind: 'handover', severity: 'important' })), null);
  assert.equal(classifyIssueForAttention(issue({ issueId: 'a1', status: 'acknowledged', severity: 'important' })), null);
  assert.equal(classifyIssueForAttention(issue({ issueId: 'r1', status: 'resolved', severity: 'important' })), null);
});

test('classifyIssueForAttention skips an issue linked to a still-open Operations exception (no double count)', () => {
  const linked = issue({ issueId: 'i1', severity: 'important', operationsExceptionId: 'ex-1' });
  assert.equal(classifyIssueForAttention(linked, new Set(['ex-1'])), null);
  assert.equal(classifyIssueForAttention(linked, new Set(['ex-2'])), 'action_required');
});

test('countOpenIssuesForAttention splits critical vs notice; null input (module off / read failed) stays null', () => {
  assert.equal(countOpenIssuesForAttention(null), null);
  assert.deepEqual(
    countOpenIssuesForAttention([
      issue({ issueId: 'i1', severity: 'important' }),
      issue({ issueId: 'i2', severity: 'normal' }),
      issue({ issueId: 'i3', severity: null }),
      issue({ issueId: 'h1', kind: 'handover' }),
      issue({ issueId: 'a1', status: 'acknowledged', severity: 'important' }),
    ]),
    { actionRequired: 1, notice: 2 },
  );
});

test('countOpenOperationsExceptionsForAttention uses each exception severity; null stays null', () => {
  assert.equal(countOpenOperationsExceptionsForAttention(null), null);
  assert.deepEqual(
    countOpenOperationsExceptionsForAttention([
      exception({ exceptionId: 'e1', severity: 'action_required' }),
      exception({ exceptionId: 'e2', severity: 'action_required' }),
      exception({ exceptionId: 'e3', severity: 'warning' }),
    ]),
    { actionRequired: 2, notice: 1 },
  );
});

test('computeManagerAttention adds issue and operations categories after exchange, with their action-required split', () => {
  const items = computeManagerAttention({
    pendingCorrectionCount: 1,
    pendingExchangeCount: 1,
    openIssueCounts: { actionRequired: 1, notice: 2 },
    openOperationsExceptionCounts: { actionRequired: 2, notice: 0 },
    unavailableConflictCount: 1,
    inventoryShortageCount: 1,
  });
  assert.deepEqual(items, [
    { category: 'correction', count: 1 },
    { category: 'exchange', count: 1 },
    { category: 'issue', count: 3, actionRequiredCount: 1 },
    { category: 'operations', count: 2, actionRequiredCount: 2 },
    { category: 'unavailable_conflict', count: 1 },
    { category: 'inventory', count: 1 },
  ]);
});

test('computeManagerAttention omits issue/operations when null or zero (QA3 regression: a single important issue must appear)', () => {
  assert.deepEqual(
    computeManagerAttention({
      pendingCorrectionCount: 0,
      pendingExchangeCount: 0,
      openIssueCounts: null,
      openOperationsExceptionCounts: { actionRequired: 0, notice: 0 },
      unavailableConflictCount: 0,
      inventoryShortageCount: null,
    }),
    [],
  );
  const items = computeManagerAttention({
    pendingCorrectionCount: 0,
    pendingExchangeCount: 0,
    openIssueCounts: countOpenIssuesForAttention([issue({ issueId: 'i1', severity: 'important' })]),
    unavailableConflictCount: 0,
    inventoryShortageCount: null,
  });
  assert.deepEqual(items, [{ category: 'issue', count: 1, actionRequiredCount: 1 }]);
  assert.deepEqual(computeManagerAttentionSummary(items), { total: 1, actionRequiredCount: 1, warningCount: 0 });
});

test('computeManagerAttentionSummary splits mixed-severity issue/operations items into action-required and warnings', () => {
  const summary = computeManagerAttentionSummary([
    { category: 'correction', count: 1 },
    { category: 'issue', count: 3, actionRequiredCount: 1 },
    { category: 'operations', count: 2, actionRequiredCount: 1 },
    { category: 'inventory', count: 4 },
  ]);
  assert.deepEqual(summary, { total: 10, actionRequiredCount: 3, warningCount: 7 });
});

test('buildManagerAttentionQueue lists issue/operations items with per-item severity, consistent with the counts', () => {
  const openIssues = [
    issue({ issueId: 'i-normal', severity: 'normal', businessDate: '2026-10-10' }),
    issue({ issueId: 'i-critical', severity: 'important', businessDate: '2026-10-12' }),
    issue({ issueId: 'h1', kind: 'handover' }),
  ];
  const openOperationsExceptions = [
    exception({ exceptionId: 'e-warn', severity: 'warning', businessDate: '2026-10-01' }),
    exception({ exceptionId: 'e-act', severity: 'action_required', businessDate: '2026-10-13' }),
  ];
  const items = buildManagerAttentionQueue({
    pendingCorrections: [{ requestId: 'req-1', employeeId: 'emp-1', workDate: '2026-10-01' }],
    pendingExchanges: [],
    openIssues,
    openOperationsExceptions,
    unavailableConflicts: [{ employeeId: 'emp-3', workDate: '2026-10-02' }],
    inventoryShortageItems: [],
  });
  assert.deepEqual(
    items.map((i) => [i.id, i.severity]),
    [
      ['correction:req-1', 'action_required'],
      ['issue:i-critical', 'action_required'],
      ['issue:i-normal', 'warning'],
      ['operations:Opening|critical_missed|action_required', 'action_required'],
      ['operations:Opening|critical_missed|warning', 'warning'],
      ['conflict:emp-3:2026-10-02', 'warning'],
    ],
  );
  const issueCounts = countOpenIssuesForAttention(openIssues);
  const queueIssues = items.filter((i) => i.category === 'issue');
  assert.equal(queueIssues.length, (issueCounts?.actionRequired ?? 0) + (issueCounts?.notice ?? 0));
});

test('buildManagerAttentionQueue collapses Operations exceptions by task+source+severity (same key as the Operations popup), one row with a count and the newest date', () => {
  const repeated = Array.from({ length: 14 }, (_, i) =>
    exception({
      exceptionId: `e-${String(i).padStart(2, '0')}`,
      source: 'critical_missed',
      severity: 'action_required',
      templateName: 'Fridge check',
      businessDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
      createdAt: `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
    }),
  );
  const items = buildManagerAttentionQueue({
    pendingCorrections: [],
    pendingExchanges: [],
    openOperationsExceptions: [
      ...repeated,
      exception({ exceptionId: 'th-1', source: 'threshold', severity: 'warning', templateName: 'Fridge check', createdAt: '2026-10-20T00:00:00.000Z' }),
      exception({ exceptionId: 'ot-1', source: 'critical_missed', severity: 'action_required', templateName: 'Closing', createdAt: '2026-10-02T00:00:00.000Z' }),
    ],
    unavailableConflicts: [],
    inventoryShortageItems: [],
  });
  const ops = items.filter((i): i is Extract<typeof i, { category: 'operations' }> => i.category === 'operations');
  assert.deepEqual(
    ops.map((g) => [g.templateName, g.source, g.severity, g.count, g.latestBusinessDate]),
    [
      ['Fridge check', 'critical_missed', 'action_required', 14, '2026-10-14'],
      ['Closing', 'critical_missed', 'action_required', 1, '2026-10-14'],
      ['Fridge check', 'threshold', 'warning', 1, '2026-10-14'],
    ],
  );
  // Grouping is presentation only: the Level-1 count still counts every open exception.
  assert.deepEqual(
    countOpenOperationsExceptionsForAttention([...repeated]),
    { actionRequired: 14, notice: 0 },
  );
});

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

test('computeDailyStaffingCoverage reports required/scheduled/missing for a date below its required headcount', () => {
  // 2026-08-17 is a Monday -> Monday-first index 0.
  const coverage = computeDailyStaffingCoverage(
    ['2026-08-17'],
    [2, 1, 1, 1, 1, 1, 1],
    ['2026-08-17'],
  );
  assert.deepEqual(coverage, [{ workDate: '2026-08-17', required: 2, scheduled: 1, missing: 1 }]);
});

test('computeDailyStaffingCoverage reports missing: 0 for a date meeting or exceeding its required headcount', () => {
  const coverage = computeDailyStaffingCoverage(
    ['2026-08-17'],
    [1, 1, 1, 1, 1, 1, 1],
    ['2026-08-17', '2026-08-17'],
  );
  assert.deepEqual(coverage, [{ workDate: '2026-08-17', required: 1, scheduled: 2, missing: 0 }]);
});

test('computeDailyStaffingCoverage defaults to requiring 1/day when no Settings row has been saved (null)', () => {
  const coverage = computeDailyStaffingCoverage(['2026-08-17'], null, []);
  assert.deepEqual(coverage, [{ workDate: '2026-08-17', required: 1, scheduled: 0, missing: 1 }]);
});

test('computeDailyStaffingCoverage maps Sunday to the last (index 6) requirement slot, not index 0', () => {
  // 2026-08-16 is a Sunday.
  const coverage = computeDailyStaffingCoverage(['2026-08-16'], [1, 1, 1, 1, 1, 1, 0], []);
  assert.deepEqual(coverage, [{ workDate: '2026-08-16', required: 0, scheduled: 0, missing: 0 }]);
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
