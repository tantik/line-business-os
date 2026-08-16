import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryItemIdInput, parseSetInventoryItemActiveInput, parseUpsertInventoryItemInput } from './items-input.js';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

test('parseUpsertInventoryItemInput accepts a valid create payload with no id', () => {
  const input = parseUpsertInventoryItemInput(
    formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'kg', requiredQuantity: '15', reorderPoint: '5' }),
  );
  assert.deepEqual(input, {
    id: null,
    locationId: VALID_UUID,
    name: 'Ice',
    unit: 'kg',
    requiredQuantity: 15,
    reorderPoint: 5,
    sortOrder: 0,
    isActive: undefined,
  });
});

test('parseUpsertInventoryItemInput rejects missing required fields', () => {
  assert.equal(parseUpsertInventoryItemInput(formDataOf({ locationId: VALID_UUID, name: 'Ice' })), null);
  assert.equal(
    parseUpsertInventoryItemInput(formDataOf({ name: 'Ice', unit: 'kg', requiredQuantity: '10', reorderPoint: '5' })),
    null,
  );
});

test('parseUpsertInventoryItemInput rejects an unsupported unit and a negative quantity', () => {
  assert.equal(
    parseUpsertInventoryItemInput(
      formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'bags', requiredQuantity: '10', reorderPoint: '5' }),
    ),
    null,
  );
  assert.equal(
    parseUpsertInventoryItemInput(
      formDataOf({ locationId: VALID_UUID, name: 'Ice', unit: 'kg', requiredQuantity: '-1', reorderPoint: '5' }),
    ),
    null,
  );
});

test('parseUpsertInventoryItemInput rejects a reorder point above the target quantity', () => {
  assert.equal(
    parseUpsertInventoryItemInput(
      formDataOf({ locationId: VALID_UUID, name: 'Lids', unit: 'pcs', requiredQuantity: '15', reorderPoint: '16' }),
    ),
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

test('parseInventoryItemIdInput parses itemId', () => {
  assert.deepEqual(parseInventoryItemIdInput(formDataOf({ itemId: VALID_UUID })), { itemId: VALID_UUID });
});
test('parseInventoryItemIdInput rejects a missing/malformed itemId', () => {
  assert.equal(parseInventoryItemIdInput(formDataOf({})), null);
  assert.equal(parseInventoryItemIdInput(formDataOf({ itemId: 'not-a-uuid' })), null);
});
