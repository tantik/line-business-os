import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthoritativeStaffingRequirements,
  hasPositiveStaffingRequirement,
} from './auto-distribution-authority.js';

test('no active shift types -> empty requirement set (regardless of settings)', () => {
  assert.deepEqual(buildAuthoritativeStaffingRequirements([], [1, 2, 3, 4, 5, 6, 7]), []);
  assert.deepEqual(buildAuthoritativeStaffingRequirements([], null), []);
});

test('null / undefined settings -> one all-zero row per (weekday x shift type)', () => {
  const shiftTypeIds = ['st-am', 'st-pm'];
  for (const settings of [null, undefined]) {
    const rows = buildAuthoritativeStaffingRequirements(shiftTypeIds, settings);
    assert.equal(rows.length, 14);
    assert.ok(rows.every((r) => r.requiredHeadcount === 0));
    assert.ok(rows.every((r) => r.workDate === undefined));
  }
});

test('emits that weekday\'s configured headcount for every active shift type -- including Manager-created CUSTOM_* ones', () => {
  const shiftTypeIds = ['st-am', 'ct-custom-created-by-manager'];
  const rows = buildAuthoritativeStaffingRequirements(shiftTypeIds, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rows.length, 14);
  for (const row of rows) {
    assert.equal(row.requiredHeadcount, row.weekday);
  }
  // both shift types present for a given weekday
  const wednesday = rows.filter((r) => r.weekday === 3).map((r) => r.shiftTypeId).sort();
  assert.deepEqual(wednesday, ['ct-custom-created-by-manager', 'st-am']);
});

test('deterministic ordering: weekday ascending, shift types in the passed order', () => {
  const shiftTypeIds = ['st-all', 'st-am', 'st-pm'];
  const rows = buildAuthoritativeStaffingRequirements(shiftTypeIds, [1, 1, 1, 1, 1, 1, 1]);
  const shape = rows.map((r) => `${r.weekday}:${r.shiftTypeId}`);
  assert.equal(shape[0], '0:st-all');
  assert.equal(shape[1], '0:st-am');
  assert.equal(shape[2], '0:st-pm');
  assert.equal(shape[3], '1:st-all');
  assert.equal(shape[shape.length - 1], '6:st-pm');
});

test('a short settings array falls back to 0 for the missing weekdays, never undefined', () => {
  const rows = buildAuthoritativeStaffingRequirements(['st-am'], [2, 2]);
  assert.equal(rows.length, 7);
  assert.equal(rows[0]?.requiredHeadcount, 2);
  assert.equal(rows[2]?.requiredHeadcount, 0);
  assert.ok(rows.every((r) => typeof r.requiredHeadcount === 'number'));
});

test('hasPositiveStaffingRequirement is false for empty / all-zero, true once any shift type needs someone', () => {
  assert.equal(hasPositiveStaffingRequirement([]), false);
  assert.equal(hasPositiveStaffingRequirement(buildAuthoritativeStaffingRequirements(['st-am'], null)), false);
  assert.equal(hasPositiveStaffingRequirement(buildAuthoritativeStaffingRequirements(['st-am'], [0, 0, 1, 0, 0, 0, 0])), true);
});
