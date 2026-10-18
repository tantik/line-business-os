import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withReporterNames, type Issue } from './issues';

function issue(overrides: Partial<Issue>): Issue {
  return {
    issueId: 'i1',
    tenantId: 't1',
    locationId: 'l1',
    kind: 'issue',
    category: null,
    severity: null,
    status: 'open',
    note: 'note',
    businessDate: '2026-10-18',
    reportedBy: 'u1',
    reportedByRole: 'staff',
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    source: 'manual',
    operationsExceptionId: null,
    createdAt: '2026-10-18T00:00:00Z',
    updatedAt: '2026-10-18T00:00:00Z',
    reporterEmployeeId: null,
    reporterName: null,
    ...overrides,
  };
}

test('withReporterNames fills the name for a known reporter employee id', () => {
  const [result] = withReporterNames([issue({ reporterEmployeeId: 'e1' })], new Map([['e1', '田中 美咲']]));
  assert.equal(result?.reporterName, '田中 美咲');
});

test('withReporterNames keeps null (role-label fallback) for an unknown or missing reporter id', () => {
  const names = new Map([['e1', '田中 美咲']]);
  const [unknown, missing] = withReporterNames([issue({ reporterEmployeeId: 'e9' }), issue({ issueId: 'i2', reporterEmployeeId: null })], names);
  assert.equal(unknown?.reporterName, null);
  assert.equal(missing?.reporterName, null);
});

test('withReporterNames does not mutate its input', () => {
  const input = [issue({ reporterEmployeeId: 'e1' })];
  withReporterNames(input, new Map([['e1', 'A']]));
  assert.equal(input[0]?.reporterName, null);
});
