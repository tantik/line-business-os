import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReorderPointCheckViolation } from './pg-error.js';

test('isReorderPointCheckViolation matches 23514 on inventory_items_reorder_point_check', () => {
  assert.equal(
    isReorderPointCheckViolation({
      code: '23514',
      message: 'new row for relation "items" violates check constraint "inventory_items_reorder_point_check"',
    }),
    true,
  );
});

test('isReorderPointCheckViolation ignores other check constraints and other error codes', () => {
  assert.equal(
    isReorderPointCheckViolation({ code: '23514', message: 'violates check constraint "inventory_items_required_quantity_check"' }),
    false,
  );
  assert.equal(
    isReorderPointCheckViolation({ code: '42501', message: 'inventory_items_reorder_point_check' }),
    false,
  );
});
