import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tStaff, staffWeekdayInitials } from './i18n.staff.js';
import { tManager } from './i18n.manager.js';
import { tRecipes } from './i18n.recipes.js';
import { weekdayLabel } from './format.js';
import { previewWriteMessage, previewWriteMessageJa } from '@/lib/preview/write-result';

const LANGS = ['ja', 'en'] as const;

test('tStaff returns a non-empty string for every key in both languages', () => {
  const keys: Parameters<typeof tStaff>[1][] = [
    'clockIn', 'clockOut', 'workStatus', 'statusIdle', 'statusClockedIn', 'shiftTable',
    'all', 'onlyMe', 'workedHours', 'save', 'cancel', 'submit', 'submitPreference',
    'processing', 'resetTodayClockTest', 'scheduleLoadError', 'staffNumberPrefix',
    'workReportSubmittedFeedback', 'workReportFormTitle', 'submitting', 'reportConfirmed',
    'correctionSubmittedFeedback', 'correctionFormTitle',
  ];
  for (const lang of LANGS) {
    for (const key of keys) {
      const value = tStaff(lang, key);
      assert.equal(typeof value, 'string', `tStaff(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tStaff(${lang}, ${key}) must not be empty`);
      assert.notEqual(value, 'undefined', `tStaff(${lang}, ${key}) must not stringify to "undefined"`);
    }
  }
});

test('tStaff never returns the same non-trivial string for ja and en for a translated key', () => {
  // A representative sample of keys whose ja/en copy is expected to differ
  // (excludes keys that are legitimately identical, e.g. numeric formatting).
  const keys: Parameters<typeof tStaff>[1][] = ['clockIn', 'clockOut', 'workStatus', 'shiftTable', 'save', 'cancel'];
  for (const key of keys) {
    assert.notEqual(tStaff('ja', key), tStaff('en', key), `tStaff(ja/en, ${key}) should have distinct copy`);
  }
});

test('staffWeekdayInitials returns 7 distinct, non-empty labels per language', () => {
  for (const lang of LANGS) {
    const days = staffWeekdayInitials(lang);
    assert.equal(days.length, 7);
    for (const day of days) assert.ok(day.length > 0);
  }
});

test('tManager returns a non-empty string for every key in both languages', () => {
  const keys: Parameters<typeof tManager>[1][] = [
    'dashboardTitle', 'needsReview', 'shiftTable', 'shiftTableHelp', 'prevWeek', 'today', 'nextWeek',
    'staffListLoadError', 'staffListEmpty', 'saved', 'addStaff', 'edit', 'deactivate', 'reactivate',
    'cancel', 'save', 'correctionRequestsModalTitle', 'noPendingCorrections', 'approve', 'reject',
    'autoScheduleButton', 'publishScheduleButton', 'settingsCardTitle', 'requiredHeadcountHeading',
    'maxWorkHoursLabel', 'shiftTypesHeading', 'staffRecipeManagementTitle', 'manageStaffButton',
    'manageRecipesButton', 'recipeManagerHelp', 'recipeUntitled', 'recipeStatusPublished',
    'savingEllipsis', 'respondedFeedback', 'autoScheduleConfirmTitle', 'autoScheduleConfirmAction',
  ];
  for (const lang of LANGS) {
    for (const key of keys) {
      const value = tManager(lang, key);
      assert.equal(typeof value, 'string', `tManager(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tManager(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tManager ja/en copy differs for representative keys', () => {
  const keys: Parameters<typeof tManager>[1][] = ['dashboardTitle', 'shiftTable', 'save', 'cancel', 'edit'];
  for (const key of keys) {
    assert.notEqual(tManager('ja', key), tManager('en', key), `tManager(ja/en, ${key}) should have distinct copy`);
  }
});

test('shared schedule weekday labels follow the selected UI language', () => {
  const monday = new Date('2026-07-27T00:00:00');
  assert.equal(weekdayLabel(monday, 'ja'), '月');
  assert.equal(weekdayLabel(monday, 'en'), 'Mon');
});

test('tRecipes returns a non-empty string for every key in both languages', () => {
  const keys: Parameters<typeof tRecipes>[1][] = [
    'recipeSharing', 'ingredients', 'steps', 'noPublishedRecipes', 'backToRecipeList',
    'instructionBadge', 'notes', 'noIngredients', 'noSteps', 'noNotes',
  ];
  for (const lang of LANGS) {
    for (const key of keys) {
      const value = tRecipes(lang, key);
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
    }
  }
});

test('previewWriteMessage returns a non-empty, lang-appropriate string for every failure status', () => {
  const statuses: Parameters<typeof previewWriteMessage>[1][] = [
    'not_authenticated', 'no_access', 'module_disabled', 'location_blocked', 'no_profile',
    'invalid_input', 'not_found', 'duplicate', 'unexpected_error',
  ];
  for (const status of statuses) {
    const ja = previewWriteMessage('ja', status);
    const en = previewWriteMessage('en', status);
    assert.ok(ja.length > 0, `previewWriteMessage(ja, ${status}) must not be empty`);
    assert.ok(en.length > 0, `previewWriteMessage(en, ${status}) must not be empty`);
    assert.notEqual(ja, en, `previewWriteMessage(ja/en, ${status}) should have distinct copy`);
    // Backward-compat: the JA-only helper still exists for not-yet-wired components.
    assert.equal(previewWriteMessageJa(status), ja);
  }
});
