import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';

/**
 * JA/EN strings for the canonical dashboard Staff surface. Originally
 * scoped to the schedule/shift-exchange/Inventory-entry section only (the
 * part added by the Cafe v2.1 canonical Staff consolidation); extended
 * (Cafe v2.1 Mission 1, Product/UX Reconciliation Audit §5/§8/§14) to also
 * cover the shift-preference, work-report, and correction-request sections,
 * which previously mixed hardcoded bilingual literals with some
 * English-only strings instead of toggling with the rest of the page.
 * Reuses the existing `LangProvider`/`useLang`/`makeTranslator` mechanism
 * (`@/lib/demo/cafe/i18n`) already powering `_client-preview`'s JA/EN
 * toggle -- one dictionary, not a new i18n system, and never the Manager
 * dashboard (out of this mission's scope).
 */
interface StaffDashboardDict {
  scheduleHeading: string;
  all: string;
  onlyMe: string;
  prevWeek: string;
  thisWeek: string;
  nextWeek: string;
  scheduleUnavailable: string;
  scheduledThisWeekLabel: string;
  meLabel: string;
  colleaguePrefixLabel: string;
  shiftLabel: string;
  timeLabel: string;
  clockInLabel: string;
  clockOutLabel: string;
  transportationLabel: string;
  noShiftOrReport: string;
  requestChangeHeading: string;
  exchangeSubmitted: string;
  inventoryTitle: string;
  inventoryDescription: string;
  inventorySufficient: string;
  inventoryOpen: string;
  inventoryNotEnabled: string;
  requestTypeLabel: string;
  optionExchange: string;
  optionCancel: string;
  reasonLabel: string;
  submit: string;
  submitting: string;
  submitEyebrow: string;
  dateLabel: string;
  statusLabel: string;
  // Shift preferences
  shiftPreferencesHeading: string;
  shiftPreferencesUnavailable: string;
  shiftPreferencesEmpty: string;
  preferenceColumnLabel: string;
  preferenceUnavailableValue: string;
  shiftTypesUnavailable: string;
  unavailableThisDayLabel: string;
  shiftTypeLabel: string;
  chooseShiftType: string;
  submitPreference: string;
  // Work reports
  workReportsHeading: string;
  workReportsUnavailable: string;
  workReportsEmpty: string;
  clockInColumnLabel: string;
  clockOutColumnLabel: string;
  transportationColumnLabel: string;
  messageColumnLabel: string;
  actualBreakLabel: string;
  breakMinutes0: string;
  breakMinutes30: string;
  breakMinutes60: string;
  transportationCostLabel: string;
  dailyMessageLabel: string;
  submitWorkReport: string;
  // Correction requests
  correctionRequestHeading: string;
  correctionRequestDescription: string;
  relatedWorkReportLabel: string;
  relatedWorkReportNone: string;
  currentClockTimesLabel: string;
  requestedClockInLabel: string;
  requestedClockOutLabel: string;
  requestedBreakLabel: string;
  correctionMessageLabel: string;
  submitCorrectionRequest: string;
  myCorrectionsHeading: string;
  myCorrectionsUnavailable: string;
  myCorrectionsEmpty: string;
  relatedWorkReportColumnLabel: string;
  shiftPreferenceSubmitted: string;
  workReportSubmitted: string;
  correctionRequestSubmitted: string;
  // Work status (live clock in/out)
  workStatusHeading: string;
  workStatusIdle: string;
  workStatusWorkingLabel: string;
  workStatusClockedOutButton: string;
  workStatusBreakLabel: string;
  workStatusMinutesSuffix: string;
  workStatusProcessing: string;
  workStatusSelectBreakTitle: string;
  workStatusSelectBreakBody: string;
  workStatusConfirmTitle: string;
  workStatusConfirmBreakLabel: string;
  workStatusConfirmAction: string;
  workStatusCancel: string;
  // Page chrome (header, profile card)
  pageTitle: string;
  navRecipes: string;
  navInventory: string;
  entryPointsHeading: string;
  backToWorkforce: string;
  signOut: string;
  profileHeading: string;
  nameLabel: string;
  positionLabel: string;
  employmentTypeLabel: string;
  notSetLabel: string;
  activeLabel: string;
  inactiveLabel: string;
}

