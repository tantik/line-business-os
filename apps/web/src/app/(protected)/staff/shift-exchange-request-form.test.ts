import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Staff Shift Schedule v2 (2026-08-25 Founder ТЗ): the future-shift request
 * form must offer the backend's already-supported `change` request kind
 * (`ShiftRequestKind = 'exchange' | 'change' | 'cancel'`,
 * `shift-exchanges.ts`), with a shift-type picker that only appears once
 * `change` is selected. Same source-text convention as this repo's other
 * component regression guards -- no DOM/React rendering harness exists here.
 */
const SOURCE = readFileSync(new URL('./shift-exchange-request-form.tsx', import.meta.url), 'utf8');

test('the request-type selector offers exchange, change, and cancel -- not just exchange/cancel', () => {
  assert.match(SOURCE, /<option value="exchange">/);
  assert.match(SOURCE, /<option value="change">/);
  assert.match(SOURCE, /<option value="cancel">/);
});

test('the shift-type picker only renders when requestKind is "change", and submits as requestedShiftTypeId', () => {
  assert.match(SOURCE, /requestKind === 'change' && activeShiftTypes\.length > 0/, 'the picker must be conditional on requestKind === \'change\'');
  assert.match(SOURCE, /name="requestedShiftTypeId"/, 'the picker\'s field name must match requestMyShiftExchange\'s expected form field');
});

test('the shift-type picker only offers active shift types, resolved through the canonical shiftTypeDisplayLabel', () => {
  assert.match(SOURCE, /activeShiftTypes = \(shiftTypes \?\? \[\]\)\.filter\(\(st\) => st\.isActive\)/, 'must filter to active shift types only');
  assert.match(SOURCE, /shiftTypeDisplayLabel\(st\)/, 'must resolve each option\'s label through the canonical display-label helper, never raw code');
});
