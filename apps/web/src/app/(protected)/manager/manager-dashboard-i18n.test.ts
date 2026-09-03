import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attentionCorrectionLabel,
  attentionExchangeLabel,
  attentionInventoryLabel,
  attentionInventoryShortageSummary,
  attentionSummarySubtitle,
  autoCreateConfigErrorMessage,
  autoCreateCreatedMessage,
  autoCreateLastResultSummary,
  autoCreateShortageLine,
  autoCreateUnplacedLine,
  breakMinutesValue,
  scheduleHeadingValue,
  staffSummaryLabel,
  tManagerDashboard,
  unplacedReasonLabel,
  windowCodeLabel,
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
  'actionsHeading', 'confirmUnassignShift',
  'scheduleHelpAriaLabel', 'scheduleHelpTitle', 'scheduleHelpBody',
  'pendingCorrectionCellAriaLabel',
  'staffPopupHelpAriaLabel', 'staffPopupHelpTitle', 'staffPopupHelpBody',
  'staffNamePopupTitlePrefix', 'staffNamePopupMonth', 'staffNamePopupWorkedHours', 'staffNamePopupHourlyWage',
  'staffNamePopupEarnedSoFar', 'staffNamePopupCopyReport', 'staffNamePopupCopied', 'staffNamePopupCopyFailed',
  'settingsCardTitle', 'settingsHelpBody', 'requiredHeadcountHeading', 'maxWorkHoursLabel', 'weekdayAriaSuffix', 'nameLabel', 'optionalNameLabel',
  'startTimeLabel', 'endTimeLabel', 'addShiftType', 'deactivateShiftTypeButton', 'confirmDeactivateShiftTypeTitle',
  'confirmDeactivateShiftTypeBody', 'showDeactivatedShiftTypes', 'hideDeactivatedShiftTypes', 'deactivatedShiftTypesHeading',
  'deactivatedShiftTypesEmpty', 'reactivate', 'savingStatus', 'savedStatus', 'saveErrorStatus', 'duplicateShiftTypeName',
  'shiftTypesHeading', 'shiftTypesUnavailable', 'shiftTypesEmpty', 'colCode', 'colLabel', 'colTime', 'colBreak',
  'fieldEmployee', 'fieldShiftType', 'shiftTypeCustom', 'fieldStart', 'fieldEnd', 'fieldBreakMinutes', 'save',
  'shiftAlreadyVisibleNotice', 'confirmChangeScheduledShiftTitle', 'correctingPastScheduleNotice', 'reassignEmployeeButton',
  'assignCellAriaLabelPrefix', 'editCellAriaLabelPrefix', 'correctPastScheduleAriaLabelPrefix',
  'automationSectionHeading', 'automationCreateOnLabel', 'automationDayOfMonthSuffix',
  'automationHelpAriaLabel', 'automationHelpTitle', 'automationHelpBody',
  'automationComingSoonNote', 'automationManualCreateButton', 'automationManualCreateRunning',
  'automationLastResultHeading',
  'autoCreateConfirmTitle', 'autoCreateConfirmBody', 'autoCreateResultTitle', 'autoCreateManualPreservedNote',
  'autoCreateShortagesHeading', 'autoCreateUnplacedHeading', 'autoCreateNonSubmittersHeading', 'autoCreateNoIssues',
  'autoCreateUndoButton', 'autoCreateUndoing', 'autoCreateUndone',
  'estimatedLabourCostLabel',
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
  'exchangeApproved', 'exchangeRejected', 'replacementAssigned',
  'attentionItemCorrectionTitle', 'attentionItemExchangeTitle',
  'attentionItemConflictTitle', 'attentionItemInventoryTitle', 'attentionWaitingDecision', 'attentionConflictSummary',
  'attentionReplacementNotSelected', 'attentionReplacementRequiredReason', 'attentionViewShift', 'attentionOpenInventory',
  'attentionTargetWord', 'attentionSubmittedAtPrefix', 'attentionConflictsPopupTitle', 'attentionConflictsPopupHelpAriaLabel',
  'attentionConflictsPopupHelpTitle', 'attentionConflictsPopupHelpBody', 'attentionReviewAll',
  'attentionReviewAllTitle', 'attentionReviewAllHelpAriaLabel', 'attentionReviewAllHelpTitle',
  'attentionReviewAllHelpBody', 'attentionWarningsGroupHeading',
  // Staff<->Manager Mail module (0090)
  'mailChipTitle', 'mailHeading', 'mailEmptyThreads', 'mailBackToThreads', 'mailArchivedTag',
  'mailMoreActionsAriaLabel', 'mailMarkRead', 'mailArchive', 'mailComposePlaceholder',
  'mailSend', 'mailSending',
  'mailPopupHelpAriaLabel', 'mailPopupHelpTitle', 'mailPopupHelpBody',
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

