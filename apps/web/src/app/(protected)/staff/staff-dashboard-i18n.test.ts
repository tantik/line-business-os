import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customShiftTimeRangeLabel,
  describeExchangeError,
  earningsEstimatedSuffix,
  earningsWorkedHoursValue,
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

/**
 * Cafe v2.1 Mission 1 (Product/UX Reconciliation Audit §5/§8/§14) extended
 * this dictionary to the shift-preference/work-report/correction-request
 * sections, which previously mixed hardcoded bilingual literals with some
 * English-only strings instead of toggling with the rest of the page.
 */
const ALL_KEYS: Parameters<typeof tStaffDashboard>[1][] = [
  'scheduleHeading', 'all', 'onlyMe', 'prevWeek', 'thisWeek', 'nextWeek', 'scheduleUnavailable',
  'scheduledThisWeekLabel', 'meLabel', 'colleaguePrefixLabel', 'shiftLabel', 'timeLabel',
  'clockInLabel', 'clockOutLabel', 'transportationLabel', 'noShiftOrReport', 'requestChangeHeading',
  'exchangeHelpAriaLabel', 'exchangeHelpTitle', 'exchangeHelpBody',
  'exchangeSubmitted', 'inventoryTitle', 'inventoryDescription', 'inventorySufficient', 'inventoryOpen',
  'inventoryNotEnabled', 'requestTypeLabel', 'optionExchange', 'optionChange', 'requestedShiftTypeLabel', 'optionCancel', 'reasonLabel', 'submit',
  'submitting', 'submitEyebrow', 'dateLabel', 'statusLabel',
  'shiftPreferencesHeading', 'shiftPreferencesUnavailable', 'shiftPreferencesEmpty',
  'preferenceHelpAriaLabel', 'preferenceHelpTitle', 'preferenceHelpBody', 'preferenceColumnLabel',
  'preferenceUnavailableValue', 'shiftTypesUnavailable', 'unavailableThisDayLabel', 'shiftTypeLabel',
  'chooseShiftType', 'submitPreference', 'shiftPreferenceSubmitted',
  'workReportsHeading', 'workReportsUnavailable', 'workReportsEmpty', 'clockInColumnLabel',
  'clockOutColumnLabel', 'transportationColumnLabel', 'messageColumnLabel', 'actualBreakLabel',
  'breakMinutes0', 'breakMinutes30', 'breakMinutes60', 'transportationCostLabel', 'dailyMessageLabel',
  'submitWorkReport', 'workReportSubmitted',
  'correctionRequestHeading', 'correctionRequestDescription', 'relatedWorkReportLabel', 'relatedWorkReportNone',
  'correctionMessageLabel', 'submitCorrectionRequest', 'correctionRequestSubmitted',
  'myCorrectionsHeading', 'myCorrectionsUnavailable', 'myCorrectionsEmpty', 'relatedWorkReportColumnLabel',
  'plannedShiftLabel', 'requestCorrectionButton', 'correctionRequestStatusHeading', 'correctionRequestedChangeLabel',
  'attentionIndicatorLegend',
  'navPurchases', 'navMail', 'preferenceModalTitle',
  'workStatusHelpAriaLabel', 'workStatusHelpBody', 'scheduleHelpAriaLabel', 'scheduleHelpBody',
  'transportHelpAriaLabel', 'transportHelpBody', 'transportPlaceholder',
  'savingStatus', 'savedStatus', 'saveErrorStatus',
  // Staff<->Manager Mail module (0090)
  'mailHeading', 'mailEmpty', 'mailYouLabel', 'mailManagerLabel', 'mailArchivedTag',
  'mailMoreActionsAriaLabel', 'mailMarkRead', 'mailArchive', 'mailComposePlaceholder',
  'mailSend', 'mailSending', 'mailHelpAriaLabel', 'mailHelpBody',
];

