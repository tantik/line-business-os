import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetInventoryItemActiveInput, parseUpsertInventoryItemInput } from './items-input.js';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

test('parseUpsertInventoryItemInput accepts a valid create payload with no id', () => {
  const input = parseUpsertInventoryItemInput(
    formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'kg', requiredQuantity: '10' }),
  );
  assert.deepEqual(input, {
    id: null,
    locationId: VALID_UUID,
    name: 'Ice',
    unit: 'kg',
    requiredQuantity: 10,
    sortOrder: 0,
    isActive: undefined,
  });
});

test('parseUpsertInventoryItemInput rejects missing required fields', () => {
  assert.equal(parseUpsertInventoryItemInput(formDataOf({ locationId: VALID_UUID, name: 'Ice' })), null);
  assert.equal(parseUpsertInventoryItemInput(formDataOf({ name: 'Ice', unit: 'kg', requiredQuantity: '10' })), null);
});

test('parseUpsertInventoryItemInput rejects an unsupported unit and a negative quantity', () => {
  assert.equal(
    parseUpsertInventoryItemInput(formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'bags', requiredQuantity: '10' })),
    null,
  );
  assert.equal(
    parseUpsertInventoryItemInput(formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'kg', requiredQuantity: '-1' })),
    null,
  );
});

test('parseSetInventoryItemActiveInput parses itemId + isActive flag', () => {
  assert.deepEqual(parseSetInventoryItemActiveInput(formDataOf({ itemId: VALID_UUID, isActive: 'true' })), {
    itemId: VALID_UUID,
    isActive: true,
  });
});
test('parseSetInventoryItemActiveInput rejects a malformed itemId', () => {
  assert.equal(parseSetInventoryItemActiveInput(formDataOf({ itemId: 'not-a-uuid' })), null);
});
