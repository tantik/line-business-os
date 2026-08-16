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
  // Staff section
  staffHeading: string;
  addStaff: string;
  staffUnavailable: string;
  staffEmpty: string;
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
  publishSchedule: string;
  publishing: string;
  confirmPublish: string;
  // Shift types section
  shiftTypesHeading: string;
  shiftTypesUnavailable: string;
  shiftTypesEmpty: string;
  colCode: string;
  colLabel: string;
  colTime: string;
  colBreak: string;
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
}

const dictionary: Record<Lang, ManagerDashboardDict> = {
  en: {
    attentionHeading: 'Needs attention',
    attentionAllClear: 'Nothing needs your attention right now.',
    attentionReview: 'Review',
    staffHeading: 'Staff',
    addStaff: '+ Add staff',
    staffUnavailable: 'Staff list is temporarily unavailable.',
    staffEmpty: 'No staff added yet.',
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
    publishSchedule: 'Publish schedule',
    publishing: 'Publishing...',
    confirmPublish: 'Publish all draft shifts for this week? Staff will be able to see them.',
    shiftTypesHeading: 'Shift types',
    shiftTypesUnavailable: 'Shift types are temporarily unavailable.',
    shiftTypesEmpty: 'No shift types configured yet.',
    colCode: 'Code',
    colLabel: 'Label',
    colTime: 'Time',
    colBreak: 'Break',
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
    backToWorkforce: 'Back to Workforce',
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
  },
  ja: {
    attentionHeading: '要確認',
    attentionAllClear: '現在、対応が必要な項目はありません。',
    attentionReview: '確認する',
    staffHeading: 'スタッフ',
    addStaff: '+ スタッフを追加',
    staffUnavailable: 'スタッフ一覧は一時的に利用できません。',
    staffEmpty: 'まだスタッフが追加されていません。',
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
    publishSchedule: 'スケジュールを公開',
    publishing: '公開中...',
    confirmPublish: '今週の下書きシフトをすべて公開しますか？スタッフに表示されるようになります。',
    shiftTypesHeading: 'シフト種別',
    shiftTypesUnavailable: 'シフト種別は一時的に利用できません。',
    shiftTypesEmpty: 'シフト種別がまだ設定されていません。',
    colCode: 'コード',
    colLabel: '名称',
    colTime: '時間',
    colBreak: '休憩',
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
    backToWorkforce: 'ワークフォースに戻る',
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
