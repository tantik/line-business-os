import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attentionCorrectionLabel,
  attentionExchangeLabel,
  attentionInventoryLabel,
  attentionInventoryShortageSummary,
  attentionSummarySubtitle,
  autoDistributionCreatedMessage,
  breakMinutesValue,
  preferencesHeadingValue,
  publishedCountMessage,
  scheduleHeadingValue,
  staffSummaryLabel,
  tManagerDashboard,
} from './manager-dashboard-i18n.js';

/**
 * Cafe v2.1 Mission 2 (Manager Attention & Product Experience): the
 * canonical Manager dashboard's first adoption of the
 * `LangProvider`/`makeTranslator` mechanism already proven on the
 * canonical Staff dashboard (`staff-dashboard-i18n.test.ts`, same
 * convention -- this repo's test runner has no DOM/React harness, so these
 * are pure-function behavioral tests of the translator, not
 * component-rendering tests).
 */
const LANGS = ['ja', 'en'] as const;

const ALL_KEYS: Parameters<typeof tManagerDashboard>[1][] = [
  'attentionHeading', 'attentionAllClear', 'attentionReview',
  'staffHeading', 'manageStaff', 'addStaff', 'staffUnavailable', 'staffEmpty', 'searchStaffPlaceholder', 'filterAll',
  'noStaffMatch', 'colName', 'colPosition', 'colEmploymentType',
  'colStatus', 'colLine', 'colActions', 'statusActive', 'statusInactive', 'edit', 'activate', 'deactivate',
  'saving', 'confirmDeactivate', 'deleteStaffButton', 'deletingStaff', 'confirmDeleteStaffTitle', 'confirmDeleteStaffBody',
  'staffDeleted', 'staffBlockedByHistory',
  'lineLinkedShort', 'lineNotLinkedShort', 'accessActiveShort', 'accessPendingShort', 'accessExpiredShort', 'accessNoneShort', 'accessSectionHeading', 'dangerZoneHeading',
  'inviteButton', 'resendButton', 'sendingStatus', 'recoverAccessButton', 'revokeInvitationButton', 'recoveryEmailSentMessage',
  'confirmRecoverAccessTitle', 'confirmRecoverAccessBody', 'confirmSendButton', 'confirmRevokeInvitationTitle', 'confirmRevokeInvitationBody',
  'inviteErrorNotFound', 'inviteErrorDuplicate', 'inviteErrorGeneric', 'revokeErrorNotFound', 'revokeErrorGeneric', 'recoverErrorGeneric', 'errorUnauthorizedAction',
  'fieldName', 'fieldFamilyName', 'fieldGivenName', 'fieldEmail', 'fieldLineUserId', 'fieldPosition', 'fieldEmploymentType',
  'addStaffSubmit', 'saveChanges', 'cancel',
  'errorNotFound', 'errorNotAuthenticated', 'errorNoMembership', 'errorStaleReference',
  'prevWeek', 'thisWeek', 'nextWeek', 'addStaffToSeeSchedule', 'colStaff', 'assign', 'unassign', 'unassigning',
  'actionsHeading', 'autoDistributionDescription',
  'runAutoDistribution', 'running', 'publishSchedule', 'publishing', 'confirmPublish', 'confirmUnassignShift',
  'scheduleHelpAriaLabel', 'scheduleHelpTitle', 'scheduleHelpBody',
  'understaffedDayAriaLabel', 'pendingCorrectionCellAriaLabel',
  'staffPopupHelpAriaLabel', 'staffPopupHelpTitle', 'staffPopupHelpBody',
  'staffNamePopupTitlePrefix', 'staffNamePopupMonth', 'staffNamePopupWorkedHours', 'staffNamePopupHourlyWage',
  'staffNamePopupEarnedSoFar', 'staffNamePopupCopyReport', 'staffNamePopupCopied', 'staffNamePopupCopyFailed',
  'settingsCardTitle', 'settingsHelpBody', 'requiredHeadcountHeading', 'maxWorkHoursLabel', 'weekdayAriaSuffix', 'nameLabel', 'optionalNameLabel',
  'startTimeLabel', 'endTimeLabel', 'addShiftType', 'deactivateShiftTypeButton', 'confirmDeactivateShiftTypeTitle',
  'confirmDeactivateShiftTypeBody', 'showDeactivatedShiftTypes', 'hideDeactivatedShiftTypes', 'deactivatedShiftTypesHeading',
  'deactivatedShiftTypesEmpty', 'reactivate', 'savingStatus', 'savedStatus', 'saveErrorStatus', 'duplicateShiftTypeName',
  'shiftTypesHeading', 'shiftTypesUnavailable', 'shiftTypesEmpty', 'colCode', 'colLabel', 'colTime', 'colBreak',
  'fieldEmployee', 'fieldShiftType', 'shiftTypeCustom', 'fieldStart', 'fieldEnd', 'fieldBreakMinutes', 'save',
  'editingPublishedShiftNotice', 'confirmPublishedEditTitle', 'confirmPublishedEditBody',
  'assignCellAriaLabelPrefix', 'editCellAriaLabelPrefix', 'statusDraftAriaLabel', 'statusPublishedAriaLabel',
  'preferencesUnavailable', 'preferencesEmpty', 'colDate', 'colPreference', 'unavailableValue',
  'correctionsHeading', 'correctionsUnavailable', 'needsActionEyebrow', 'noPendingCorrections', 'colMessage',
  'colAttendance', 'colTransportation', 'colDailyMessage', 'approve', 'reject', 'recentlyDecided', 'colStatus2',
  'showArchiveButton', 'hideArchiveButton', 'viewHistoryButton', 'correctionsPopupHelpAriaLabel', 'correctionsPopupHelpTitle', 'correctionsPopupHelpBody',
  'exchangesHeading', 'exchangesUnavailable', 'noPendingExchanges', 'colRequester', 'colShift', 'colRequest',
  'colReason', 'requestKindCancellation', 'requestKindChange', 'requestKindExchange', 'awaitingCandidate',
  'exchangesPopupHelpAriaLabel', 'exchangesPopupHelpTitle', 'exchangesPopupHelpBody',
  'exchangeReplacementLabel', 'exchangeReplacementNotAssigned', 'exchangeWaitingForCandidate', 'assignReplacementButton',
  'changeReplacementButton', 'selectReplacementTitle', 'searchReplacementPlaceholder', 'noEligibleReplacements',
  'candidateAvailable', 'candidateScheduleConflict', 'candidateMarkedUnavailable', 'confirmAssignReplacementButton',
  'assigningReplacement',
  'backToWorkforce',
  'staffActivated', 'staffDeactivated', 'shiftUnassigned', 'correctionApproved', 'correctionRejected',
  'exchangeApproved', 'exchangeRejected', 'replacementAssigned', 'draftShiftsLabel', 'shortagesLabel', 'unplacedLabel', 'nonSubmittersLabel',
  'attentionItemCorrectionTitle', 'attentionItemExchangeTitle',
  'attentionItemConflictTitle', 'attentionItemInventoryTitle', 'attentionWaitingDecision', 'attentionConflictSummary',
  'attentionReplacementNotSelected', 'attentionReplacementRequiredReason', 'attentionViewShift', 'attentionOpenInventory',
  'attentionTargetWord', 'attentionSubmittedAtPrefix', 'attentionConflictsPopupTitle', 'attentionConflictsPopupHelpAriaLabel',
  'attentionConflictsPopupHelpTitle', 'attentionConflictsPopupHelpBody', 'attentionReviewAll',
  'attentionReviewAllTitle', 'attentionReviewAllHelpAriaLabel', 'attentionReviewAllHelpTitle',
  'attentionReviewAllHelpBody', 'attentionWarningsGroupHeading',
];

