import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeExchangeError,
  existingExchangeMessage,
  inventoryShortageLabel,
  scheduledThisWeekValue,
  tStaffDashboard,
} from './staff-dashboard-i18n.js';

/**
 * Cafe v2.1 canonical Staff consolidation, JA/EN gap closure. Same
 * convention as `lib/demo/cafe/i18n.test.ts` (this repo's test runner has no
 * DOM/React harness, so these are pure-function behavioral tests of the
 * translator, not component-rendering tests) -- proves the canonical
 * dashboard Staff controls this consolidation touched actually change
 * language via the existing `LangProvider`/`makeTranslator` mechanism, not
 * just that a toggle button exists.
 */
const LANGS = ['ja', 'en'] as const;

test('tStaffDashboard returns a non-empty string for every key in both languages', () => {
  const keys: Parameters<typeof tStaffDashboard>[1][] = [
    'scheduleHeading', 'all', 'onlyMe', 'prevWeek', 'thisWeek', 'nextWeek', 'scheduleUnavailable',
    'scheduledThisWeekLabel', 'meLabel', 'colleaguePrefixLabel', 'shiftLabel', 'timeLabel',
    'clockInLabel', 'clockOutLabel', 'transportationLabel', 'noShiftOrReport', 'requestChangeHeading',
    'exchangeSubmitted', 'inventoryTitle', 'inventoryDescription', 'inventorySufficient', 'inventoryOpen',
    'inventoryNotEnabled', 'requestTypeLabel', 'optionExchange', 'optionCancel', 'reasonLabel', 'submit',
    'submitting',
  ];
  for (const lang of LANGS) {
    for (const key of keys) {
      const value = tStaffDashboard(lang, key);
      assert.equal(typeof value, 'string', `tStaffDashboard(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tStaffDashboard(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tStaffDashboard ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  const keys: Parameters<typeof tStaffDashboard>[1][] = [
    'scheduleHeading', 'all', 'onlyMe', 'prevWeek', 'thisWeek', 'nextWeek', 'scheduleUnavailable',
    'meLabel', 'colleaguePrefixLabel', 'shiftLabel', 'timeLabel', 'clockInLabel', 'clockOutLabel',
    'transportationLabel', 'noShiftOrReport', 'requestChangeHeading', 'exchangeSubmitted',
    'inventoryTitle', 'inventoryDescription', 'inventorySufficient', 'inventoryOpen', 'inventoryNotEnabled',
    'requestTypeLabel', 'optionExchange', 'optionCancel', 'reasonLabel', 'submit', 'submitting',
  ];
  for (const key of keys) {
    assert.notEqual(tStaffDashboard('ja', key), tStaffDashboard('en', key), `tStaffDashboard(ja/en, ${key}) should have distinct copy`);
  }
});

test('scheduledThisWeekValue interpolates the hours value and differs by language', () => {
  assert.match(scheduledThisWeekValue.en('12.5'), /12\.5/);
  assert.match(scheduledThisWeekValue.ja('12.5'), /12\.5/);
  assert.notEqual(scheduledThisWeekValue.en('12.5'), scheduledThisWeekValue.ja('12.5'));
});

test('inventoryShortageLabel interpolates the count and differs by language', () => {
  assert.match(inventoryShortageLabel.en(3), /3/);
  assert.match(inventoryShortageLabel.ja(3), /3/);
  assert.notEqual(inventoryShortageLabel.en(3), inventoryShortageLabel.ja(3));
});

test('existingExchangeMessage interpolates the status and differs by language', () => {
  assert.match(existingExchangeMessage.en('open'), /open/);
  assert.match(existingExchangeMessage.ja('open'), /open/);
  assert.notEqual(existingExchangeMessage.en('open'), existingExchangeMessage.ja('open'));
});

test('describeExchangeError returns known, distinct-by-language copy for every status the exchange RPC can return', () => {
  const statuses = ['not_found', 'not_authenticated', 'no_membership', 'stale_reference', 'duplicate'];
  for (const status of statuses) {
    const ja = describeExchangeError('ja', status);
    const en = describeExchangeError('en', status);
    assert.ok(ja.length > 0);
    assert.ok(en.length > 0);
    assert.notEqual(ja, en, `describeExchangeError(ja/en, ${status}) should have distinct copy`);
  }
});

test('describeExchangeError falls back to a non-empty generic message for an unmapped status', () => {
  assert.ok(describeExchangeError('en', 'totally_unknown_status').length > 0);
  assert.ok(describeExchangeError('ja', 'totally_unknown_status').length > 0);
});
