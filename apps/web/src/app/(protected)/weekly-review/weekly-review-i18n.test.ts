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
  'sectionOperations', 'labelCompletedChecks', 'labelCriticalMissed', 'labelOpenExceptions',
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