test('breakMinutesValue interpolates the minute count and differs by language', () => {
  assert.match(breakMinutesValue.en(30), /30/);
  assert.match(breakMinutesValue.ja(30), /30/);
  assert.notEqual(breakMinutesValue.en(30), breakMinutesValue.ja(30));
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

test('windowCodeLabel covers every window code in both languages with distinct JA/EN copy', () => {
  for (const code of ['AM', 'PM', 'ALL', 'A-P', 'SHORT_AM'] as const) {
    assert.ok(windowCodeLabel.ja[code].length > 0);
    assert.ok(windowCodeLabel.en[code].length > 0);
    assert.notEqual(windowCodeLabel.ja[code], windowCodeLabel.en[code]);
  }
});

test('unplacedReasonLabel returns non-empty, language-distinct copy for every reason', () => {
  for (const reason of [
    'headcount_filled',
    'no_staffing_requirement',
    'max_period_hours_exceeded',
    'already_assigned',
    'unknown_shift_type',
    'inactive_shift_type',
  ] as const) {
    assert.ok(unplacedReasonLabel.ja(reason).length > 0);
    assert.notEqual(unplacedReasonLabel.ja(reason), unplacedReasonLabel.en(reason));
  }
});

test('autoCreateConfigErrorMessage returns distinct JA/EN copy for each invalid-config reason', () => {
  for (const reason of ['no_active_windows', 'no_staffing_requirement'] as const) {
    assert.ok(autoCreateConfigErrorMessage.ja(reason).length > 0);
    assert.notEqual(autoCreateConfigErrorMessage.ja(reason), autoCreateConfigErrorMessage.en(reason));
  }
});

test('autoCreateLastResultSummary always shows the created count and omits zero attention counts', () => {
  assert.match(autoCreateLastResultSummary.en(5, 0, 0, 0), /5/);
  assert.doesNotMatch(autoCreateLastResultSummary.en(5, 0, 0, 0), /short|unassigned|preferences/);
  const full = autoCreateLastResultSummary.en(5, 2, 1, 3);
  assert.match(full, /2 short/);
  assert.match(full, /1 unassigned/);
  assert.notEqual(autoCreateLastResultSummary.en(5, 2, 1, 3), autoCreateLastResultSummary.ja(5, 2, 1, 3));
});

test('auto-create result line builders interpolate their inputs and differ by language', () => {
  assert.match(autoCreateCreatedMessage.en(3), /3/);
  assert.notEqual(autoCreateCreatedMessage.en(3), autoCreateCreatedMessage.ja(3));
  assert.match(autoCreateShortageLine.en('2026-09-07', 'Morning', 2), /2026-09-07/);
  assert.match(autoCreateShortageLine.ja('2026-09-07', '午前', 2), /午前/);
  assert.notEqual(autoCreateShortageLine.en('2026-09-07', 'x', 1), autoCreateShortageLine.ja('2026-09-07', 'x', 1));
  assert.match(autoCreateUnplacedLine.en('Aki', '2026-09-07', 'full'), /Aki/);
  assert.notEqual(autoCreateUnplacedLine.en('Aki', '2026-09-07', 'x'), autoCreateUnplacedLine.ja('Aki', '2026-09-07', 'x'));
});

test('Manager help copy describes user outcomes without internal implementation terms', () => {
  const helpKeys = [
    'attentionConflictsPopupHelpBody',
    'attentionReviewAllHelpBody',
    'scheduleHelpBody',
    'staffPopupHelpBody',
    'settingsHelpBody',
    'automationHelpBody',
    'shiftRequestsPopupHelpBody',
    'correctionsPopupHelpBody',
    'exchangesPopupHelpBody',
    'mailPopupHelpBody',
  ] as const;

  for (const lang of LANGS) {
    for (const key of helpKeys) {
      const copy = tManagerDashboard(lang, key);
      assert.doesNotMatch(copy, /guardrail|reusable template|internal algorithm|API|database|RLS|tenant/i);
    }
  }
});

