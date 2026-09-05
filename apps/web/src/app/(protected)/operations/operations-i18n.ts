import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the Operations Configuration slice (Cafe v2.2 WP1
 * Operations, first UI slice -- Manager template/item management only, no
 * scheduling, no task execution). Reuses the existing
 * `LangProvider`/`useLang`/`makeTranslator` mechanism (`@/lib/demo/cafe/i18n`),
 * the same one every other canonical dashboard surface uses -- a new
 * dictionary, not a new i18n system. Japanese is this product's primary
 * end-user language (AGENTS.md); every key ships both languages.
 */
interface OperationsDict {
  pageTitle: string;
  pageDescription: string;
  backToManager: string;
  signOut: string;
  unavailable: string;
  noLocation: string;
  filterActive: string;
  filterRetired: string;
  addTemplateButton: string;
  noTemplatesYet: string;
  noRetiredTemplates: string;
  templateScopeTenantWide: string;
  templateScopeLocation: string;
  templateActiveBadge: string;
  templateRetiredBadge: string;
  newTemplateHeading: string;
  editTemplateHeading: string;
  formNameLabel: string;
  formCategoryLabel: string;
  formDescriptionLabel: string;
  formLocationScopeLabel: string;
  formScopeTenantWide: string;
  formScopeThisLocation: string;
  formSaving: string;
  formSaveChanges: string;
  formCreateTemplate: string;
  formCancel: string;
  editButton: string;
  retireButton: string;
  confirmRetireTemplateTitle: string;
  confirmRetireTemplateBody: string;
  itemsHeading: string;
  noItemsYet: string;
  addItemButton: string;
  itemLabelLabel: string;
  itemResponseTypeLabel: string;
  responseTypeBoolean: string;
  responseTypeNumeric: string;
  responseTypeText: string;
  itemCriticalLabel: string;
  itemRequiredLabel: string;
  itemNumericMinLabel: string;
  itemNumericMaxLabel: string;
  itemNumericUnitLabel: string;
  itemSortOrderLabel: string;
  formAddItem: string;
  formSaveItem: string;
  newItemHeading: string;
  editItemHeading: string;
  replaceItemHeading: string;
  retireItemButton: string;
  confirmRetireItemTitle: string;
  confirmRetireItemBody: string;
  replaceItemButton: string;
  replaceItemIntro: string;
  formSaveReplaceItem: string;
  retiredItemBadge: string;
  criticalBadge: string;
  optionalBadge: string;
  requiredBadge: string;
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  errorNotFound: string;
  errorNotAuthenticated: string;
  errorNoMembership: string;
  errorGeneric: string;
  errNoAuthContext: string;
  errModuleDisabled: string;
  errNameRequired: string;
  errPermissionDenied: string;
  errLocationNotFound: string;
  errTemplateNotFound: string;
  errTemplateAlreadyRetired: string;
  errTemplateRetireRetroactive: string;
  errTemplateRetired: string;
  errItemLabelRequired: string;
  errItemNotFound: string;
  errItemDefinitionFrozen: string;
  schedulesHeading: string;
  addScheduleButton: string;
  noSchedulesYet: string;
  newScheduleHeading: string;
  reviseScheduleHeading: string;
  scheduleRecurrenceLabel: string;
  recurrenceDaily: string;
  recurrenceWeekdays: string;
  weekdayMon: string;
  weekdayTue: string;
  weekdayWed: string;
  weekdayThu: string;
  weekdayFri: string;
  weekdaySat: string;
  weekdaySun: string;
  weekdaySeparator: string;
  dueTimeLabel: string;
  windowEndTimeLabel: string;
  effectiveFromLabel: string;
  effectiveFromRevisionLabel: string;
  effectiveFromHintCreate: string;
  effectiveFromHintRevise: string;
  formCreateSchedule: string;
  formSaveRevision: string;
  scheduleActiveBadge: string;
  scheduleScheduledBadge: string;
  scheduleRetiredBadge: string;
  reviseButton: string;
  deactivateButton: string;
  confirmDeactivateScheduleTitle: string;
  confirmDeactivateScheduleBody: string;
  cancelRevisionButton: string;
  confirmCancelScheduleTitle: string;
  confirmCancelScheduleBody: string;
  errScheduleNotFound: string;
  errScheduleLocationRequired: string;
  errScheduleEffectiveFromRetroactive: string;
  errScheduleRevisionMustBeFuture: string;
  errScheduleRevisionBeforeCurrentVersion: string;
  errScheduleNotCurrentVersion: string;
  errTemplateLocationMismatch: string;
  errScheduleAlreadyRetired: string;
  errScheduleNotYetEffective: string;
  errScheduleDeactivationRetroactive: string;
  errScheduleVersionAlreadyEffective: string;
  errScheduleLaterRevisionExists: string;
  errScheduleVersionNotCancellable: string;
}