const dictionary: Record<Lang, StaffDashboardDict> = {
  en: {
    scheduleHeading: 'Published schedule',
    all: 'All',
    onlyMe: 'Only me',
    prevWeek: 'Prev week',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    scheduleUnavailable: 'Your schedule is temporarily unavailable.',
    scheduledThisWeekLabel: 'Scheduled this week',
    meLabel: 'Me',
    colleaguePrefixLabel: 'Staff',
    shiftLabel: 'Shift',
    timeLabel: 'Time',
    clockInLabel: 'Clock in',
    clockOutLabel: 'Clock out',
    transportationLabel: 'Transportation',
    noShiftOrReport: 'No shift or work report for this date.',
    requestChangeHeading: 'Request a shift change or cancellation',
    exchangeSubmitted: 'Shift exchange request submitted.',
    inventoryTitle: 'Inventory',
    inventoryDescription: "Daily stock check for this location.",
    inventorySufficient: 'All items sufficient',
    inventoryOpen: 'Open Inventory',
    inventoryNotEnabled: 'Inventory (not enabled)',
    requestTypeLabel: 'Request type',
    optionExchange: 'Offer for exchange',
    optionCancel: 'Request cancellation',
    reasonLabel: 'Reason',
    submit: 'Submit request',
    submitting: 'Submitting...',
    submitEyebrow: 'Submit',
    dateLabel: 'Date',
    statusLabel: 'Status',
    shiftPreferencesHeading: 'My submitted shift preferences',
    shiftPreferencesUnavailable: 'Your shift preferences are temporarily unavailable.',
    shiftPreferencesEmpty: 'No shift preferences submitted for this week yet.',
    preferenceColumnLabel: 'Preference',
    preferenceUnavailableValue: 'Unavailable',
    shiftTypesUnavailable: 'Shift types are temporarily unavailable, so preferences cannot be submitted right now.',
    unavailableThisDayLabel: 'Unavailable this day',
    shiftTypeLabel: 'Shift type',
    chooseShiftType: 'Choose a shift type',
    submitPreference: 'Submit preference',
    workReportsHeading: 'My work reports this week',
    workReportsUnavailable: 'Your work reports are temporarily unavailable.',
    workReportsEmpty: 'No work reports submitted for this week yet.',
    clockInColumnLabel: 'Clock in',
    clockOutColumnLabel: 'Clock out',
    transportationColumnLabel: 'Transportation',
    messageColumnLabel: 'Message',
    actualBreakLabel: 'Actual break',
    breakMinutes0: '0 minutes',
    breakMinutes30: '30 minutes',
    breakMinutes60: '60 minutes',
    transportationCostLabel: 'Transportation cost',
    dailyMessageLabel: 'Daily message',
    submitWorkReport: 'Submit work report',
    correctionRequestHeading: 'Submit a correction request',
    correctionRequestDescription:
      "If a submitted work report is wrong, describe the correction here -- your manager reviews it separately.",
    relatedWorkReportLabel: 'Related work report (optional)',
    relatedWorkReportNone: 'None',
    currentClockTimesLabel: 'Current clock-in / clock-out',
    requestedClockInLabel: 'Requested clock-in (optional)',
    requestedClockOutLabel: 'Requested clock-out (optional)',
    requestedBreakLabel: 'Requested break minutes (optional)',
    correctionMessageLabel: 'Reason',
    submitCorrectionRequest: 'Submit correction request',
    myCorrectionsHeading: 'My correction requests this week',
    myCorrectionsUnavailable: 'Your correction requests are temporarily unavailable.',
    myCorrectionsEmpty: 'No correction requests submitted for this week yet.',
    relatedWorkReportColumnLabel: 'Related work report',
    shiftPreferenceSubmitted: 'Shift preference submitted.',
    workReportSubmitted: 'Work report submitted.',
    correctionRequestSubmitted: 'Correction request submitted.',
    workStatusHeading: 'Work status',
    workStatusIdle: 'Not clocked in',
    workStatusWorkingLabel: 'Working',
    workStatusClockedOutButton: 'Clocked out',
    workStatusBreakLabel: 'Break',
    workStatusMinutesSuffix: ' min',
    workStatusProcessing: 'Processing...',
    workStatusSelectBreakTitle: 'Select break time',
    workStatusSelectBreakBody: 'Choose today’s total break time.',
    workStatusConfirmTitle: 'Confirm clock-out',
    workStatusConfirmBreakLabel: 'Break time',
    workStatusConfirmAction: 'Confirm clock-out',
    workStatusCancel: 'Cancel',
    pageTitle: 'Staff',
    navRecipes: 'Recipes',
    navInventory: 'Inventory',
    entryPointsHeading: 'Staff & recipe & Inventory management',
    backToWorkforce: 'Platform dashboard',
    signOut: 'Sign out',
    profileHeading: 'My staff profile',
    nameLabel: 'Name',
    positionLabel: 'Position',
    employmentTypeLabel: 'Employment type',
    notSetLabel: 'Not set',
    activeLabel: 'Active',
    inactiveLabel: 'Inactive',
  },
  ja: {
    scheduleHeading: '公開シフト',
    all: 'すべて',
    onlyMe: '自分のみ',
    prevWeek: '前週',
    thisWeek: '今週',
    nextWeek: '次週',
    scheduleUnavailable: 'スケジュールは一時的に利用できません。',
    scheduledThisWeekLabel: '今週の予定時間',
    meLabel: '自分',
    colleaguePrefixLabel: 'スタッフ',
    shiftLabel: 'シフト',
    timeLabel: '時間',
    clockInLabel: '出勤',
    clockOutLabel: '退勤',
    transportationLabel: '交通費',
    noShiftOrReport: 'この日にはシフトも勤務報告もありません。',
    requestChangeHeading: 'シフト変更・キャンセルを申請',
    exchangeSubmitted: 'シフト交換リクエストを送信しました。',
    inventoryTitle: '在庫',
    inventoryDescription: 'この店舗の日次在庫確認。',
    inventorySufficient: '在庫はすべて十分です',
    inventoryOpen: '在庫を開く',
    inventoryNotEnabled: '在庫（未有効）',
    requestTypeLabel: '申請種別',
    optionExchange: '交換希望',
    optionCancel: 'キャンセル希望',
    reasonLabel: '理由',
    submit: '申請を送信',
    submitting: '送信中...',
    submitEyebrow: '提出',
    dateLabel: '日付',
    statusLabel: 'ステータス',
    shiftPreferencesHeading: '自分が提出したシフト希望',
    shiftPreferencesUnavailable: 'シフト希望は一時的に利用できません。',
    shiftPreferencesEmpty: '今週はまだシフト希望が提出されていません。',
    preferenceColumnLabel: '希望',
    preferenceUnavailableValue: '休み希望',
    shiftTypesUnavailable: 'シフト種別は一時的に利用できないため、現在希望を提出できません。',
    unavailableThisDayLabel: 'この日は休み希望',
    shiftTypeLabel: 'シフト種別',
    chooseShiftType: 'シフト種別を選択',
    submitPreference: '希望を提出',
    workReportsHeading: '今週の勤務報告',
    workReportsUnavailable: '勤務報告は一時的に利用できません。',
    workReportsEmpty: '今週はまだ勤務報告が提出されていません。',
    clockInColumnLabel: '出勤',
    clockOutColumnLabel: '退勤',
    transportationColumnLabel: '交通費',
    messageColumnLabel: 'メッセージ',
    actualBreakLabel: '実際の休憩時間',
    breakMinutes0: '0分',
    breakMinutes30: '30分',
    breakMinutes60: '60分',
    transportationCostLabel: '交通費',
    dailyMessageLabel: '当日のメッセージ',
    submitWorkReport: '勤務報告を提出',
    correctionRequestHeading: '修正依頼を提出',
    correctionRequestDescription: '提出した勤務報告に誤りがある場合は、ここに修正内容を記入してください。マネージャーが別途確認します。',
    relatedWorkReportLabel: '関連する勤務報告（任意）',
    relatedWorkReportNone: 'なし',
    currentClockTimesLabel: '現在の出勤・退勤時刻',
    requestedClockInLabel: '希望する出勤時刻（任意）',
    requestedClockOutLabel: '希望する退勤時刻（任意）',
    requestedBreakLabel: '希望する休憩時間（分・任意）',
    correctionMessageLabel: '理由',
    submitCorrectionRequest: '修正依頼を提出',
    myCorrectionsHeading: '今週の修正依頼',
    myCorrectionsUnavailable: '修正依頼は一時的に利用できません。',
    myCorrectionsEmpty: '今週はまだ修正依頼が提出されていません。',
    relatedWorkReportColumnLabel: '関連する勤務報告',
    shiftPreferenceSubmitted: 'シフト希望を送信しました。',
    workReportSubmitted: '勤務報告を送信しました。',
    correctionRequestSubmitted: '修正依頼を送信しました。',
    workStatusHeading: '勤務状況',
    workStatusIdle: '未出勤',
    workStatusWorkingLabel: '勤務中',
    workStatusClockedOutButton: '退勤済み',
    workStatusBreakLabel: '休憩',
    workStatusMinutesSuffix: '分',
    workStatusProcessing: '処理中…',
    workStatusSelectBreakTitle: '休憩時間を選択',
    workStatusSelectBreakBody: '本日の休憩時間を選んでください。',
    workStatusConfirmTitle: '退勤を確認',
    workStatusConfirmBreakLabel: '休憩時間',
    workStatusConfirmAction: '退勤を確定',
    workStatusCancel: 'キャンセル',
    pageTitle: 'スタッフ',
    navRecipes: 'レシピ',
    navInventory: '在庫',
    entryPointsHeading: 'スタッフ・レシピ・在庫管理',
    backToWorkforce: 'プラットフォームダッシュボード',
    signOut: 'サインアウト',
    profileHeading: '自分のプロフィール',
    nameLabel: '氏名',
    positionLabel: '役職',
    employmentTypeLabel: '雇用形態',
    notSetLabel: '未設定',
    activeLabel: '有効',
    inactiveLabel: '無効',
  },
};

