import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaffingRequirements,
  hasPositiveHeadcount,
  rawInputHasPositiveRequirement,
  type StaffingRequirementRowInput,
} from './auto-distribution-requirements.js';

function row(overrides: Partial<StaffingRequirementRowInput> = {}): StaffingRequirementRowInput {
  return { workDate: '2026-01-05', windowCode: 'AM', requiredHeadcount: '2', ...overrides };
}

test('buildStaffingRequirements returns an empty array for an empty row list (never invents a default requirement)', () => {
  assert.deepEqual(buildStaffingRequirements([]), []);
});

test('buildStaffingRequirements maps a single valid row to the exact shape autoDistribute()/parseRunAutoDistributionInput expects', () => {
  const result = buildStaffingRequirements([row()]);
  assert.deepEqual(result, [{ workDate: '2026-01-05', windowCode: 'AM', requiredHeadcount: 2 }]);
});

test('buildStaffingRequirements drops a row with a blank windowCode (not yet chosen by the manager) rather than guessing one', () => {
  assert.deepEqual(buildStaffingRequirements([row({ windowCode: '' })]), []);
});

test('buildStaffingRequirements drops a row with an unrecognized windowCode', () => {
  assert.deepEqual(buildStaffingRequirements([row({ windowCode: 'NOT_A_WINDOW' })]), []);
});

test('buildStaffingRequirements accepts a lowercase windowCode and normalizes it to uppercase', () => {
  assert.deepEqual(buildStaffingRequirements([row({ windowCode: 'am' })]), [
    { workDate: '2026-01-05', windowCode: 'AM', requiredHeadcount: 2 },
  ]);
});

test('buildStaffingRequirements drops a row with a malformed date', () => {
  assert.deepEqual(buildStaffingRequirements([row({ workDate: 'not-a-date' })]), []);
  assert.deepEqual(buildStaffingRequirements([row({ workDate: '' })]), []);
});

test('buildStaffingRequirements drops a row with a syntactically-shaped but non-existent calendar date', () => {
  assert.deepEqual(buildStaffingRequirements([row({ workDate: '2026-02-30' })]), []);
});

test('buildStaffingRequirements drops a row with a negative, non-integer, or blank required headcount', () => {
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: '-1' })]), []);
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: '1.5' })]), []);
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: '' })]), []);
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: 'abc' })]), []);
});

test('buildStaffingRequirements accepts a zero required headcount (a legitimate "no one needed this window" rule)', () => {
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: '0' })]), [
    { workDate: '2026-01-05', windowCode: 'AM', requiredHeadcount: 0 },
  ]);
});

test('buildStaffingRequirements rejects a required headcount above the sanity cap', () => {
  assert.deepEqual(buildStaffingRequirements([row({ requiredHeadcount: '101' })]), []);
});

test('buildStaffingRequirements keeps only the valid rows out of a mixed valid/invalid batch', () => {
  const result = buildStaffingRequirements([row(), row({ windowCode: '' }), row({ workDate: '2026-01-06', windowCode: 'PM', requiredHeadcount: '1' })]);
  assert.deepEqual(result, [
    { workDate: '2026-01-05', windowCode: 'AM', requiredHeadcount: 2 },
    { workDate: '2026-01-06', windowCode: 'PM', requiredHeadcount: 1 },
  ]);
});

// ---------------------------------------------------------------------------
// hasPositiveHeadcount - the "not just non-empty, at least one real number" gate
// ---------------------------------------------------------------------------

test('hasPositiveHeadcount rejects an empty requirement set', () => {
  assert.equal(hasPositiveHeadcount([]), false);
});

test('hasPositiveHeadcount rejects a single zero-only requirement', () => {
  assert.equal(hasPositiveHeadcount([{ requiredHeadcount: 0 }]), false);
});

test('hasPositiveHeadcount rejects several zero-only requirements', () => {
  assert.equal(hasPositiveHeadcount([{ requiredHeadcount: 0 }, { requiredHeadcount: 0 }, { requiredHeadcount: 0 }]), false);
});

test('hasPositiveHeadcount accepts a mix of zero and positive requirements', () => {
  assert.equal(hasPositiveHeadcount([{ requiredHeadcount: 0 }, { requiredHeadcount: 3 }]), true);
});

test('hasPositiveHeadcount accepts a single positive requirement', () => {
  assert.equal(hasPositiveHeadcount([{ requiredHeadcount: 2 }]), true);
});

// ---------------------------------------------------------------------------
// rawInputHasPositiveRequirement - the raw, pre-tenant-resolution Server
// Action pre-check. Deliberately coarse (a `typeof === 'number'` scan, not
// full validation) - the authoritative check is `hasPositiveHeadcount` run
// after `parseRunAutoDistributionInput`.
// ---------------------------------------------------------------------------

test('rawInputHasPositiveRequirement rejects non-object input', () => {
  assert.equal(rawInputHasPositiveRequirement(null), false);
  assert.equal(rawInputHasPositiveRequirement(undefined), false);
  assert.equal(rawInputHasPositiveRequirement('not an object'), false);
  assert.equal(rawInputHasPositiveRequirement(42), false);
});

test('rawInputHasPositiveRequirement rejects a missing or non-array staffingRequirements field', () => {
  assert.equal(rawInputHasPositiveRequirement({}), false);
  assert.equal(rawInputHasPositiveRequirement({ staffingRequirements: 'not an array' }), false);
  assert.equal(rawInputHasPositiveRequirement({ staffingRequirements: null }), false);
});

test('rawInputHasPositiveRequirement rejects an empty staffingRequirements array', () => {
  assert.equal(rawInputHasPositiveRequirement({ staffingRequirements: [] }), false);
});

test('rawInputHasPositiveRequirement rejects a single zero-only requirement', () => {
  assert.equal(rawInputHasPositiveRequirement({ staffingRequirements: [{ requiredHeadcount: 0 }] }), false);
});

test('rawInputHasPositiveRequirement rejects several zero-only requirements', () => {
  assert.equal(
    rawInputHasPositiveRequirement({ staffingRequirements: [{ requiredHeadcount: 0 }, { requiredHeadcount: 0 }] }),
    false,
  );
});

test('rawInputHasPositiveRequirement accepts a mix of zero and positive requirements', () => {
  assert.equal(
    rawInputHasPositiveRequirement({ staffingRequirements: [{ requiredHeadcount: 0 }, { requiredHeadcount: 1 }] }),
    true,
  );
});

test('rawInputHasPositiveRequirement ignores malformed entries (non-object, or a non-numeric requiredHeadcount) rather than throwing', () => {
  assert.equal(
    rawInputHasPositiveRequirement({ staffingRequirements: [null, 'not an object', { requiredHeadcount: '2' }, { requiredHeadcount: 5 }] }),
    true,
  );
  assert.equal(
    rawInputHasPositiveRequirement({ staffingRequirements: [null, 'not an object', { requiredHeadcount: '2' }] }),
    false,
  );
});