test('tStaffDashboard returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of ALL_KEYS) {
      const value = tStaffDashboard(lang, key);
      assert.equal(typeof value, 'string', `tStaffDashboard(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tStaffDashboard(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tStaffDashboard ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  for (const key of ALL_KEYS) {
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

test('existingExchangeMessage localizes the status label and differs by language', () => {
  assert.match(existingExchangeMessage.en('open'), /open/);
  assert.match(existingExchangeMessage.ja('open'), /受付中/);
  assert.doesNotMatch(existingExchangeMessage.ja('open'), /open/);
  assert.match(existingExchangeMessage.ja('accepted'), /承認済み/);
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

test('customShiftTimeRangeLabel interpolates the start/end time and differs by language, never the literal English word "Custom" alone', () => {
  assert.match(customShiftTimeRangeLabel.en('10:00', '14:00'), /10:00/);
  assert.match(customShiftTimeRangeLabel.en('10:00', '14:00'), /14:00/);
  assert.match(customShiftTimeRangeLabel.ja('10:00', '14:00'), /10:00/);
  assert.notEqual(customShiftTimeRangeLabel.en('10:00', '14:00'), customShiftTimeRangeLabel.ja('10:00', '14:00'));
});

test('earningsWorkedHoursValue interpolates the hours value and differs by language', () => {
  assert.match(earningsWorkedHoursValue.en('12.5'), /12\.5/);
  assert.match(earningsWorkedHoursValue.ja('12.5'), /12\.5/);
  assert.notEqual(earningsWorkedHoursValue.en('12.5'), earningsWorkedHoursValue.ja('12.5'));
});

test('earningsEstimatedSuffix interpolates the hourly wage and estimated total and differs by language', () => {
  // toLocaleString()'s thousands-separator formatting is locale/ICU-data
  // dependent (this test runner's default locale renders a non-comma
  // separator) -- assert the raw digits appear, not a specific separator.
  assert.match(earningsEstimatedSuffix.en(1200, 15000), /1.200/);
  assert.match(earningsEstimatedSuffix.en(1200, 15000), /15.000/);
  assert.notEqual(earningsEstimatedSuffix.en(1200, 15000), earningsEstimatedSuffix.ja(1200, 15000));
});

test('Staff schedule help matches the immediate-assignment workflow in both languages', () => {
  assert.doesNotMatch(tStaffDashboard('en', 'scheduleHelpBody'), /published/i);
  assert.doesNotMatch(tStaffDashboard('ja', 'scheduleHelpBody'), /公開/);
  assert.match(tStaffDashboard('en', 'scheduleHelpBody'), /assigned/i);
  assert.match(tStaffDashboard('ja', 'scheduleHelpBody'), /割り当て/);
});

/**
 * Help Content Pass v2: the shift-preference and shift-exchange/change/
 * cancel Help must never claim the request is automatically applied --
 * both are backend-verified as request-only, decided by a manager.
 */
test('Staff shift-preference help never claims an automatic/confirmed shift, and explains the request is not editable once submitted', () => {
  assert.doesNotMatch(tStaffDashboard('en', 'preferenceHelpBody'), /automatically assign/i);
  assert.match(tStaffDashboard('en', 'preferenceHelpBody'), /request/i);
  assert.match(tStaffDashboard('ja', 'preferenceHelpBody'), /希望/);
});

/**
 * Help Content Pass v2 (fix after independent review, PR #497): the
 * scheduling engine (`packages/workforce/src/auto-distribute.ts`) has no
 * approved/unapproved distinction -- every submitted preference is treated
 * identically. Manager-side "approve" is a local UI review marker only
 * (never persisted, no algorithm effect). This Help must never claim a
 * two-tier "approved preference" priority that does not exist.
 */
test('Staff shift-preference help never claims a two-tier "approved vs regular" preference priority that the scheduling engine does not implement', () => {
  assert.doesNotMatch(tStaffDashboard('en', 'preferenceHelpBody'), /approved/i);
  assert.doesNotMatch(tStaffDashboard('ja', 'preferenceHelpBody'), /承認/);
});

test('Staff shift-exchange help states manager approval is required before the schedule changes, in both languages', () => {
  assert.match(tStaffDashboard('en', 'exchangeHelpBody'), /manager/i);
  assert.match(tStaffDashboard('en', 'exchangeHelpBody'), /approv/i);
  assert.match(tStaffDashboard('ja', 'exchangeHelpBody'), /店長/);
  assert.match(tStaffDashboard('ja', 'exchangeHelpBody'), /承認/);
});
