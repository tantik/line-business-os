import { makeTranslator, type Lang } from './i18n';

interface StaffDict {
  clockIn: string;
  clockOut: string;
  breakStart: string;
  breakEnd: string;
  workStatus: string;
  statusIdle: string;
  statusClockedIn: string;
  statusOnBreak: string;
  statusClockedOut: string;
  shiftTable: string;
  all: string;
  onlyMe: string;
  workedHours: string;
  transport: string;
  transportRemembered: string;
  todaysMessage: string;
  messagePlaceholder: string;
  save: string;
  saved: string;
  submitNextMonthPreference: string;
  submittedSuffix: string;
  prevWeek: string;
  today: string;
  nextWeek: string;
  cancel: string;
  submit: string;
  submitPreference: string;
  staffColumnHeader: string;
  managerRoleSuffix: string;
  notScheduled: string;
  correctionRequestAlready: string;
  messageAlready: string;
  shortageTooltip: string;
  loading: string;
  workReportTitle: string;
  plannedShift: string;
  reportClockIn: string;
  reportClockOut: string;
  breakMinutesLabel: string;
  minutesSuffix: string;
  message: string;
  none: string;
  dash: string;
  requestCorrection: string;
  correctionRequested: string;
  correctionStatusPending: string;
  correctionStatusApproved: string;
  correctionStatusRejected: string;
  correctionModalTitle: string;
  workDate: string;
  actualClockIn: string;
  actualClockOut: string;
  breakMinutesInput: string;
  reasonMessage: string;
  reasonPlaceholder: string;
  preferenceModalTitle: string;
  alreadySubmittedNote: string;
  tapToSelectHelp: string;
  dashOrTimeOffHelp: string;
  optionalMessage: string;
  optionalNotePlaceholder: string;
  unspecified: string;
}

/** UI-chrome dictionary for `/demo/cafe` (staff app) and the modals it opens. Static demo copy only. */
const STAFF_DICT: Record<Lang, StaffDict> = {
  ja: {
    clockIn: '出勤',
    clockOut: '退勤',
    breakStart: '休憩開始',
    breakEnd: '休憩終了',
    workStatus: '勤務状況',
    statusIdle: '未出勤',
    statusClockedIn: '勤務中',
    statusOnBreak: '休憩中',
    statusClockedOut: '退勤済み',
    shiftTable: 'シフト表',
    all: '全体',
    onlyMe: '自分だけ',
    workedHours: '実働時間',
    transport: '交通費',
    transportRemembered: '（前回入力値を記憶）',
    todaysMessage: '本日のメッセージ',
    messagePlaceholder: '店長への連絡事項があれば入力してください',
    save: '保存',
    saved: '保存しました',
    submitNextMonthPreference: '来月のシフト希望を提出',
    submittedSuffix: '済み',
    prevWeek: '前の週',
    today: '今日',
    nextWeek: '次の週',
    cancel: 'キャンセル',
    submit: '送信する',
    submitPreference: '提出する',
    staffColumnHeader: 'スタッフ',
    managerRoleSuffix: '店長',
    notScheduled: '未設定',
    correctionRequestAlready: '修正依頼あり',
    messageAlready: 'メッセージあり',
    shortageTooltip: '人手不足の可能性があります',
    loading: '読み込み中...',
    // WorkReportModal
    workReportTitle: '勤務記録',
    plannedShift: 'シフト予定',
    reportClockIn: '出勤',
    reportClockOut: '退勤',
    breakMinutesLabel: '休憩',
    minutesSuffix: '分',
    message: 'メッセージ',
    none: 'なし',
    dash: '－',
    requestCorrection: '勤務時間の修正を依頼',
    correctionRequested: '修正依頼済み',
    correctionStatusPending: '確認待ち',
    correctionStatusApproved: '承認されました',
    correctionStatusRejected: '却下されました',
    // CorrectionRequestModal
    correctionModalTitle: '勤務時間の修正を依頼',
    workDate: '勤務日',
    actualClockIn: '実際の出勤時間',
    actualClockOut: '実際の退勤時間',
    breakMinutesInput: '休憩時間（分）',
    reasonMessage: '理由・メッセージ',
    reasonPlaceholder: '例: 開店準備で出勤が12分遅れました。',
    // ShiftPreferenceModal
    preferenceModalTitle: '来月のシフト希望を提出',
    alreadySubmittedNote: '提出済みです。内容を変更して再提出することもできます。',
    tapToSelectHelp: '日付をタップして希望するシフトを選択してください。',
    dashOrTimeOffHelp: '「-」は未指定、休暇は勤務不可として扱われます。',
    optionalMessage: 'メッセージ（任意）',
    optionalNotePlaceholder: '例: 10日は終日休み希望です。',
    unspecified: '未指定',
  },
  en: {
    clockIn: 'Clock in',
    clockOut: 'Clock out',
    breakStart: 'Start break',
    breakEnd: 'End break',
    workStatus: 'Work status',
    statusIdle: 'Not clocked in',
    statusClockedIn: 'Working',
    statusOnBreak: 'On break',
    statusClockedOut: 'Clocked out',
    shiftTable: 'Shift schedule',
    all: 'All',
    onlyMe: 'Only me',
    workedHours: 'Worked hours',
    transport: 'Transport',
    transportRemembered: '(remembers last value)',
    todaysMessage: "Today's message",
    messagePlaceholder: 'Leave a note for the manager if you have one',
    save: 'Save',
    saved: 'Saved',
    submitNextMonthPreference: "Submit next month's shift preference",
    submittedSuffix: ' (submitted)',
    prevWeek: 'Prev week',
    today: 'Today',
    nextWeek: 'Next week',
    cancel: 'Cancel',
    submit: 'Submit',
    submitPreference: 'Submit',
    staffColumnHeader: 'Staff',
    managerRoleSuffix: 'Manager',
    notScheduled: 'Not set',
    correctionRequestAlready: 'Correction requested',
    messageAlready: 'Message',
    shortageTooltip: 'Possible staffing shortage',
    loading: 'Loading...',
    // WorkReportModal
    workReportTitle: 'Work record',
    plannedShift: 'Planned shift',
    reportClockIn: 'Clock-in',
    reportClockOut: 'Clock-out',
    breakMinutesLabel: 'Break',
    minutesSuffix: ' min',
    message: 'Message',
    none: 'None',
    dash: '–',
    requestCorrection: 'Request a correction',
    correctionRequested: 'Correction requested',
    correctionStatusPending: 'Pending review',
    correctionStatusApproved: 'Approved',
    correctionStatusRejected: 'Rejected',
    // CorrectionRequestModal
    correctionModalTitle: 'Request a working-hours correction',
    workDate: 'Work date',
    actualClockIn: 'Actual clock-in time',
    actualClockOut: 'Actual clock-out time',
    breakMinutesInput: 'Break time (minutes)',
    reasonMessage: 'Reason / message',
    reasonPlaceholder: 'e.g. I clocked in 12 minutes late due to opening prep.',
    // ShiftPreferenceModal
    preferenceModalTitle: "Submit next month's shift preference",
    alreadySubmittedNote: 'Already submitted. You can change your answers and resubmit.',
    tapToSelectHelp: 'Tap a date to choose your preferred shift.',
    dashOrTimeOffHelp: '"-" means unspecified; time off means unavailable to work.',
    optionalMessage: 'Message (optional)',
    optionalNotePlaceholder: 'e.g. I would like the 10th off all day.',
    unspecified: 'Unspecified',
  },
};

export type StaffDictKey = keyof StaffDict;

export const tStaff = makeTranslator(STAFF_DICT);
