import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tIssues } from './issues-i18n.js';

/**
 * Issues & Handover module (Cafe v2.2 WP2, Manager Slice B + Staff Slice C):
 * every key must render a non-empty, distinct JA/EN string -- mirrors
 * `operations-i18n.test.ts`'s exact shape.
 */
const LANGS = ['ja', 'en'] as const;
const KEYS: Parameters<typeof tIssues>[1][] = [
  'popupTitle', 'popupHelpAriaLabel', 'popupHelpTitle', 'popupHelpBody', 'backToManager', 'backToStaff',
  'formCancel', 'unavailable',
  'viewSwitcherLabel', 'viewOpen', 'viewHistory',
  'reportButton', 'reportHeading', 'formKindLabel', 'kindIssue', 'kindHandover',
  'formCategoryLabel', 'categoryOptionNone', 'categoryEquipment', 'categoryInventory', 'categoryCleaning',
  'categoryFacility', 'categoryCustomer', 'categoryOperations', 'categoryOther',
  'formSeverityLabel', 'severityNormal', 'severityImportant', 'formNoteLabel', 'formSubmit', 'formSubmitting',
  'reportSuccess',
  'emptyOpenTitle', 'emptyOpenDescription', 'emptyHistoryTitle', 'emptyHistoryDescription',
  'staffPopupHelpBody', 'staffReportButton', 'staffReportHeading', 'staffSeverityToggleLabel',
  'staffEmptyTitle', 'staffEmptyDescription',
  'statusOpen', 'statusAcknowledged', 'statusResolved', 'kindHandoverBadge',
  'reportedByLabel', 'reportedByStaff', 'reportedByManager', 'businessDateLabel', 'reportedAtLabel',
  'acknowledgedAtLabel', 'resolvedAtLabel', 'resolutionNoteLabel',
  'acknowledgeButton', 'resolveButton', 'resolveNoteLabel', 'resolveSubmit',
  'errNoAuthContext', 'errModuleDisabled', 'errInvalidKind', 'errInvalidCategory', 'errInvalidSeverity',
  'errSeverityNotApplicableToHandover', 'errInvalidNote', 'errPermissionDenied', 'errNotFound', 'errNotOpen',
  'errAlreadyResolved', 'errorGeneric', 'errorNotAuthenticated', 'errorNoMembership',
];

test('tIssues returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const value = tIssues(lang, key);
      assert.equal(typeof value, 'string', `tIssues(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tIssues(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tIssues ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  for (const key of KEYS) {
    assert.notEqual(tIssues('ja', key), tIssues('en', key), `tIssues(ja/en, ${key}) should have distinct copy`);
  }
});
