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
    ok: true,
    input: {
      id: null,
      locationId: VALID_UUID,
      name: 'Ice',
      unit: 'kg',
      requiredQuantity: 15,
      reorderPoint: 5,
      sortOrder: 0,
      isActive: undefined,
    },
  });
});

const VALID_FIELDS = { locationId: VALID_UUID, name: 'Ice', unit: 'kg', requiredQuantity: '10', reorderPoint: '5' };

function reasonOf(fields: Record<string, string>) {
  const result = parseUpsertInventoryItemInput(formDataOf(fields));
  return result.ok ? null : result.reason;
}

test('parseUpsertInventoryItemInput rejects missing required fields with a specific reason', () => {
  assert.equal(reasonOf({ locationId: VALID_UUID, name: 'Ice' }), 'invalid_unit');
  assert.equal(reasonOf({ name: 'Ice', unit: 'kg', requiredQuantity: '10', reorderPoint: '5' }), 'invalid_request');
  assert.equal(reasonOf({ ...VALID_FIELDS, name: '   ' }), 'invalid_name');
  assert.equal(reasonOf({ ...VALID_FIELDS, name: 'x'.repeat(121) }), 'invalid_name');
  assert.equal(reasonOf({ ...VALID_FIELDS, id: 'not-a-uuid' }), 'invalid_request');
});

test('parseUpsertInventoryItemInput rejects an unsupported unit and invalid quantities with a specific reason', () => {
  assert.equal(reasonOf({ ...VALID_FIELDS, unit: 'bags' }), 'invalid_unit');
  assert.equal(reasonOf({ ...VALID_FIELDS, requiredQuantity: '-1' }), 'invalid_target_quantity');
  assert.equal(reasonOf({ ...VALID_FIELDS, requiredQuantity: '' }), 'invalid_target_quantity');
  assert.equal(reasonOf({ ...VALID_FIELDS, reorderPoint: '-1' }), 'invalid_reorder_point');
  assert.equal(reasonOf({ ...VALID_FIELDS, reorderPoint: '1.2345' }), 'invalid_reorder_point');
  assert.equal(reasonOf({ ...VALID_FIELDS, sortOrder: '1.5' }), 'invalid_sort_order');
});

test('parseUpsertInventoryItemInput rejects a reorder point above the target quantity as reorder_above_target', () => {
  assert.equal(
    reasonOf({ locationId: VALID_UUID, name: 'Lids', unit: 'pcs', requiredQuantity: '15', reorderPoint: '16' }),
    'reorder_above_target',
  );
  assert.equal(reasonOf({ ...VALID_FIELDS, requiredQuantity: '0', reorderPoint: '0.001' }), 'reorder_above_target');
});

test('parseUpsertInventoryItemInput accepts a reorder point equal to the target quantity', () => {
  assert.equal(parseUpsertInventoryItemInput(formDataOf({ ...VALID_FIELDS, requiredQuantity: '5', reorderPoint: '5' })).ok, true);
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
