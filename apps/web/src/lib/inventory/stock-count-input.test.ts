import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecordStockCountInput } from './stock-count-input.js';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const OTHER_UUID = '22222222-2222-2222-2222-222222222222';

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

test('parseRecordStockCountInput accepts a valid payload', () => {
  assert.deepEqual(
    parseRecordStockCountInput(formDataOf({ locationId: VALID_UUID, itemId: OTHER_UUID, actualQuantity: '3.5' })),
    { locationId: VALID_UUID, itemId: OTHER_UUID, actualQuantity: 3.5 },
  );
});

test('parseRecordStockCountInput rejects a negative or malformed quantity', () => {
  assert.equal(
    parseRecordStockCountInput(formDataOf({ locationId: VALID_UUID, itemId: OTHER_UUID, actualQuantity: '-1' })),
    null,
  );
  assert.equal(
    parseRecordStockCountInput(formDataOf({ locationId: VALID_UUID, itemId: OTHER_UUID, actualQuantity: 'abc' })),
    null,
  );
});

test('parseRecordStockCountInput rejects missing ids', () => {
  assert.equal(parseRecordStockCountInput(formDataOf({ itemId: OTHER_UUID, actualQuantity: '1' })), null);
  assert.equal(parseRecordStockCountInput(formDataOf({ locationId: VALID_UUID, actualQuantity: '1' })), null);
});
