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
  optionChange: string;
  optionCancel: string;
  requestedShiftTypeLabel: string;
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
  plannedShiftLabel: string;
  requestCorrectionButton: string;
  correctionRequestStatusHeading: string;
  correctionRequestedChangeLabel: string;
  attentionIndicatorLegend: string;
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
  navPurchases: string;
  entryPointsHeading: string;
  /** Also doubles as the "Submit next month's shift preference" module's heading and button label on the Staff dashboard. */
  preferenceModalTitle: string;
  // "?" help popovers (2026-08-24 redesign, matching the Manager dashboard's HelpIconButton pattern)
  workStatusHelpAriaLabel: string;
  workStatusHelpBody: string;
  scheduleHelpAriaLabel: string;
  scheduleHelpBody: string;
  transportHelpAriaLabel: string;
  transportHelpBody: string;
  transportPlaceholder: string;
  messageHelpAriaLabel: string;
  messageHelpBody: string;
  messagePlaceholder: string;
  sendButton: string;
  messageSentStatus: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
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
    optionChange: 'Request a different shift type',
    optionCancel: 'Request cancellation',
    requestedShiftTypeLabel: 'New shift type',
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
    plannedShiftLabel: 'Planned shift',
    requestCorrectionButton: 'Request a correction',
    correctionRequestStatusHeading: 'Correction request for this date',
    correctionRequestedChangeLabel: 'Requested change',
    attentionIndicatorLegend: '! = a correction or exchange request on that shift is waiting for a manager decision. Tap the shift for details.',
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
    navPurchases: 'Purchases',
    entryPointsHeading: 'Staff & recipe & Inventory management',
    preferenceModalTitle: "Submit next month's shift preference",
    workStatusHelpAriaLabel: 'About work status',
    workStatusHelpBody: 'Tap the big button to clock in when your shift starts, and to clock out when it ends. On clock-out, choose your actual break time -- your manager sees this in real time.',
    scheduleHelpAriaLabel: 'About the published schedule',
    scheduleHelpBody: 'Shows every shift your manager has published, for you and your coworkers. Tap "Only me" to see just your own shifts, or tap a day in your own row to see its details.',
    transportHelpAriaLabel: 'About transportation cost',
    transportHelpBody: "Enter today's transportation cost. It saves automatically as soon as you type it, and your manager sees it right away for payroll calculations.",
    transportPlaceholder: "Record today's transport cost",
    messageHelpAriaLabel: 'About the daily message',
    messageHelpBody: 'Send your manager a short note -- for example, something that happened during your shift, or anything they should know about.',
    messagePlaceholder: 'Send a message to your manager',
    sendButton: 'Send',
    messageSentStatus: 'Message sent',
    savingStatus: 'Saving...',
    savedStatus: 'Saved',
    saveErrorStatus: 'Could not save',
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
    optionChange: '別のシフト種別を希望',
    optionCancel: 'キャンセル希望',
    requestedShiftTypeLabel: '新しいシフト種別',
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
    plannedShiftLabel: '予定シフト',
    requestCorrectionButton: '修正を依頼',
    correctionRequestStatusHeading: 'この日の修正依頼',
    correctionRequestedChangeLabel: '希望する変更内容',
    attentionIndicatorLegend: '! = そのシフトの修正依頼・交換リクエストがマネージャーの判断待ちです。シフトをタップすると詳細が見られます。',
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
    navPurchases: '仕入れ',
    entryPointsHeading: 'スタッフ・レシピ・在庫管理',
    preferenceModalTitle: '来月のシフト希望を提出',
    workStatusHelpAriaLabel: '勤務状況について',
    workStatusHelpBody: 'シフト開始時に大きなボタンをタップして出勤、終了時にタップして退勤してください。退勤時に実際の休憩時間を選択します -- マネージャーはリアルタイムで確認できます。',
    scheduleHelpAriaLabel: '公開シフトについて',
    scheduleHelpBody: 'マネージャーが公開した、あなたと同僚全員のシフトを表示します。「自分のみ」で自分のシフトだけを表示できます。自分の行の日付をタップすると詳細が見られます。',
    transportHelpAriaLabel: '交通費について',
    transportHelpBody: '本日の交通費を入力してください。入力すると自動的に保存され、マネージャーが給与計算のためすぐに確認できます。',
    transportPlaceholder: '本日の交通費を記録',
    messageHelpAriaLabel: '当日のメッセージについて',
    messageHelpBody: 'マネージャーへ短いメッセージを送れます -- 例えば勤務中に起きたことや、伝えておきたいことなど。',
    messagePlaceholder: 'マネージャーにメッセージを送る',
    sendButton: '送信',
    messageSentStatus: 'メッセージを送信しました',
    savingStatus: '保存中...',
    savedStatus: '保存しました',
    saveErrorStatus: '保存できませんでした',
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
export const scheduledThisWeekValue: Record<Lang, (hours: string) => string> = {
  en: (hours) => `Scheduled this week: ${hours}h`,
  ja: (hours) => `今週の予定時間: ${hours}h`,
};

