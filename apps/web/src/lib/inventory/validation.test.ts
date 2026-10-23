import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanFlag,
  parseInventoryUnit,
  parseItemName,
  parseQuantity,
  parseSortOrder,
  parseUuid,
  quantityInputValue,
} from './validation.js';
import { readFileSync } from 'node:fs';

test('quantityInputValue trims float noise to the 3-decimal column precision (QA4 F7)', () => {
  assert.equal(quantityInputValue(3.799999952316284), '3.8');
  assert.equal(quantityInputValue(10.399999618530273), '10.4');
  assert.equal(quantityInputValue(0.1 + 0.2), '0.3');
  assert.equal(quantityInputValue(1.75), '1.75');
  assert.equal(quantityInputValue(0.001), '0.001');
  assert.equal(quantityInputValue(8), '8');
  assert.equal(quantityInputValue(0), '0');
  assert.equal(quantityInputValue(-0.0001), '0');
  assert.equal(quantityInputValue(null), '');
  assert.equal(quantityInputValue(undefined), '');
  assert.equal(quantityInputValue(Number.NaN), '');
  // Whatever it seeds must round-trip through the server-side parser.
  assert.equal(parseQuantity(quantityInputValue(3.799999952316284)), 3.8);
});

test('every input seeded from a stored quantity goes through quantityInputValue (QA4 F7)', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.match(read('../../app/(protected)/inventory/count-form.tsx'), /useState\(quantityInputValue\(initialValue\)\)/);
  const itemForm = read('../../app/(protected)/inventory/item-form.tsx');
  assert.match(itemForm, /defaultValue=\{quantityInputValue\(item\?\.requiredQuantity \?\? 0\)\}/);
  assert.match(itemForm, /defaultValue=\{quantityInputValue\(item\?\.reorderPoint \?\? 0\)\}/);
  assert.match(read('../../app/(protected)/purchases/receive-form.tsx'), /quantityInputValue\(defaultQuantity\)/);
});

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