test('tManagerDashboard returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of ALL_KEYS) {
      const value = tManagerDashboard(lang, key);
      assert.equal(typeof value, 'string', `tManagerDashboard(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tManagerDashboard(${lang}, ${key}) must not be empty`);
    }
  }
});

// 'colLine' is the LINE messaging platform's brand name -- correctly
// identical in both languages, not an untranslated leak.
const BRAND_NAME_KEYS = new Set<(typeof ALL_KEYS)[number]>(['colLine']);

test('tManagerDashboard ja/en copy differs for every key (no untranslated English leaking through when JA is selected)', () => {
  for (const key of ALL_KEYS) {
    if (BRAND_NAME_KEYS.has(key)) continue;
    assert.notEqual(tManagerDashboard('ja', key), tManagerDashboard('en', key), `tManagerDashboard(ja/en, ${key}) should have distinct copy`);
  }
});

test('scheduleHeadingValue interpolates both dates and differs by language', () => {
  assert.match(scheduleHeadingValue.en('2026-08-10', '2026-08-16'), /2026-08-10/);
  assert.match(scheduleHeadingValue.en('2026-08-10', '2026-08-16'), /2026-08-16/);
  assert.notEqual(scheduleHeadingValue.en('2026-08-10', '2026-08-16'), scheduleHeadingValue.ja('2026-08-10', '2026-08-16'));
});

