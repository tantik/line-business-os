import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tOperations } from './operations-i18n.js';

/**
 * Operations Configuration slice (Manager Templates/Items UI): every key
 * must render a non-empty, distinct JA/EN string -- mirrors
 * `recipes-i18n.test.ts`'s exact shape.
 */
const LANGS = ['ja', 'en'] as const;
const KEYS: Parameters<typeof tOperations>[1][] = [
  'pageTitle', 'pageDescription', 'backToManager', 'signOut', 'unavailable', 'noLocation',
  'filterActive', 'filterRetired', 'addTemplateButton', 'noTemplatesYet', 'noRetiredTemplates',
  'templateScopeTenantWide', 'templateScopeLocation', 'templateActiveBadge', 'templateRetiredBadge',
  'newTemplateHeading', 'editTemplateHeading', 'formNameLabel', 'formCategoryLabel', 'formDescriptionLabel',
  'formLocationScopeLabel', 'formScopeTenantWide', 'formScopeThisLocation', 'formSaving', 'formSaveChanges',
  'formCreateTemplate', 'formCancel', 'editButton', 'retireButton',
  'confirmRetireTemplateTitle', 'confirmRetireTemplateBody',
  'itemsHeading', 'noItemsYet', 'addItemButton', 'itemLabelLabel', 'itemResponseTypeLabel',
  'responseTypeBoolean', 'responseTypeNumeric', 'responseTypeText', 'itemCriticalLabel', 'itemRequiredLabel',
  'itemNumericMinLabel', 'itemNumericMaxLabel', 'itemNumericUnitLabel', 'itemSortOrderLabel',
  'formAddItem', 'formSaveItem', 'newItemHeading', 'editItemHeading', 'replaceItemHeading',
  'retireItemButton', 'confirmRetireItemTitle', 'confirmRetireItemBody',
  'replaceItemButton', 'replaceItemIntro', 'formSaveReplaceItem',
  'retiredItemBadge', 'criticalBadge', 'optionalBadge', 'requiredBadge',
  'popupHelpAriaLabel', 'popupHelpTitle', 'popupHelpBody',
  'errorNotFound', 'errorNotAuthenticated', 'errorNoMembership', 'errorGeneric',
  'errNoAuthContext', 'errModuleDisabled', 'errNameRequired', 'errPermissionDenied', 'errLocationNotFound',
  'errTemplateNotFound', 'errTemplateAlreadyRetired', 'errTemplateRetireRetroactive', 'errTemplateRetired',
  'errItemLabelRequired', 'errItemNotFound', 'errItemDefinitionFrozen',
  'schedulesHeading', 'addScheduleButton', 'noSchedulesYet', 'newScheduleHeading', 'reviseScheduleHeading',
  'scheduleRecurrenceLabel', 'recurrenceDaily', 'recurrenceWeekdays',
  'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun', 'weekdaySeparator',
  'dueTimeLabel', 'windowEndTimeLabel', 'effectiveFromLabel', 'effectiveFromRevisionLabel',
  'effectiveFromHintCreate', 'effectiveFromHintRevise', 'formCreateSchedule', 'formSaveRevision',
  'scheduleActiveBadge', 'scheduleScheduledBadge', 'scheduleRetiredBadge',
  'reviseButton', 'deactivateButton', 'confirmDeactivateScheduleTitle', 'confirmDeactivateScheduleBody',
  'cancelRevisionButton', 'confirmCancelScheduleTitle', 'confirmCancelScheduleBody',
  'errScheduleNotFound', 'errScheduleLocationRequired', 'errScheduleEffectiveFromRetroactive',
  'errScheduleRevisionMustBeFuture', 'errScheduleRevisionBeforeCurrentVersion', 'errScheduleNotCurrentVersion',
  'errTemplateLocationMismatch', 'errScheduleAlreadyRetired', 'errScheduleNotYetEffective',
  'errScheduleDeactivationRetroactive', 'errScheduleVersionAlreadyEffective', 'errScheduleLaterRevisionExists',
  'errScheduleVersionNotCancellable',
  'errItemNotInScheduleTemplate', 'errItemInactive', 'errResponseRequiresExactlyOneValue', 'errResponseTypeMismatch',
  'errTaskAlreadyCompleted', 'errTaskNotStarted', 'errRequiredItemsIncomplete', 'errInvalidSeverity',
  'staffPageTitle', 'staffPageDescription', 'backToStaff', 'staffNoTasksToday',
  'taskStateNotStarted', 'taskStateInProgress', 'taskStateOverdue', 'taskStateCompleted',
  'taskDueAt', 'taskWindowUntil', 'taskOpenExceptions',
  'checklistHeading', 'noChecklistItems', 'itemMissingHint', 'responseSaving', 'responseSaved',
  'reportProblemButton', 'reportProblemForItemButton', 'reportProblemHeading', 'reportProblemNoteLabel',
  'reportProblemSeverityLabel', 'severityWarning', 'severityActionRequired', 'reportProblemSubmit', 'problemReported',
  'completeTaskButton', 'taskCompletedNote', 'numericRangeHint',
  'thresholdNotConfiguredManager', 'thresholdNotConfiguredStaff', 'backToTaskList',
  'sectionTemplatesTab', 'sectionTodayTab', 'sectionAttentionTab', 'todayNoTasksToday',
  'attentionNoOpenExceptions', 'attentionSourceThreshold', 'attentionSourceReported',
  'attentionItemLabel', 'attentionUnknownTask', 'attentionOpenedAtLabel',
  'resolveButton', 'resolveNoteLabel', 'resolveSubmit',
  'errExceptionNotFound', 'errExceptionAlreadyResolved',
];

test('tOperations returns a non-empty string for every key in both languages', () => {
  for (const lang of LANGS) {
    for (const key of KEYS) {
      const value = tOperations(lang, key);
      assert.equal(typeof value, 'string', `tOperations(${lang}, ${key}) must return a string`);
      assert.ok(value.length > 0, `tOperations(${lang}, ${key}) must not be empty`);
    }
  }
});

test('tOperations ja/en copy differs for every key', () => {
  for (const key of KEYS) {
    assert.notEqual(tOperations('ja', key), tOperations('en', key), `key ${key} should have distinct ja/en copy`);
  }
});
