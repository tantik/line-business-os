import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the Owner Weekly Review popup (Cafe v2.2 WP3). Reuses
 * the existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`), same convention as every other canonical
 * dashboard surface -- a new dictionary, not a new i18n system.
 *
 * JA TERM CHOICE (recorded per the mission brief's request): `週次レビュー`
 * ("weekly review"), not `今週のまとめ` ("this week's summary") or
 * `週間レビュー` (a near-synonym differing only in the reading of "week").
 * Reasoning: this feature is explicitly navigable across MULTIPLE weeks
 * (Prev/Next, including past-completed weeks), not just "this week," so
 * `今週のまとめ` would misdescribe it once a Manager pages backward.
 * `レビュー` (loanword "review") is already natural in Japanese business
 * usage (e.g. `コードレビュー`) and reads clearly as a recurring/periodic
 * check-in rather than a one-off summary -- matching the product intent of
 * "a five-minute Monday-morning check-in on last week." `週次` (weekly/
 * per-week, lit. "week-order") is the standard adjective form used with
 * `レビュー`/`確認`/`報告` in Japanese business contexts (cf. `週次報告` =
 * weekly report), preferred here over `週間` (which more often modifies a
 * noun describing a SPAN of time, e.g. `週間予定` = "the week's schedule")
 * since this feature is a REVIEW ACT performed periodically, not a span.
 */
interface WeeklyReviewDict {
  navLabel: string;
  popupTitle: string;
  popupHelpAriaLabel: string;
  popupHelpTitle: string;
  popupHelpBody: string;
  backToManager: string;
  formCancel: string;

  prevWeek: string;
  nextWeek: string;
  inProgressBadge: string;

  unavailable: string;
  notAvailableTitle: string;
  notAvailableModuleOff: string;

  quietWeekTitle: string;
  quietWeekDescription: string;

  sectionTeam: string;
  labelShiftAssignments: string;
  labelShiftExchanges: string;
  labelUnresolvedShiftRequests: string;

  sectionOperations: string;
  labelCompletedChecks: string;
  labelCriticalMissed: string;
  labelOpenExceptions: string;

  sectionIssues: string;
  labelNewIssues: string;
  labelNewHandovers: string;
  labelUnresolvedIssues: string;
  labelUnresolvedImportantIssues: string;
  recurringCategoryLine: string;

  sectionPurchasing: string;
  labelShortageItems: string;
  labelPendingPurchases: string;

  sectionStillOpen: string;
  stillOpenNone: string;

  categoryEquipment: string;
  categoryInventory: string;
  categoryCleaning: string;
  categoryFacility: string;
  categoryCustomer: string;
  categoryOperations: string;
  categoryOther: string;

  viewShiftRequests: string;
  viewShiftExchanges: string;
  viewOperations: string;
  viewIssues: string;
  viewPurchases: string;
  viewInventory: string;

  errNoAuthContext: string;
  errInvalidWeek: string;
  errPermissionDenied: string;
  errorGeneric: string;
  errorNotAuthenticated: string;
  errorNoMembership: string;
}

const dictionary: Record<Lang, WeeklyReviewDict> = {
  en: {
    navLabel: 'Weekly Review',
    popupTitle: 'Weekly Review',
    popupHelpAriaLabel: 'About Weekly Review',
    popupHelpTitle: 'About Weekly Review',
    popupHelpBody:
      'A quick read-only summary of one business week (Monday-Sunday): team activity, Operations checks, Issues & Handover, and Purchasing. Use Prev/Next to look at another week. Nothing here can be edited -- open the linked module to take action.',
    backToManager: 'Back to Manager',
    formCancel: 'Close',

    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    inProgressBadge: 'In progress -- not yet complete',

    unavailable: 'Could not load this week. Please try again.',
    notAvailableTitle: 'Not available',
    notAvailableModuleOff: 'This module is not enabled for this workspace.',

    quietWeekTitle: 'A quiet week',
    quietWeekDescription: 'No critical misses, no unresolved issues, no pending purchases, no unresolved shift requests.',

    sectionTeam: 'Team',
    labelShiftAssignments: 'Shift assignments this week',
    labelShiftExchanges: 'Shift exchanges/corrections created this week',
    labelUnresolvedShiftRequests: 'Still-unresolved shift requests (any date)',

    sectionOperations: 'Operations',
    labelCompletedChecks: 'Checks completed this week',
    labelCriticalMissed: 'Critical checks missed this week',
    labelOpenExceptions: 'Still-open exceptions (any date)',

    sectionIssues: 'Issues & Handover',
    labelNewIssues: 'New issues this week',
    labelNewHandovers: 'New handovers this week',
    labelUnresolvedIssues: 'Still-unresolved issues (any date)',
    labelUnresolvedImportantIssues: 'Still-unresolved important issues (any date)',
    recurringCategoryLine: '{count} issues in ‘{category}’ this week',

    sectionPurchasing: 'Purchasing',
    labelShortageItems: 'Items currently in shortage',
    labelPendingPurchases: 'Pending purchases needed',

    sectionStillOpen: 'Still open',
    stillOpenNone: 'Nothing currently open.',

    categoryEquipment: 'Equipment',
    categoryInventory: 'Inventory',
    categoryCleaning: 'Cleaning',
    categoryFacility: 'Facility',
    categoryCustomer: 'Customer',
    categoryOperations: 'Operations',
    categoryOther: 'Other',

    viewShiftRequests: 'View shift requests',
    viewShiftExchanges: 'View shift exchanges',
    viewOperations: 'View Operations',
    viewIssues: 'View Issues & Handover',
    viewPurchases: 'View Purchases',
    viewInventory: 'View Inventory',

    errNoAuthContext: 'Please sign in again.',
    errInvalidWeek: 'Invalid week.',
    errPermissionDenied: 'You do not have permission to view this.',
    errorGeneric: 'Something went wrong. Please try again.',
    errorNotAuthenticated: 'Please sign in again.',
    errorNoMembership: 'You are not a member of this workspace.',
  },
  ja: {
    navLabel: '週次レビュー',
    popupTitle: '週次レビュー',
    popupHelpAriaLabel: '週次レビューについて',
    popupHelpTitle: '週次レビューについて',
    popupHelpBody:
      '月曜〜日曜の1週間分を振り返る読み取り専用のまとめです。チームの動き、業務チェック、申し送り・問題、仕入れの状況を確認できます。前週・翌週ボタンで他の週も見られます。ここでは編集できません -- 対応する画面を開いて操作してください。',
    backToManager: 'マネージャーへ戻る',
    formCancel: '閉じる',

    prevWeek: '前の週',
    nextWeek: '次の週',
    inProgressBadge: '進行中（まだ終わっていません）',

    unavailable: 'この週の情報を読み込めませんでした。もう一度お試しください。',
    notAvailableTitle: '利用できません',
    notAvailableModuleOff: 'このワークスペースではこの機能が有効になっていません。',

    quietWeekTitle: '穏やかな一週間でした',
    quietWeekDescription: '重大な未実施、未解決の問題、保留中の仕入れ、未対応のシフト希望はありませんでした。',

    sectionTeam: 'チーム',
    labelShiftAssignments: '今週のシフト件数',
    labelShiftExchanges: '今週作成された交代・修正申請',
    labelUnresolvedShiftRequests: '未対応のシフト希望（日付を問わず）',

    sectionOperations: '業務チェック',
    labelCompletedChecks: '今週完了したチェック',
    labelCriticalMissed: '今週見逃された重要チェック',
    labelOpenExceptions: '現在未解決の対応事項（日付を問わず）',

    sectionIssues: '申し送り・問題',
    labelNewIssues: '今週報告された問題',
    labelNewHandovers: '今週の申し送り',
    labelUnresolvedIssues: '現在未解決の問題（日付を問わず）',
    labelUnresolvedImportantIssues: '現在未解決の重要な問題（日付を問わず）',
    recurringCategoryLine: '今週「{category}」が{count}件',

    sectionPurchasing: '仕入れ',
    labelShortageItems: '現在不足している商品',
    labelPendingPurchases: '対応が必要な仕入れ',

    sectionStillOpen: '未解決の項目',
    stillOpenNone: '現在、未解決の項目はありません。',

    categoryEquipment: '設備',
    categoryInventory: '在庫',
    categoryCleaning: '清掃',
    categoryFacility: '施設',
    categoryCustomer: '接客',
    categoryOperations: '業務',
    categoryOther: 'その他',

    viewShiftRequests: 'シフト希望を見る',
    viewShiftExchanges: '交代申請を見る',
    viewOperations: '業務チェックを見る',
    viewIssues: '申し送り・問題を見る',
    viewPurchases: '仕入れを見る',
    viewInventory: '在庫を見る',

    errNoAuthContext: 'もう一度サインインしてください。',
    errInvalidWeek: '対象の週が正しくありません。',
    errPermissionDenied: 'この操作を行う権限がありません。',
    errorGeneric: 'エラーが発生しました。もう一度お試しください。',
    errorNotAuthenticated: 'もう一度サインインしてください。',
    errorNoMembership: 'このワークスペースのメンバーではありません。',
  },
};

export const tWeeklyReview = makeTranslator(dictionary);
export type WeeklyReviewDictKey = Parameters<typeof tWeeklyReview>[1];