test('preferencesHeadingValue interpolates both dates and differs by language', () => {
  assert.match(preferencesHeadingValue.ja('2026-08-10', '2026-08-16'), /2026-08-10/);
  assert.notEqual(preferencesHeadingValue.en('2026-08-10', '2026-08-16'), preferencesHeadingValue.ja('2026-08-10', '2026-08-16'));
});

test('breakMinutesValue interpolates the minute count and differs by language', () => {
  assert.match(breakMinutesValue.en(30), /30/);
  assert.match(breakMinutesValue.ja(30), /30/);
  assert.notEqual(breakMinutesValue.en(30), breakMinutesValue.ja(30));
});

test('autoDistributionCreatedMessage and publishedCountMessage interpolate their counts and differ by language', () => {
  assert.match(autoDistributionCreatedMessage.en(4), /4/);
  assert.notEqual(autoDistributionCreatedMessage.en(4), autoDistributionCreatedMessage.ja(4));
  assert.match(publishedCountMessage.ja(6), /6/);
  assert.notEqual(publishedCountMessage.en(6), publishedCountMessage.ja(6));
});

test('attention label helpers interpolate their counts and differ by language', () => {
  for (const helper of [attentionCorrectionLabel, attentionExchangeLabel, attentionInventoryLabel]) {
    assert.match(helper.en(3), /3/);
    assert.match(helper.ja(3), /3/);
    assert.notEqual(helper.en(3), helper.ja(3));
  }
});

test('staffSummaryLabel interpolates both counts and differs by language', () => {
  assert.match(staffSummaryLabel.en(4, 5), /4/);
  assert.match(staffSummaryLabel.en(4, 5), /5/);
  assert.notEqual(staffSummaryLabel.en(4, 5), staffSummaryLabel.ja(4, 5));
});

test('attentionSummarySubtitle shows both halves when both counts are positive, and differs by language', () => {
  assert.match(attentionSummarySubtitle.en(3, 6), /3/);
  assert.match(attentionSummarySubtitle.en(3, 6), /6/);
  assert.notEqual(attentionSummarySubtitle.en(3, 6), attentionSummarySubtitle.ja(3, 6));
});

test('attentionSummarySubtitle omits a zero half instead of claiming "0 warnings"', () => {
  assert.doesNotMatch(attentionSummarySubtitle.en(3, 0), /warning/);
  assert.doesNotMatch(attentionSummarySubtitle.en(0, 5), /action/);
});

test('attentionInventoryShortageSummary interpolates the count and differs by language', () => {
  assert.match(attentionInventoryShortageSummary.en(3), /3/);
  assert.notEqual(attentionInventoryShortageSummary.en(3), attentionInventoryShortageSummary.ja(3));
});