export const inventoryShortageLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} item(s) need restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

/**
 * Display-only fallback for a shift a staff member is assigned to when it
 * doesn't resolve to a known shift type at all (not merely "custom" -- see
 * `shiftTypeDisplayLabel`'s own `labelJa || labelEn || time-range` chain for
 * that case; this is the one further-out case where `shiftTypeId` itself
 * doesn't resolve). Never the literal English word "Custom" -- always the
 * shift's own local start/end time, i18n-safe in both languages (Staff Shift
 * Schedule v2, 2026-08-25).
 */
export const customShiftTimeRangeLabel: Record<Lang, (startTime: string, endTime: string) => string> = {
  en: (startTime, endTime) => `Custom (${startTime}-${endTime})`,
  ja: (startTime, endTime) => `カスタム (${startTime}-${endTime})`,
};

/** "Worked this month: {hours}h" -- the always-present half of the earnings summary line (Staff Shift Schedule v2). */
export const earningsWorkedHoursValue: Record<Lang, (hours: string) => string> = {
  en: (hours) => `Worked this month: ${hours}h`,
  ja: (hours) => `今月の勤務時間: ${hours}h`,
};

/**
 * Appended after `earningsWorkedHoursValue` only when an hourly wage is
 * actually on file -- never fabricated. Locale pinned to 'ja-JP' (not the
 * bare, environment-dependent `toLocaleString()`) to match the identical
 * yen-formatting convention already used for this value elsewhere
 * (`preview-staff-schedule.tsx`, `preview-shift-grid.tsx`).
 */
export const earningsEstimatedSuffix: Record<Lang, (hourlyWageYen: number, estimatedYen: number) => string> = {
  en: (hourlyWageYen, estimatedYen) => ` · ¥${hourlyWageYen.toLocaleString('ja-JP')}/h · Est. ¥${estimatedYen.toLocaleString('ja-JP')}`,
  ja: (hourlyWageYen, estimatedYen) => ` ・ 時給¥${hourlyWageYen.toLocaleString('ja-JP')} ・ 推定¥${estimatedYen.toLocaleString('ja-JP')}`,
};

/** `shift_exchange_requests.status` values that can reach `existingExchangeMessage` -- see the `status !== 'open' && status !== 'accepted'` filter in `staff-schedule-view-model.ts`. */
const exchangeStatusLabel: Record<Lang, Record<string, string>> = {
  en: { open: 'open', accepted: 'accepted' },
  ja: { open: '受付中', accepted: '承認済み' },
};

export const existingExchangeMessage: Record<Lang, (status: string) => string> = {
  en: (status) => `A ${exchangeStatusLabel.en[status] ?? status} exchange request already exists for this shift.`,
  ja: (status) => `このシフトにはすでに${exchangeStatusLabel.ja[status] ?? status}状態の交換リクエストがあります。`,
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
