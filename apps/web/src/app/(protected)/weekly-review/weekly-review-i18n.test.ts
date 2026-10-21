import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tWeeklyReview } from './weekly-review-i18n.js';

/**
 * Owner Weekly Review popup (Cafe v2.2 WP3): every key must render a
 * non-empty, distinct JA/EN string -- mirrors `issues-i18n.test.ts`'s exact
 * shape.
 */
const LANGS = ['ja', 'en'] as const;
const KEYS: Parameters<typeof tWeeklyReview>[1][] = [
  'navLabel', 'popupTitle', 'popupHelpAriaLabel', 'popupHelpTitle', 'popupHelpBody', 'backToManager', 'formCancel',
  'prevWeek', 'nextWeek', 'inProgressBadge',
  'unavailable', 'notAvailableTitle', 'notAvailableModuleOff',
  'quietWeekTitle', 'quietWeekDescription',
  'sectionTeam', 'labelShiftAssignments', 'labelShiftExchanges', 'labelUnresolvedShiftRequests',
  'labelAttendance', 'labelLateArrivals', 'labelNoShows', 'labelUnscheduledClockIns',
  'sectionOperations', 'labelCompletedChecks', 'labelCriticalMissed', 'labelOpenExceptions', 'labelThresholdOutOfRange',
  'valueTimes', 'valueItems', 'valueLate', 'valueThreshold',
  'sectionIssues', 'labelNewIssues', 'labelNewHandovers', 'labelUnresolvedIssues', 'labelUnresolvedImportantIssues',
  'recurringCategoryLine',
  'sectionPurchasing', 'labelShortageItems', 'labelPendingPurchases',
  'sectionStillOpen', 'stillOpenNone',
  'categoryEquipment', 'categoryInventory', 'categoryCleaning', 'categoryFacility', 'categoryCustomer',
  'categoryOperations', 'categoryOther',
  'viewShiftRequests', 'viewShiftExchanges', 'viewOperations', 'viewIssues', 'viewPurchases', 'viewInventory',
  'errNoAuthContext', 'errInvalidWeek', 'errPermissionDenied', 'errorGeneric', 'errorNotAuthenticated', 'errorNoMembership',
];

test('tWeeklyReview returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const value = tWeeklyReview(lang, key);
      assert.equal(typeof value, 'string', `tWeeklyReview(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tWeeklyReview(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tWeeklyReview ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  for (const key of KEYS) {
    assert.notEqual(tWeeklyReview('ja', key), tWeeklyReview('en', key), `tWeeklyReview(ja/en, ${key}) should have distinct copy`);
  }
});

test('QA3 (2026-10-17): week-scoped labels say "the week shown" / 「この週」, never "this week" / 「今週」 -- the review pages to past weeks', () => {
  const keys = [
    'labelShiftAssignments', 'labelShiftExchanges', 'labelCompletedChecks', 'labelCriticalMissed', 'labelNewIssues', 'labelNewHandovers', 'recurringCategoryLine',
    'labelAttendance', 'labelLateArrivals', 'labelNoShows', 'labelUnscheduledClockIns', 'labelThresholdOutOfRange',
  ] as const;
  for (const key of keys) {
    assert.doesNotMatch(tWeeklyReview('ja', key), /今週/, key);
    assert.doesNotMatch(tWeeklyReview('en', key), /this week/i, key);
  }
});

test('QA4 F3: JA attendance / out-of-range copy uses the reviewed wording and keeps every placeholder', () => {
  assert.match(tWeeklyReview('ja', 'labelAttendance'), /出勤/);
  assert.match(tWeeklyReview('ja', 'labelLateArrivals'), /遅刻/);
  assert.match(tWeeklyReview('ja', 'labelNoShows'), /無断欠勤の可能性/);
  assert.match(tWeeklyReview('ja', 'labelUnscheduledClockIns'), /シフト外の出勤/);
  assert.match(tWeeklyReview('ja', 'labelThresholdOutOfRange'), /範囲外の値（温度など）/);
  assert.equal(tWeeklyReview('ja', 'valueLate').replace('{count}', '2').replace('{minutes}', '16'), '2回（計16分）');
  assert.equal(tWeeklyReview('ja', 'valueThreshold').replace('{count}', '3').replace('{open}', '1'), '3件（未対応1件）');
  for (const lang of ['ja', 'en'] as const) {
    assert.match(tWeeklyReview(lang, 'valueTimes'), /\{count\}/);
    assert.match(tWeeklyReview(lang, 'valueItems'), /\{count\}/);
    assert.match(tWeeklyReview(lang, 'valueLate'), /\{count\}[\s\S]*\{minutes\}/);
    assert.match(tWeeklyReview(lang, 'valueThreshold'), /\{count\}[\s\S]*\{open\}/);
  }
});
