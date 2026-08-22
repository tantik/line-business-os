import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShiftExchangeCandidates } from './shift-exchange-candidates.js';

const OFFERED = { startsAt: '2026-08-24T04:00:00.000Z', endsAt: '2026-08-24T08:00:00.000Z', workDate: '2026-08-24' };

test('computeShiftExchangeCandidates excludes the requester and inactive employees', () => {
  const candidates = computeShiftExchangeCandidates(
    [
      { employeeId: 'requester', name: 'Requester', isActive: true },
      { employeeId: 'inactive', name: 'Inactive', isActive: false },
      { employeeId: 'eligible', name: 'Eligible', isActive: true },
    ],
    'requester',
    OFFERED,
    [],
    [],
  );
  assert.deepEqual(candidates.map((c) => c.employeeId), ['eligible']);
});

test('computeShiftExchangeCandidates flags a candidate with an overlapping published shift, not an unpublished or non-overlapping one', () => {
  const candidates = computeShiftExchangeCandidates(
    [
      { employeeId: 'overlapping', name: 'Overlapping', isActive: true },
      { employeeId: 'draft-only', name: 'Draft Only', isActive: true },
      { employeeId: 'no-overlap', name: 'No Overlap', isActive: true },
    ],
    'requester',
    OFFERED,
    [
      { employeeId: 'overlapping', startsAt: '2026-08-24T06:00:00.000Z', endsAt: '2026-08-24T10:00:00.000Z', published: true },
      { employeeId: 'draft-only', startsAt: '2026-08-24T05:00:00.000Z', endsAt: '2026-08-24T07:00:00.000Z', published: false },
      { employeeId: 'no-overlap', startsAt: '2026-08-24T08:00:00.000Z', endsAt: '2026-08-24T12:00:00.000Z', published: true },
    ],
    [],
  );
  assert.equal(candidates.find((c) => c.employeeId === 'overlapping')?.warning, 'schedule_conflict');
  assert.equal(candidates.find((c) => c.employeeId === 'draft-only')?.warning, null);
  assert.equal(candidates.find((c) => c.employeeId === 'no-overlap')?.warning, null);
});

test('computeShiftExchangeCandidates flags a candidate who marked the offered date Unavailable as a non-blocking warning, not schedule_conflict', () => {
  const candidates = computeShiftExchangeCandidates(
    [{ employeeId: 'unavailable', name: 'Unavailable', isActive: true }],
    'requester',
    OFFERED,
    [],
    [{ employeeId: 'unavailable', workDate: '2026-08-24', kind: 'preference', isUnavailable: true }],
  );
  assert.equal(candidates[0]?.warning, 'marked_unavailable');
});

test('computeShiftExchangeCandidates ignores an Unavailable preference for a different date and a non-preference/non-unavailable request', () => {
  const candidates = computeShiftExchangeCandidates(
    [
      { employeeId: 'diff-date', name: 'Diff Date', isActive: true },
      { employeeId: 'available-pref', name: 'Available Pref', isActive: true },
    ],
    'requester',
    OFFERED,
    [],
    [
      { employeeId: 'diff-date', workDate: '2026-08-25', kind: 'preference', isUnavailable: true },
      { employeeId: 'available-pref', workDate: '2026-08-24', kind: 'preference', isUnavailable: false },
    ],
  );
  assert.equal(candidates.find((c) => c.employeeId === 'diff-date')?.warning, null);
  assert.equal(candidates.find((c) => c.employeeId === 'available-pref')?.warning, null);
});

test('computeShiftExchangeCandidates prioritizes schedule_conflict over marked_unavailable when both apply', () => {
  const candidates = computeShiftExchangeCandidates(
    [{ employeeId: 'both', name: 'Both', isActive: true }],
    'requester',
    OFFERED,
    [{ employeeId: 'both', startsAt: '2026-08-24T05:00:00.000Z', endsAt: '2026-08-24T09:00:00.000Z', published: true }],
    [{ employeeId: 'both', workDate: '2026-08-24', kind: 'preference', isUnavailable: true }],
  );
  assert.equal(candidates[0]?.warning, 'schedule_conflict');
});

test('computeShiftExchangeCandidates sorts by name', () => {
  const candidates = computeShiftExchangeCandidates(
    [
      { employeeId: 'b', name: 'Bravo', isActive: true },
      { employeeId: 'a', name: 'Alpha', isActive: true },
    ],
    'requester',
    OFFERED,
    [],
    [],
  );
  assert.deepEqual(candidates.map((c) => c.name), ['Alpha', 'Bravo']);
});

test('computeShiftExchangeCandidates ignores an unassigned assignment row (employeeId null)', () => {
  const candidates = computeShiftExchangeCandidates(
    [{ employeeId: 'a', name: 'Alpha', isActive: true }],
    'requester',
    OFFERED,
    [{ employeeId: null, startsAt: '2026-08-24T04:00:00.000Z', endsAt: '2026-08-24T08:00:00.000Z', published: true }],
    [],
  );
  assert.equal(candidates[0]?.warning, null);
});