export const tStaffDashboard = makeTranslator(dictionary);

/** Parameterized strings that don't fit `makeTranslator`'s fixed-string shape. */

/** Header title including the caller's own real display name (Cafe v2.1 QA audit P2-7). Mirrors the Surface A reference's `{name} さん` pattern. */
export const pageTitleWithName: Record<Lang, (name: string) => string> = {
  en: (name) => `Staff — ${name}`,
  ja: (name) => `スタッフ — ${name} さん`,
};

export const scheduledThisWeekValue: Record<Lang, (hours: string) => string> = {
  en: (hours) => `Scheduled this week: ${hours}h`,
  ja: (hours) => `今週の予定時間: ${hours}h`,
};

export const inventoryShortageLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} item(s) need restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

export const existingExchangeMessage: Record<Lang, (status: string) => string> = {
  en: (status) => `A ${status} exchange request already exists for this shift.`,
  ja: (status) => `このシフトにはすでに${status}状態の交換リクエストがあります。`,
};

/** Minimal JA/EN mapping for the `WorkforceWriteResult` statuses the shift-exchange request form can actually surface -- scoped counterpart to `error-copy.ts`'s English-only `describeWriteError`, for this consolidation's new exchange flow only. */
export function describeExchangeError(lang: Lang, status: string): string {
  const messages: Record<Lang, Record<string, string>> = {
    en: {
      not_found: 'Not found.',
      not_authenticated: 'Please sign in again.',
      no_membership: 'You are not a member of this workspace.',
      stale_reference: 'This request no longer matches the current schedule. Refresh to see the latest state.',
      duplicate: 'This request already exists.',
    },
    ja: {
      not_found: '見つかりません。',
      not_authenticated: '再度サインインしてください。',
      no_membership: 'このワークスペースのメンバーではありません。',
      stale_reference: 'このリクエストは現在のスケジュールと一致しません。最新の状態を確認してください。',
      duplicate: 'このリクエストはすでに存在します。',
    },
  };
  const fallback: Record<Lang, string> = {
    en: 'Something went wrong. Please try again.',
    ja: '問題が発生しました。もう一度お試しください。',
  };
  return messages[lang][status] ?? fallback[lang];
}
