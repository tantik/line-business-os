import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tInventoryDashboard } from './inventory-i18n.js';

/**
 * Cafe v2.1 Mission 1 (Product/UX Reconciliation Audit §8/§14/Part F):
 * the canonical Inventory page chrome was entirely hardcoded English with
 * no i18n import at all (e.g. "Not yet counted", "Sufficient", "+ Add
 * item"). Closed by reusing the existing `LangProvider`/`makeTranslator`
 * mechanism, matching the canonical Staff dashboard's own pattern.
 */
const LANGS = ['ja', 'en'] as const;
const KEYS: Parameters<typeof tInventoryDashboard>[1][] = [
  'pageTitle', 'pageDescription', 'backToDashboard', 'unavailable', 'itemsSufficient', 'itemsShortage',
  'addItem', 'addItemButton', 'editItemHeading', 'newItemHeading', 'noItemsYet', 'statusNotCounted',
  'statusShortageLabel', 'statusSufficient', 'targetLabel', 'reorderAtLabel', 'currentLabel',
  'lastUpdatedLabel', 'unknownStaffLabel', 'editButton', 'deactivateButton', 'reactivateButton',
  'actualQuantityLabel', 'saveCountButton', 'savingButton', 'nameLabel', 'targetQuantityLabel',
  'reorderPointLabel', 'unitLabel', 'sortOrderLabel', 'saveChangesButton', 'cancelButton',
  'savingStatus', 'savedStatus', 'saveErrorStatus', 'deleteButton', 'deletingButton',
  'confirmDeactivateItemTitle', 'confirmDeleteItemTitle', 'confirmDeleteItemBody',
  'popupHelpAriaLabel', 'popupHelpTitle', 'popupHelpBody',
  'colItem', 'colTarget', 'colReorderAt', 'colCurrent', 'colActualQuantity', 'colStatus', 'colShortage', 'colActions',
  'statusInactiveLabel', 'statusShortageBadge', 'sortLabel', 'sortNameAsc', 'sortShortageFirst',
  'moreActionsAriaLabel', 'clearActualQuantityAriaLabel',
  'footerTotalItems', 'footerNeedRestocking', 'footerSufficient', 'footerTip',
];

test('tInventoryDashboard returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const value = tInventoryDashboard(lang, key);
      assert.equal(typeof value, 'string', `tInventoryDashboard(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tInventoryDashboard(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tInventoryDashboard ja/en copy differs for every key', () => {
  for (const key of KEYS) {
    assert.notEqual(tInventoryDashboard('ja', key), tInventoryDashboard('en', key), `key ${key} should have distinct ja/en copy`);
  }
});

test('no hardcoded "Not yet counted" / "Sufficient" / "+ Add item" chrome literals remain in the Inventory client component', () => {
  const source = readFileSync(new URL('./inventory-dashboard-client.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /'Not yet counted'|"Not yet counted"/);
  assert.doesNotMatch(source, /'Sufficient'|"Sufficient"/);
  assert.doesNotMatch(source, /'\+ Add item'|"\+ Add item"/);
});

test('the Inventory client component mounts LangProvider and reads useLang, matching the Staff dashboard pattern', () => {
  const source = readFileSync(new URL('./inventory-dashboard-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /LangProvider/);
  assert.match(source, /useLang\(\)/);
});
