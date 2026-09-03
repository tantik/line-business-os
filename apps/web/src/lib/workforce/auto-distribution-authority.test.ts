import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthoritativeStaffingRequirements,
  hasPositiveStaffingRequirement,
} from './auto-distribution-authority.js';
import type { WindowCode } from './auto-distribute.js';

test('no active windows -> empty requirement set (regardless of settings)', () => {
  assert.deepEqual(buildAuthoritativeStaffingRequirements([], [1, 2, 3, 4, 5, 6, 7]), []);
  assert.deepEqual(buildAuthoritativeStaffingRequirements([], null), []);
});

test('null / undefined settings -> one all-zero row per (weekday x window)', () => {
  const windows: WindowCode[] = ['AM', 'PM'];
  for (const settings of [null, undefined]) {
    const rows = buildAuthoritativeStaffingRequirements(windows, settings);
    assert.equal(rows.length, 14);
    assert.ok(rows.every((r) => r.requiredHeadcount === 0));
    assert.ok(rows.every((r) => r.workDate === undefined));
  }
});

test('emits that weekday\'s configured headcount for every active window', () => {
  const rows = buildAuthoritativeStaffingRequirements(['AM', 'PM'], [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rows.length, 14);
  for (const row of rows) {
    assert.equal(row.requiredHeadcount, row.weekday);
  }
  // both windows present for a given weekday
  const wednesday = rows.filter((r) => r.weekday === 3).map((r) => r.windowCode).sort();
  assert.deepEqual(wednesday, ['AM', 'PM']);
});

test('deterministic ordering: weekday ascending, windows in the passed order', () => {
  const windows: WindowCode[] = ['ALL', 'AM', 'PM'];
  const rows = buildAuthoritativeStaffingRequirements(windows, [1, 1, 1, 1, 1, 1, 1]);
  const shape = rows.map((r) => `${r.weekday}:${r.windowCode}`);
  assert.equal(shape[0], '0:ALL');
  assert.equal(shape[1], '0:AM');
  assert.equal(shape[2], '0:PM');
  assert.equal(shape[3], '1:ALL');
  assert.equal(shape[shape.length - 1], '6:PM');
});

test('a short settings array falls back to 0 for the missing weekdays, never undefined', () => {
  const rows = buildAuthoritativeStaffingRequirements(['AM'], [2, 2]);
  assert.equal(rows.length, 7);
  assert.equal(rows[0]?.requiredHeadcount, 2);
  assert.equal(rows[2]?.requiredHeadcount, 0);
  assert.ok(rows.every((r) => typeof r.requiredHeadcount === 'number'));
});

test('hasPositiveStaffingRequirement is false for empty / all-zero, true once any window needs someone', () => {
  assert.equal(hasPositiveStaffingRequirement([]), false);
  assert.equal(hasPositiveStaffingRequirement(buildAuthoritativeStaffingRequirements(['AM'], null)), false);
  assert.equal(hasPositiveStaffingRequirement(buildAuthoritativeStaffingRequirements(['AM'], [0, 0, 1, 0, 0, 0, 0])), true);
});
