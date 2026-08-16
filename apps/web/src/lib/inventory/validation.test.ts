import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanFlag,
  parseInventoryUnit,
  parseItemName,
  parseQuantity,
  parseSortOrder,
  parseUuid,
} from './validation.js';

test('parseUuid accepts a canonical UUID and lowercases/trims it', () => {
  assert.equal(parseUuid(' 11111111-1111-1111-1111-111111111111 '.toUpperCase().trim()), '11111111-1111-1111-1111-111111111111');
});
test('parseUuid rejects malformed input', () => {
  assert.equal(parseUuid('not-a-uuid'), null);
  assert.equal(parseUuid(42), null);
});

test('parseItemName accepts trimmed non-empty text within bounds', () => {
  assert.equal(parseItemName('  Ice  '), 'Ice');
});
test('parseItemName rejects empty and over-length names', () => {
  assert.equal(parseItemName(''), null);
  assert.equal(parseItemName('   '), null);
  assert.equal(parseItemName('a'.repeat(121)), null);
});

test('parseInventoryUnit accepts exactly the 5 supported units', () => {
  for (const unit of ['kg', 'g', 'L', 'mL', 'pcs']) {
    assert.equal(parseInventoryUnit(unit), unit);
  }
});
test('parseInventoryUnit rejects unsupported units', () => {
  assert.equal(parseInventoryUnit('bags'), null);
  assert.equal(parseInventoryUnit('KG'), null);
  assert.equal(parseInventoryUnit(''), null);
});

test('parseQuantity accepts non-negative values with up to 3 decimals', () => {
  assert.equal(parseQuantity('10'), 10);
  assert.equal(parseQuantity('0'), 0);
  assert.equal(parseQuantity('3.5'), 3.5);
  assert.equal(parseQuantity('3.125'), 3.125);
  assert.equal(parseQuantity(7), 7);
});
test('parseQuantity rejects negative, non-finite, over-precision, and absurdly large values', () => {
  assert.equal(parseQuantity('-1'), null);
  assert.equal(parseQuantity(-1), null);
  assert.equal(parseQuantity(Number.NaN), null);
  assert.equal(parseQuantity(Number.POSITIVE_INFINITY), null);
  assert.equal(parseQuantity('Infinity'), null);
  assert.equal(parseQuantity('NaN'), null);
  assert.equal(parseQuantity('1.2345'), null);
  assert.equal(parseQuantity('9999999'), null);
  assert.equal(parseQuantity(''), null);
  assert.equal(parseQuantity(null), null);
});

test('parseSortOrder accepts non-negative integers within bound', () => {
  assert.equal(parseSortOrder('0'), 0);
  assert.equal(parseSortOrder(5), 5);
});
test('parseSortOrder rejects negative, fractional, and out-of-bound values', () => {
  assert.equal(parseSortOrder('-1'), null);
  assert.equal(parseSortOrder('1.5'), null);
  assert.equal(parseSortOrder(1.5), null);
  assert.equal(parseSortOrder(200_000), null);
});

test('parseBooleanFlag recognizes the FormData boolean convention', () => {
  assert.equal(parseBooleanFlag('true'), true);
  assert.equal(parseBooleanFlag('on'), true);
  assert.equal(parseBooleanFlag('false'), false);
  assert.equal(parseBooleanFlag(null), false);
  assert.equal(parseBooleanFlag(undefined), false);
});
