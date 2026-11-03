import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeInventoryItemInputError, describeInventoryWriteError, inventoryItemInputErrorField } from './error-copy.js';
import { tInventoryDashboard } from './inventory-i18n.js';
import type { InventoryItemInputError } from '@/lib/inventory/result-types';

const REASONS: InventoryItemInputError[] = [
  'invalid_request',
  'invalid_name',
  'invalid_unit',
  'invalid_target_quantity',
  'invalid_reorder_point',
  'reorder_above_target',
  'invalid_sort_order',
];

test('reorder_above_target copy names both form fields by their form labels, in JA and EN', () => {
  for (const lang of ['ja', 'en'] as const) {
    const message = describeInventoryWriteError({ status: 'invalid_input', reason: 'reorder_above_target' }, lang);
    assert.ok(message.includes(tInventoryDashboard(lang, 'reorderPointLabel')), `${lang}: ${message}`);
    assert.ok(message.toLowerCase().includes(tInventoryDashboard(lang, 'targetQuantityLabel').toLowerCase()), `${lang}: ${message}`);
    assert.notEqual(message, tInventoryDashboard(lang, 'somethingWentWrongError'));
  }
  assert.equal(
    describeInventoryWriteError({ status: 'invalid_input', reason: 'reorder_above_target' }, 'ja'),
    '発注点は目標数量以下にしてください（例：目標数量 10、発注点 5）。',
  );
  assert.equal(
    describeInventoryWriteError({ status: 'invalid_input', reason: 'reorder_above_target' }, 'en'),
    'Reorder point must not be greater than the target quantity (e.g. target quantity 10, reorder point 5).',
  );
});

test('every user-fixable reason has specific, distinct JA/EN copy; invalid_request falls back to the generic error', () => {
  for (const reason of REASONS) {
    const ja = describeInventoryItemInputError(reason, 'ja');
    const en = describeInventoryItemInputError(reason, 'en');
    assert.ok(ja.length > 0 && en.length > 0);
    assert.notEqual(ja, en);
    if (reason === 'invalid_request') {
      assert.equal(en, tInventoryDashboard('en', 'somethingWentWrongError'));
    } else {
      assert.notEqual(en, tInventoryDashboard('en', 'somethingWentWrongError'), reason);
      assert.notEqual(ja, tInventoryDashboard('ja', 'somethingWentWrongError'), reason);
    }
  }
});

test('inventoryItemInputErrorField maps reasons to the form field they belong to', () => {
  assert.equal(inventoryItemInputErrorField('reorder_above_target'), 'reorderPoint');
  assert.equal(inventoryItemInputErrorField('invalid_reorder_point'), 'reorderPoint');
  assert.equal(inventoryItemInputErrorField('invalid_target_quantity'), 'requiredQuantity');
  assert.equal(inventoryItemInputErrorField('invalid_name'), 'name');
  assert.equal(inventoryItemInputErrorField('invalid_unit'), 'unit');
  assert.equal(inventoryItemInputErrorField('invalid_sort_order'), 'sortOrder');
  assert.equal(inventoryItemInputErrorField('invalid_request'), null);
});

test('non-validation statuses keep their existing copy', () => {
  assert.equal(describeInventoryWriteError({ status: 'not_found' }, 'en'), tInventoryDashboard('en', 'notFoundError'));
  assert.equal(
    describeInventoryWriteError({ status: 'unexpected_error', message: 'x' }, 'ja'),
    tInventoryDashboard('ja', 'somethingWentWrongError'),
  );
});
