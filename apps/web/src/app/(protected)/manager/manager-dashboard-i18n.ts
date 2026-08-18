import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical dashboard Manager surface (Cafe v2.1
 * Mission 2). The Manager dashboard previously had no `LangProvider`/
 * `useLang` mechanism at all (English-only, unlike the canonical Staff
 * dashboard) -- this is the first adoption of the existing
 * `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`) on this page, following the exact pattern
 * `staff-dashboard-i18n.ts` already established. Japanese is the default
 * language (`LangProvider`'s own default), matching the Japanese-first
 * product baseline.
 *
 * All newly authored Japanese copy in this file is machine-translated by
 * an AI agent and NEEDS NATIVE JAPANESE REVIEW before being relied on as
 * final customer-facing copy.
 */
interface ManagerDashboardDict {
  // Attention layer
  attentionHeading: string;
  attentionAllClear: string;
  attentionReview: string;
  // Attention layer -- compact card-row titles (short, distinct from the
  // full-sentence attentionXxxLabel functions in this file, which are used
  // as the card's aria-label so screen readers still get the full sentence)
  attentionCorrectionTitle: string;
  attentionExchangeTitle: string;
  attentionUnavailableConflictTitle: string;
  attentionInventoryTitle: string;
  // Staff section
  staffHeading: string;
  manageStaff: string;
  addStaff: string;
  staffUnavailable: string;
  staffEmpty: string;
  searchStaffPlaceholder: string;
  filterAll: string;
  noStaffMatch: string;
  colName: string;
  colPosition: string;
  colEmploymentType: string;
  colStatus: string;
  colLine: string;
  colActions: string;
  statusActive: string;
  statusInactive: string;
  edit: string;
  activate: string;
  deactivate: string;
  saving: string;
  confirmDeactivate: string;
  // Staff form (Add/Edit modal)
  fieldName: string;
  fieldFamilyName: string;
  fieldGivenName: string;
  fieldEmail: string;
  fieldPosition: string;
  fieldEmploymentType: string;
  addStaffSubmit: string;
  saveChanges: string;
  cancel: string;
  // Shared write-error chrome (staff form + shift cell editor)
  errorNotFound: string;
  errorNotAuthenticated: string;
  errorNoMembership: string;
  errorStaleReference: string;
  // Weekly schedule section
  prevWeek: string;
  thisWeek: string;
  nextWeek: string;
  addStaffToSeeSchedule: string;
  colStaff: string;
  assign: string;
  unassign: string;
  unassigning: string;
  statusPublished: string;
  statusDraft: string;
  publishedReadOnly: string;
  actionsHeading: string;
  autoDistributionDescription: string;
  runAutoDistribution: string;
  running: string;
  undoAutoDistribution: string;
  undoing: string;
  autoDistributionUndone: string;
  publishSchedule: string;
  publishing: string;
  confirmPublish: string;
  confirmUnassignShift: string;
  scheduleHelpAriaLabel: string;
  scheduleHelpTitle: string;
  scheduleHelpBody: string;
  // Staff-name detail popup (A6)
  staffNamePopupTitlePrefix: string;
  staffNamePopupMonth: string;
  staffNamePopupWorkedHours: string;
  staffNamePopupHourlyWage: string;
  staffNamePopupEarnedSoFar: string;
  staffNamePopupCopyReport: string;
  staffNamePopupCopied: string;
  staffNamePopupCopyFailed: string;
  // Estimated labour cost (A7)
  labourCostHeading: string;
  labourCostHelpAriaLabel: string;
  labourCostHelpTitle: string;
  labourCostHelpBody: string;
  labourCostEmpty: string;
  labourCostTotal: string;
  // Shift types section
  shiftTypesHeading: string;
  shiftTypesUnavailable: string;
  shiftTypesEmpty: string;
  colCode: string;
  colLabel: string;
  colTime: string;
  colBreak: string;
  // Shift cell editor
  fieldEmployee: string;
  fieldShiftType: string;
  shiftTypeCustom: string;
  fieldStart: string;
  fieldEnd: string;
  fieldBreakMinutes: string;
  save: string;
  // Submitted shift preferences
  preferencesUnavailable: string;
  preferencesEmpty: string;
  colDate: string;
  colPreference: string;
  unavailableValue: string;
  // Correction requests
  correctionsHeading: string;
  correctionsUnavailable: string;
  needsActionEyebrow: string;
  noPendingCorrections: string;
  colMessage: string;
  colAttendance: string;
  colRequested: string;
  colTransportation: string;
  colDailyMessage: string;
  approve: string;
  reject: string;
  recentlyDecided: string;
  colStatus2: string;
  // Shift exchange requests
  exchangesHeading: string;
  exchangesUnavailable: string;
  noPendingExchanges: string;
  colRequester: string;
  colShift: string;
  colRequest: string;
  colReason: string;
  requestKindCancellation: string;
  requestKindChange: string;
  requestKindExchange: string;
  awaitingCandidate: string;
  // Page chrome
  pageTitle: string;
  signOut: string;
  navRecipes: string;
  navInventory: string;
  // Footer
  backToWorkforce: string;
  // Banner messages
  staffActivated: string;
  staffDeactivated: string;
  shiftUnassigned: string;
  correctionApproved: string;
  correctionRejected: string;
  exchangeApproved: string;
  exchangeRejected: string;
  draftShiftsLabel: string;
  shortagesLabel: string;
  unplacedLabel: string;
  nonSubmittersLabel: string;
  // LINE link form (F3)
  lineUserIdPlaceholder: string;
  bind: string;
  binding: string;
  unbindLine: string;
  unbinding: string;
  confirmUnbindLine: string;
}

const dictionary: Record<Lang, ManagerDashboardDict> = {
  en: {
    attentionHeading: 'Needs attention',
    attentionAllClear: 'Nothing needs your attention right now.',
    attentionReview: 'Review',
    attentionCorrectionTitle: 'Attendance corrections',
    attentionExchangeTitle: 'Shift exchanges',
    attentionUnavailableConflictTitle: 'Unavailable conflicts',
    attentionInventoryTitle: 'Inventory shortage',
    staffHeading: 'Staff',
    manageStaff: 'Manage staff',
    addStaff: '+ Add staff',
    staffUnavailable: 'Staff list is temporarily unavailable.',
    staffEmpty: 'No staff added yet.',
    searchStaffPlaceholder: 'Search by name, position, or employment type',
    filterAll: 'All',
    noStaffMatch: 'No staff match your search.',
    colName: 'Name',
    colPosition: 'Position',
    colEmploymentType: 'Employment type',
    colStatus: 'Status',
    colLine: 'LINE',
    colActions: 'Actions',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    edit: 'Edit',
    activate: 'Activate',
    deactivate: 'Deactivate',
    saving: 'Saving...',
    confirmDeactivate: 'Deactivate this staff member?',
    fieldName: 'Name',
    fieldFamilyName: 'Family name',
    fieldGivenName: 'Given name',
    fieldEmail: 'Email',
    fieldPosition: 'Position',
    fieldEmploymentType: 'Employment type',
    addStaffSubmit: 'Add staff',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    errorNotFound: 'Not found.',
    errorNotAuthenticated: 'Please sign in again.',
    errorNoMembership: 'You are not a member of this workspace.',
    errorStaleReference: 'This request is no longer up to date — the shift may have changed, or another manager may have already decided it. Refresh to see the latest state.',
    prevWeek: 'Prev week',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    addStaffToSeeSchedule: 'Add staff to see the weekly schedule.',
    colStaff: 'Staff',
    assign: 'Assign',
    unassign: 'Unassign',
    unassigning: 'Unassigning...',
    statusPublished: 'Published',
    statusDraft: 'Draft',
    publishedReadOnly: 'Published -- read-only',
    actionsHeading: 'Actions',
    autoDistributionDescription:
      'Auto-distribution uses a fixed cafe default (1 staff for the AM window, 1 for the PM window, every day) -- there is no settings screen for this yet.',
    runAutoDistribution: 'Run auto-distribution',
    running: 'Running...',
    undoAutoDistribution: 'Undo auto-distribution',
    undoing: 'Undoing...',
    autoDistributionUndone: 'Auto-distribution undone -- the draft shifts it created are unassigned again.',
    publishSchedule: 'Publish schedule',
    publishing: 'Publishing...',
    confirmPublish: 'Publish all draft shifts for this week? Staff will be able to see them.',
    confirmUnassignShift: 'Remove this staff member from this shift?',
    scheduleHelpAriaLabel: 'About the shift schedule',
    scheduleHelpTitle: 'About the shift schedule',
    scheduleHelpBody:
      'Assign staff to open cells, then use "Run auto-distribution" to fill remaining shifts automatically. Nothing is visible to staff until you press "Publish schedule".',
    staffNamePopupTitlePrefix: 'Staff',
    staffNamePopupMonth: 'Month',
    staffNamePopupWorkedHours: 'Worked hours (this month)',
    staffNamePopupHourlyWage: 'Hourly rate',
    staffNamePopupEarnedSoFar: 'Earned so far',
    staffNamePopupCopyReport: 'Copy monthly report',
    staffNamePopupCopied: 'Copied.',
    staffNamePopupCopyFailed: 'Could not copy -- please copy the numbers manually.',
    labourCostHeading: 'Estimated labour cost',
    labourCostHelpAriaLabel: 'About estimated labour cost',
    labourCostHelpTitle: 'About estimated labour cost',
    labourCostHelpBody:
      'This is the cost of hours already worked this week, as of now -- not the full theoretical week. An in-progress shift counts up to the current time; a shift with no clock-in yet counts as zero.',
    labourCostEmpty: 'No active staff to show yet.',
    labourCostTotal: 'Total',
    shiftTypesHeading: 'Shift types',
    shiftTypesUnavailable: 'Shift types are temporarily unavailable.',
    shiftTypesEmpty: 'No shift types configured yet.',
    colCode: 'Code',
    colLabel: 'Label',
    colTime: 'Time',
    colBreak: 'Break',
    fieldEmployee: 'Employee',
    fieldShiftType: 'Shift type',
    shiftTypeCustom: 'Custom',
    fieldStart: 'Start',
    fieldEnd: 'End',
    fieldBreakMinutes: 'Break (min)',
    save: 'Save',
    preferencesUnavailable: 'Shift preferences are temporarily unavailable.',
    preferencesEmpty: 'No shift preferences submitted for this week yet.',
    colDate: 'Date',
    colPreference: 'Preference',
    unavailableValue: 'Unavailable',
    correctionsHeading: 'Correction requests',
    correctionsUnavailable: 'Correction requests are temporarily unavailable.',
    needsActionEyebrow: 'Needs action',
    noPendingCorrections: 'No pending correction requests.',
    colMessage: 'Message',
    colAttendance: 'Attendance',
    colRequested: 'Requested change',
    colTransportation: 'Transportation',
    colDailyMessage: 'Daily message',
    approve: 'Approve',
    reject: 'Reject',
    recentlyDecided: 'Recently decided',
    colStatus2: 'Status',
    exchangesHeading: 'Shift exchange requests',
    exchangesUnavailable: 'Shift exchange requests are temporarily unavailable.',
    noPendingExchanges: 'No pending shift exchange requests.',
    colRequester: 'Requester',
    colShift: 'Shift',
    colRequest: 'Request',
    colReason: 'Reason',
    requestKindCancellation: 'Cancellation',
    requestKindChange: 'Shift change',
    requestKindExchange: 'Exchange',
    awaitingCandidate: 'awaiting candidate',
    pageTitle: 'Manager',
    signOut: 'Sign out',
    navRecipes: 'Recipes',
    navInventory: 'Inventory',
    backToWorkforce: 'Platform dashboard',
    staffActivated: 'Staff member activated.',
    staffDeactivated: 'Staff member deactivated.',
    shiftUnassigned: 'Shift unassigned.',
    correctionApproved: 'Correction approved.',
    correctionRejected: 'Correction rejected.',
    exchangeApproved: 'Shift exchange approved.',
    exchangeRejected: 'Shift exchange rejected.',
    draftShiftsLabel: 'Draft shifts',
    shortagesLabel: 'Shortages',
    unplacedLabel: 'Unplaced',
    nonSubmittersLabel: 'No preferences submitted',
    lineUserIdPlaceholder: 'LINE user id',
    bind: 'Bind',
    binding: 'Binding...',
    unbindLine: 'Unbind LINE',
    unbinding: 'Unbinding...',
    confirmUnbindLine: 'Unbind this LINE user id from this staff member?',
  },
  ja: {
    attentionHeading: '要確認',
    attentionAllClear: '現在、対応が必要な項目はありません。',
    attentionReview: '確認する',
    attentionCorrectionTitle: '勤怠修正',
    attentionExchangeTitle: 'シフト交換',
    attentionUnavailableConflictTitle: '不可との重複',
    attentionInventoryTitle: '在庫不足',
    staffHeading: 'スタッフ',
    manageStaff: 'スタッフ管理',
    addStaff: '+ スタッフを追加',
    staffUnavailable: 'スタッフ一覧は一時的に利用できません。',
    staffEmpty: 'まだスタッフが追加されていません。',
    searchStaffPlaceholder: '氏名・役職・雇用形態で検索',
    filterAll: 'すべて',
    noStaffMatch: '該当するスタッフが見つかりません。',
    colName: '氏名',
    colPosition: '役職',
    colEmploymentType: '雇用形態',
    colStatus: 'ステータス',
    colLine: 'LINE',
    colActions: '操作',
    statusActive: '有効',
    statusInactive: '無効',
    edit: '編集',
    activate: '有効化',
    deactivate: '無効化',
    saving: '保存中...',
    confirmDeactivate: 'このスタッフを無効化しますか？',
    fieldName: '氏名',
    fieldFamilyName: '姓',
    fieldGivenName: '名',
    fieldEmail: 'メールアドレス',
    fieldPosition: '役職',
    fieldEmploymentType: '雇用形態',
    addStaffSubmit: 'スタッフを追加',
    saveChanges: '変更を保存',
    cancel: 'キャンセル',
    errorNotFound: '見つかりませんでした。',
    errorNotAuthenticated: 'もう一度サインインしてください。',
    errorNoMembership: 'このワークスペースのメンバーではありません。',
    errorStaleReference: 'この依頼は最新の状態ではありません。シフトが変更されたか、別のマネージャーが既に対応した可能性があります。最新の状態を確認するには更新してください。',
    prevWeek: '前週',
    thisWeek: '今週',
    nextWeek: '次週',
    addStaffToSeeSchedule: 'スタッフを追加すると週間スケジュールが表示されます。',
    colStaff: 'スタッフ',
    assign: '割り当て',
    unassign: '割り当て解除',
    unassigning: '解除中...',
    statusPublished: '公開済み',
    statusDraft: '下書き',
    publishedReadOnly: '公開済み -- 変更不可',
    actionsHeading: '操作',
    autoDistributionDescription:
      '自動割り当ては、カフェの固定デフォルト（毎日AM枠1名・PM枠1名）を使用します -- 設定画面はまだありません。',
    runAutoDistribution: '自動割り当てを実行',
    running: '実行中...',
    undoAutoDistribution: '自動割り当てを元に戻す',
    undoing: '元に戻しています...',
    autoDistributionUndone: '自動割り当てを元に戻しました -- 作成された下書きシフトは未割り当てに戻りました。',
    publishSchedule: 'スケジュールを公開',
    publishing: '公開中...',
    confirmPublish: '今週の下書きシフトをすべて公開しますか？スタッフに表示されるようになります。',
    confirmUnassignShift: 'このシフトからスタッフの割り当てを解除しますか？',
    scheduleHelpAriaLabel: 'シフトスケジュールについて',
    scheduleHelpTitle: 'シフトスケジュールについて',
    scheduleHelpBody:
      '空いているセルにスタッフを割り当てるか、「自動割り当てを実行」で残りのシフトを自動的に埋めます。「スケジュールを公開」を押すまでスタッフには表示されません。',
    staffNamePopupTitlePrefix: 'スタッフ',
    staffNamePopupMonth: '対象月',
    staffNamePopupWorkedHours: '実働時間（今月）',
    staffNamePopupHourlyWage: '時給',
    staffNamePopupEarnedSoFar: '現時点の概算支給額',
    staffNamePopupCopyReport: '月次レポートをコピー',
    staffNamePopupCopied: 'コピーしました。',
    staffNamePopupCopyFailed: 'コピーできませんでした。数値を手動でコピーしてください。',
    labourCostHeading: '概算人件費',
    labourCostHelpAriaLabel: '概算人件費について',
    labourCostHelpTitle: '概算人件費について',
    labourCostHelpBody:
      'これは今週すでに勤務した時間分の、現時点での費用です -- 週全体の理論値ではありません。進行中のシフトは現在時刻までを計上し、まだ出勤していないシフトはゼロとして扱われます。',
    labourCostEmpty: '表示できる有効なスタッフがまだいません。',
    labourCostTotal: '合計',
    shiftTypesHeading: 'シフト種別',
    shiftTypesUnavailable: 'シフト種別は一時的に利用できません。',
    shiftTypesEmpty: 'シフト種別がまだ設定されていません。',
    colCode: 'コード',
    colLabel: '名称',
    colTime: '時間',
    colBreak: '休憩',
    fieldEmployee: 'スタッフ',
    fieldShiftType: 'シフト種別',
    shiftTypeCustom: 'カスタム',
    fieldStart: '開始',
    fieldEnd: '終了',
    fieldBreakMinutes: '休憩（分）',
    save: '保存',
    preferencesUnavailable: 'シフト希望は一時的に利用できません。',
    preferencesEmpty: '今週はまだシフト希望が提出されていません。',
    colDate: '日付',
    colPreference: '希望',
    unavailableValue: '休み希望',
    correctionsHeading: '修正依頼',
    correctionsUnavailable: '修正依頼は一時的に利用できません。',
    needsActionEyebrow: '対応が必要',
    noPendingCorrections: '保留中の修正依頼はありません。',
    colMessage: 'メッセージ',
    colAttendance: '勤怠',
    colRequested: '希望する変更',
    colTransportation: '交通費',
    colDailyMessage: '当日のメッセージ',
    approve: '承認',
    reject: '却下',
    recentlyDecided: '最近対応した項目',
    colStatus2: 'ステータス',
    exchangesHeading: 'シフト交換リクエスト',
    exchangesUnavailable: 'シフト交換リクエストは一時的に利用できません。',
    noPendingExchanges: '保留中のシフト交換リクエストはありません。',
    colRequester: '申請者',
    colShift: 'シフト',
    colRequest: '申請内容',
    colReason: '理由',
    requestKindCancellation: 'キャンセル',
    requestKindChange: 'シフト変更',
    requestKindExchange: '交換',
    awaitingCandidate: '交換相手を待っています',
    pageTitle: 'マネージャー',
    signOut: 'サインアウト',
    navRecipes: 'レシピ',
    navInventory: '在庫',
    backToWorkforce: 'プラットフォームダッシュボード',
    staffActivated: 'スタッフを有効化しました。',
    staffDeactivated: 'スタッフを無効化しました。',
    shiftUnassigned: 'シフトの割り当てを解除しました。',
    correctionApproved: '修正依頼を承認しました。',
    correctionRejected: '修正依頼を却下しました。',
    exchangeApproved: 'シフト交換を承認しました。',
    exchangeRejected: 'シフト交換を却下しました。',
    draftShiftsLabel: '下書きシフト',
    shortagesLabel: '不足',
    unplacedLabel: '未配置',
    nonSubmittersLabel: '希望未提出',
    lineUserIdPlaceholder: 'LINEユーザーID',
    bind: '連携する',
    binding: '連携中...',
    unbindLine: 'LINE連携を解除',
    unbinding: '解除中...',
    confirmUnbindLine: 'このスタッフのLINEユーザーIDの連携を解除しますか？',
  },
};

export const tManagerDashboard = makeTranslator(dictionary);

/** Parameterized strings that don't fit `makeTranslator`'s fixed-string shape -- same extension pattern as `staff-dashboard-i18n.ts`. */
export const scheduleHeadingValue: Record<Lang, (periodStart: string, periodEnd: string) => string> = {
  en: (periodStart, periodEnd) => `Weekly schedule (${periodStart} - ${periodEnd})`,
  ja: (periodStart, periodEnd) => `週間スケジュール (${periodStart} - ${periodEnd})`,
};

export const preferencesHeadingValue: Record<Lang, (periodStart: string, periodEnd: string) => string> = {
  en: (periodStart, periodEnd) => `Submitted shift preferences (${periodStart} - ${periodEnd})`,
  ja: (periodStart, periodEnd) => `提出されたシフト希望 (${periodStart} - ${periodEnd})`,
};

export const breakMinutesValue: Record<Lang, (minutes: number) => string> = {
  en: (minutes) => `${minutes} min`,
  ja: (minutes) => `${minutes}分`,
};

export const autoDistributionCreatedMessage: Record<Lang, (count: number) => string> = {
  en: (count) => `Created ${count} draft shift(s).`,
  ja: (count) => `${count}件の下書きシフトを作成しました。`,
};

export const publishedCountMessage: Record<Lang, (count: number) => string> = {
  en: (count) => `Published ${count} shift(s).`,
  ja: (count) => `${count}件のシフトを公開しました。`,
};

/** Compact "N active / M total" summary shown on the Staff section header, next to the Manage-staff popup trigger (WP A4). */
export const staffSummaryLabel: Record<Lang, (activeCount: number, totalCount: number) => string> = {
  en: (activeCount, totalCount) => `${activeCount} active / ${totalCount} total`,
  ja: (activeCount, totalCount) => `有効 ${activeCount}名 / 全 ${totalCount}名`,
};

export const attentionCorrectionLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} correction request(s) waiting on your decision`,
  ja: (count) => `${count}件の修正依頼があなたの判断を待っています`,
};

export const attentionExchangeLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} shift exchange request(s) waiting on your decision`,
  ja: (count) => `${count}件のシフト交換リクエストがあなたの判断を待っています`,
};

export const attentionInventoryLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} inventory item(s) need restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

export const attentionUnavailableConflictLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} shift(s) assigned to a staff member who marked that day Unavailable`,
  ja: (count) => `${count}件のシフトが、その日「不可」と回答したスタッフに割り当てられています`,
};

export const unavailableConflictBadgeLabel: Record<Lang, string> = {
  en: '⚠ Unavailable',
  ja: '⚠ 不可',
};
