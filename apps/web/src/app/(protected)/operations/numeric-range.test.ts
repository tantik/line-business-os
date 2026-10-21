import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNumericRange } from './numeric-range.js';

test('two-sided range keeps the en dash, real minus signs', () => {
  assert.equal(formatNumericRange('ja', 0, 5, '°C'), '0–5 °C');
  assert.equal(formatNumericRange('en', -25, -15, '°C'), '−25–−15 °C');
});

test('max only reads as an upper limit (freezer)', () => {
  assert.equal(formatNumericRange('ja', null, -15, '°C'), '−15 °C以下');
  assert.equal(formatNumericRange('en', null, -15, '°C'), '≤ −15 °C');
});

test('min only reads as a lower limit (hot-holding)', () => {
  assert.equal(formatNumericRange('ja', 65, null, '°C'), '65 °C以上');
  assert.equal(formatNumericRange('en', 65, null, null), '≥ 65');
});

test('no bounds -> null', () => {
  assert.equal(formatNumericRange('ja', null, null, '°C'), null);
});