const dictionary: Record<Lang, OperationsDict> = {
  en: {
    pageTitle: 'Operations',
    pageDescription: 'Checklist templates for',
    backToManager: 'Back',
    signOut: 'Sign out',
    unavailable: 'Operations is temporarily unavailable.',
    noLocation: 'No location is configured for this workspace yet.',
    filterActive: 'Active',
    filterRetired: 'Retired',
    addTemplateButton: '+ Add template',
    noTemplatesYet: 'No templates yet.',
    noRetiredTemplates: 'No retired templates.',
    templateScopeTenantWide: 'All locations',
    templateScopeLocation: 'This location',
    templateActiveBadge: 'Active',
    templateRetiredBadge: 'Retired',
    newTemplateHeading: 'New template',
    editTemplateHeading: 'Edit template',
    formNameLabel: 'Name',
    formCategoryLabel: 'Category (optional)',
    formDescriptionLabel: 'Description (optional)',
    formLocationScopeLabel: 'Scope',
    formScopeTenantWide: 'All locations (tenant-wide)',
    formScopeThisLocation: 'This location only',
    formSaving: 'Saving…',
    formSaveChanges: 'Save changes',
    formCreateTemplate: 'Create template',
    formCancel: 'Cancel',
    editButton: 'Edit',
    retireButton: 'Retire',
    confirmRetireTemplateTitle: 'Retire this template?',
    confirmRetireTemplateBody:
      'Retiring is permanent going forward: this template will stop generating new tasks after today. Past history is kept.',
    itemsHeading: 'Checklist items',
    noItemsYet: 'No items yet.',
    addItemButton: '+ Add item',
    itemLabelLabel: 'Label',
    itemResponseTypeLabel: 'Response type',
    responseTypeBoolean: 'Yes / No',
    responseTypeNumeric: 'Number',
    responseTypeText: 'Text',
    itemCriticalLabel: 'Critical',
    itemRequiredLabel: 'Required',
    itemNumericMinLabel: 'Minimum',
    itemNumericMaxLabel: 'Maximum',
    itemNumericUnitLabel: 'Unit',
    itemSortOrderLabel: 'Order',
    formAddItem: 'Add item',
    formSaveItem: 'Save item',
    newItemHeading: 'New item',
    editItemHeading: 'Edit item',
    replaceItemHeading: 'Replace item',
    retireItemButton: 'Retire',
    confirmRetireItemTitle: 'Retire this item?',
    confirmRetireItemBody: 'Past responses are kept. This item will no longer be part of the checklist going forward.',
    replaceItemButton: 'Change response type',
    replaceItemIntro:
      'This item has already been used, so its response type can no longer be edited directly. Saving here will retire the current item (keeping its history) and create a new one with the new response type.',
    formSaveReplaceItem: 'Retire and create new item',
    retiredItemBadge: 'Retired',
    criticalBadge: 'Critical',
    optionalBadge: 'Optional',
    requiredBadge: 'Required',
    popupHelpAriaLabel: 'About Operations',
    popupHelpTitle: 'About Operations',
    popupHelpBody:
      'Templates are reusable checklists (e.g. Opening, Closing, Cleaning). Each template has a list of items to check. A tenant-wide template applies to every location; a location-scoped one applies only to that location. Retiring a template or item is permanent going forward -- past history is always kept.',
    errorNotFound: 'Not found.',
    errorNotAuthenticated: 'Please sign in again.',
    errorNoMembership: 'You are not a member of this workspace.',
    errorGeneric: 'Something went wrong. Please try again.',
    errNoAuthContext: 'Please sign in again.',
    errModuleDisabled: 'Operations is not enabled for this workspace.',
    errNameRequired: 'A name is required.',
    errPermissionDenied: 'You do not have permission to do this.',
    errLocationNotFound: 'That location could not be found.',
    errTemplateNotFound: 'This template could not be found.',
    errTemplateAlreadyRetired: 'This template has already been retired.',
    errTemplateRetireRetroactive: 'The retirement date cannot be in the past.',
    errTemplateRetired: 'This template has been retired and can no longer be changed.',
    errItemLabelRequired: 'A label is required.',
    errItemNotFound: 'This item could not be found.',
    errItemDefinitionFrozen: 'This has already been used, so it can no longer be changed this way. Use "Change response type" instead.',
    schedulesHeading: 'Schedule',
    addScheduleButton: '+ Add schedule',
    noSchedulesYet: 'No schedule yet. Add one to start generating tasks from this template.',
    newScheduleHeading: 'New schedule',
    reviseScheduleHeading: 'Revise schedule',
    scheduleRecurrenceLabel: 'Recurrence',
    recurrenceDaily: 'Every day',
    recurrenceWeekdays: 'Selected days',
    weekdayMon: 'Mon',
    weekdayTue: 'Tue',
    weekdayWed: 'Wed',
    weekdayThu: 'Thu',
    weekdayFri: 'Fri',
    weekdaySat: 'Sat',
    weekdaySun: 'Sun',
    weekdaySeparator: ', ',
    dueTimeLabel: 'Due time',
    windowEndTimeLabel: 'Window end (optional)',
    effectiveFromLabel: 'Starts on',
    effectiveFromRevisionLabel: 'Takes effect on',
    effectiveFromHintCreate: 'Leave blank to start today.',
    effectiveFromHintRevise: 'Leave blank to take effect from tomorrow. Must be a future date.',
    formCreateSchedule: 'Create schedule',
    formSaveRevision: 'Save revision',
    scheduleActiveBadge: 'Active',
    scheduleScheduledBadge: 'Scheduled',
    scheduleRetiredBadge: 'Retired',
    reviseButton: 'Revise',
    deactivateButton: 'Deactivate',
    confirmDeactivateScheduleTitle: 'Deactivate this schedule?',
    confirmDeactivateScheduleBody:
      'This schedule will stop generating new tasks after the boundary date. Past history is kept.',
    cancelRevisionButton: 'Cancel this revision',
    confirmCancelScheduleTitle: 'Cancel this scheduled revision?',
    confirmCancelScheduleBody: 'This upcoming change has not taken effect yet and will be removed. The current schedule continues unchanged.',
    errScheduleNotFound: 'This schedule could not be found.',
    errScheduleLocationRequired: 'A location is required.',
    errScheduleEffectiveFromRetroactive: 'The start date cannot be in the past.',
    errScheduleRevisionMustBeFuture: 'The revision date must be in the future.',
    errScheduleRevisionBeforeCurrentVersion: 'The revision date must be after the current version started.',
    errScheduleNotCurrentVersion: 'Only the current version of a schedule can be revised.',
    errTemplateLocationMismatch: 'This template belongs to a different location.',
    errScheduleAlreadyRetired: 'This schedule has already been retired.',
    errScheduleNotYetEffective: 'This schedule has not started yet.',
    errScheduleDeactivationRetroactive: 'The end date cannot be in the past.',
    errScheduleVersionAlreadyEffective: 'This revision has already taken effect and can no longer be cancelled.',
    errScheduleLaterRevisionExists: 'A later revision exists. Cancel that one first.',
    errScheduleVersionNotCancellable: 'This revision can no longer be cancelled.',
  },
  ja: {
    pageTitle: 'オペレーション',
    pageDescription: 'チェックリストテンプレート -',
    backToManager: '戻る',
    signOut: 'サインアウト',
    unavailable: 'オペレーションは一時的に利用できません。',
    noLocation: 'この店舗にはまだ拠点が設定されていません。',
    filterActive: '有効',
    filterRetired: '廃止済み',
    addTemplateButton: '+ テンプレートを追加',
    noTemplatesYet: 'まだテンプレートがありません。',
    noRetiredTemplates: '廃止済みのテンプレートはありません。',
    templateScopeTenantWide: '全拠点',
    templateScopeLocation: 'この拠点のみ',
    templateActiveBadge: '有効',
    templateRetiredBadge: '廃止済み',
    newTemplateHeading: '新規テンプレート',
    editTemplateHeading: 'テンプレートを編集',
    formNameLabel: '名前',
    formCategoryLabel: 'カテゴリー（任意）',
    formDescriptionLabel: '説明（任意）',
    formLocationScopeLabel: '適用範囲',
    formScopeTenantWide: '全拠点（テナント共通）',
    formScopeThisLocation: 'この拠点のみ',
    formSaving: '保存中…',
    formSaveChanges: '変更を保存',
    formCreateTemplate: 'テンプレートを作成',
    formCancel: 'キャンセル',
    editButton: '編集',
    retireButton: '廃止する',
    confirmRetireTemplateTitle: 'このテンプレートを廃止しますか？',
    confirmRetireTemplateBody: '廃止は今後に対して取り消せません。本日以降は新しいタスクが生成されなくなります。過去の履歴は保持されます。',
    itemsHeading: 'チェック項目',
    noItemsYet: 'まだ項目がありません。',
    addItemButton: '+ 項目を追加',
    itemLabelLabel: 'ラベル',
    itemResponseTypeLabel: '回答形式',
    responseTypeBoolean: 'はい／いいえ',
    responseTypeNumeric: '数値',
    responseTypeText: 'テキスト',
    itemCriticalLabel: '重要',
    itemRequiredLabel: '必須',
    itemNumericMinLabel: '最小値',
    itemNumericMaxLabel: '最大値',
    itemNumericUnitLabel: '単位',
    itemSortOrderLabel: '表示順',
    formAddItem: '項目を追加',
    formSaveItem: '項目を保存',
    newItemHeading: '新規項目',
    editItemHeading: '項目を編集',
    replaceItemHeading: '項目を差し替え',
    retireItemButton: '廃止する',
    confirmRetireItemTitle: 'この項目を廃止しますか？',
    confirmRetireItemBody: '過去の回答は保持されます。今後このチェックリストには含まれなくなります。',
    replaceItemButton: '回答形式を変更',
    replaceItemIntro:
      'この項目はすでに使用されているため、回答形式を直接編集できません。保存すると、現在の項目は廃止（履歴は保持）され、新しい回答形式で新しい項目が作成されます。',
    formSaveReplaceItem: '廃止して新しい項目を作成',
    retiredItemBadge: '廃止済み',
    criticalBadge: '重要',
    optionalBadge: '任意',
    requiredBadge: '必須',
    popupHelpAriaLabel: 'オペレーションについて',
    popupHelpTitle: 'オペレーションについて',
    popupHelpBody:
      'テンプレートは再利用可能なチェックリストです（例：開店・閉店・清掃）。各テンプレートには確認する項目のリストがあります。全拠点向けのテンプレートはすべての拠点に適用され、拠点限定のテンプレートはその拠点のみに適用されます。テンプレートや項目の廃止は今後に対して取り消せませんが、過去の履歴は常に保持されます。',
    errorNotFound: '見つかりませんでした。',
    errorNotAuthenticated: 'もう一度サインインしてください。',
    errorNoMembership: 'このワークスペースのメンバーではありません。',
    errorGeneric: 'エラーが発生しました。もう一度お試しください。',
    errNoAuthContext: 'もう一度サインインしてください。',
    errModuleDisabled: 'このワークスペースではオペレーションが有効になっていません。',
    errNameRequired: '名前を入力してください。',
    errPermissionDenied: 'この操作を行う権限がありません。',
    errLocationNotFound: 'その拠点が見つかりませんでした。',
    errTemplateNotFound: 'このテンプレートが見つかりませんでした。',
    errTemplateAlreadyRetired: 'このテンプレートはすでに廃止されています。',
    errTemplateRetireRetroactive: '廃止日を過去の日付にすることはできません。',
    errTemplateRetired: 'このテンプレートは廃止済みのため変更できません。',
    errItemLabelRequired: 'ラベルを入力してください。',
    errItemNotFound: 'この項目が見つかりませんでした。',
    errItemDefinitionFrozen: 'すでに使用されているため、この方法では変更できません。「回答形式を変更」をご利用ください。',
    schedulesHeading: 'スケジュール',
    addScheduleButton: '+ スケジュールを追加',
    noSchedulesYet: 'まだスケジュールがありません。追加するとこのテンプレートからタスクが生成されます。',
    newScheduleHeading: '新規スケジュール',
    reviseScheduleHeading: 'スケジュールを変更',
    scheduleRecurrenceLabel: '繰り返し',
    recurrenceDaily: '毎日',
    recurrenceWeekdays: '曜日を指定',
    weekdayMon: '月',
    weekdayTue: '火',
    weekdayWed: '水',
    weekdayThu: '木',
    weekdayFri: '金',
    weekdaySat: '土',
    weekdaySun: '日',
    weekdaySeparator: '・',
    dueTimeLabel: '実施時刻',
    windowEndTimeLabel: '受付終了時刻（任意）',
    effectiveFromLabel: '開始日',
    effectiveFromRevisionLabel: '適用開始日',
    effectiveFromHintCreate: '空欄の場合は本日から開始します。',
    effectiveFromHintRevise: '空欄の場合は明日から適用されます。未来の日付を指定してください。',
    formCreateSchedule: 'スケジュールを作成',
    formSaveRevision: '変更を保存',
    scheduleActiveBadge: '有効',
    scheduleScheduledBadge: '予定',
    scheduleRetiredBadge: '廃止済み',
    reviseButton: '変更する',
    deactivateButton: '停止する',
    confirmDeactivateScheduleTitle: 'このスケジュールを停止しますか？',
    confirmDeactivateScheduleBody: '指定した日以降、新しいタスクは生成されなくなります。過去の履歴は保持されます。',
    cancelRevisionButton: 'この変更を取り消す',
    confirmCancelScheduleTitle: 'この予定された変更を取り消しますか？',
    confirmCancelScheduleBody: 'この変更はまだ適用されておらず、取り消すと削除されます。現在のスケジュールはそのまま継続されます。',
    errScheduleNotFound: 'このスケジュールが見つかりませんでした。',
    errScheduleLocationRequired: '拠点を指定してください。',
    errScheduleEffectiveFromRetroactive: '開始日を過去の日付にすることはできません。',
    errScheduleRevisionMustBeFuture: '変更の適用日は未来の日付である必要があります。',
    errScheduleRevisionBeforeCurrentVersion: '変更の適用日は現在のバージョンの開始日より後である必要があります。',
    errScheduleNotCurrentVersion: '現在有効なスケジュールのみ変更できます。',
    errTemplateLocationMismatch: 'このテンプレートは別の拠点のものです。',
    errScheduleAlreadyRetired: 'このスケジュールはすでに停止されています。',
    errScheduleNotYetEffective: 'このスケジュールはまだ開始されていません。',
    errScheduleDeactivationRetroactive: '終了日を過去の日付にすることはできません。',
    errScheduleVersionAlreadyEffective: 'この変更はすでに適用されているため取り消せません。',
    errScheduleLaterRevisionExists: 'さらに後の変更が存在します。先にそちらを取り消してください。',
    errScheduleVersionNotCancellable: 'この変更は取り消せません。',
  },
};

export const tOperations = makeTranslator(dictionary);
export type OperationsDictKey = Parameters<typeof tOperations>[1];
