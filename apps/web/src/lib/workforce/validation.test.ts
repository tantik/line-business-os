import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanFlag,
  parseIsoDate,
  parseLocalTime,
  parseNonNegativeInt,
  parseOptionalTrimmedString,
  parseTrimmedString,
  parseUuid,
} from './validation.js';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

test('parseUuid accepts a canonical UUID and lowercases/trims it', () => {
  assert.equal(parseUuid(` ${VALID_UUID.toUpperCase()} `), VALID_UUID);
});
test('parseUuid rejects non-string, malformed, and over-length input', () => {
  assert.equal(parseUuid(null), null);
  assert.equal(parseUuid(42), null);
  assert.equal(parseUuid('not-a-uuid'), null);
  assert.equal(parseUuid('x'.repeat(100)), null);
});

test('parseIsoDate accepts a real calendar date', () => {
  assert.equal(parseIsoDate('2026-08-03'), '2026-08-03');
});
test('parseIsoDate rejects malformed and non-existent calendar dates', () => {
  assert.equal(parseIsoDate('2026-8-3'), null);
  assert.equal(parseIsoDate('2026-02-30'), null);
  assert.equal(parseIsoDate('not-a-date'), null);
  assert.equal(parseIsoDate(null), null);
});

test('parseLocalTime accepts zero-padded 24h HH:MM', () => {
  assert.equal(parseLocalTime('09:00'), '09:00');
  assert.equal(parseLocalTime('23:59'), '23:59');
});
test('parseLocalTime rejects out-of-range and malformed times', () => {
  assert.equal(parseLocalTime('24:00'), null);
  assert.equal(parseLocalTime('9:00'), null);
  assert.equal(parseLocalTime('09:60'), null);
  assert.equal(parseLocalTime(''), null);
});

test('parseTrimmedString trims, rejects blank/over-length', () => {
  assert.equal(parseTrimmedString('  Aiko  ', 10), 'Aiko');
  assert.equal(parseTrimmedString('   ', 10), null);
  assert.equal(parseTrimmedString('a'.repeat(11), 10), null);
  assert.equal(parseTrimmedString(null, 10), null);
});

test('parseOptionalTrimmedString distinguishes absent/blank/present/over-length', () => {
  assert.deepEqual(parseOptionalTrimmedString(undefined, 10), { ok: true, value: null });
  assert.deepEqual(parseOptionalTrimmedString('  ', 10), { ok: true, value: null });
  assert.deepEqual(parseOptionalTrimmedString(' Barista ', 10), { ok: true, value: 'Barista' });
  assert.deepEqual(parseOptionalTrimmedString('a'.repeat(11), 10), { ok: false });
});

test('parseBooleanFlag recognizes checkbox-style truthy values only', () => {
  assert.equal(parseBooleanFlag('true'), true);
  assert.equal(parseBooleanFlag('on'), true);
  assert.equal(parseBooleanFlag('1'), true);
  assert.equal(parseBooleanFlag('false'), false);
  assert.equal(parseBooleanFlag(null), false);
  assert.equal(parseBooleanFlag(undefined), false);
});

test('parseNonNegativeInt accepts numbers and numeric strings within bound', () => {
  assert.equal(parseNonNegativeInt(5, 10), 5);
  assert.equal(parseNonNegativeInt('5', 10), 5);
  assert.equal(parseNonNegativeInt('0', 10), 0);
});
test('parseNonNegativeInt rejects negative, non-integer, over-bound, and malformed input', () => {
  assert.equal(parseNonNegativeInt(-1, 10), null);
  assert.equal(parseNonNegativeInt(1.5, 10), null);
  assert.equal(parseNonNegativeInt(11, 10), null);
  assert.equal(parseNonNegativeInt('abc', 10), null);
  assert.equal(parseNonNegativeInt(null, 10), null);
});
