import { makeTranslator, type Lang } from './i18n';

/** UI-chrome dictionary for the Manager screen (both `/demo/cafe/manager` -- not yet wired, and the DB-backed `_client-preview/mame-to-cha/manager` preview, which is). Static system-chrome copy only -- not for user-authored content (staff names are PII and never appear here; recipe content has its own concern, see docs). */
interface ManagerDict {
  dashboardTitle: string;
  needsReview: string;
  shiftTable: string;
  shiftTableHelp: string;
  prevWeek: string;
  today: string;
  nextWeek: string;
  staffListLoadError: string;
  staffListEmpty: string;
  monthlyReportCsv: string;
  monthlyReportComingSoon: string;
  saved: string;
  staffManagementSubtitle: string;
  addStaff: string;
  staffListErrorShort: string;
  staffListEmptyShort: string;
  roleFallback: string;
  employmentTypeUnset: string;
  active: string;
  inactive: string;
  edit: string;
  deactivate: string;
  reactivate: string;
  editStaffTitle: string;
  addStaffTitle: string;
  displayName: string;
  position: string;
  employmentType: string;
  cancel: string;
  save: string;
  shiftAddSection: string;
  staffLabel: string;
  selectPlaceholder: string;
  shiftTypeLabel: string;
  customOption: string;
  workDateLabel: string;
  breakMinutesLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  roleLabel: string;
  noteLabel: string;
  addShift: string;
  editShiftsSection: string;
  noShiftsThisWeek: string;
  dateColumn: string;
  timeColumn: string;
  assignedColumn: string;
  unassigned: string;
  publishedLabel: string;
  updateShift: string;
  removeShift: string;
  shiftModalTitleFallback: string;
  unassignShift: string;
  correctionRequestsTrigger: string;
  correctionRequestsModalTitle: string;
  recentDecisionsHeading: string;
  staffColumn: string;
  dateColumnShort: string;
  attendanceColumn: string;
  statusColumn: string;
  contentColumn: string;
  statusApproved: string;
  statusRejected: string;
  dash: string;
  approve: string;
  reject: string;
  noPendingCorrections: string;
  autoScheduleButton: string;
  publishScheduleButton: string;
  autoScheduleConfirmBody: string;
  settingsCardTitle: string;
  requiredHeadcountHeading: string;
  maxWorkHoursLabel: string;
  shiftTypesHeading: string;
  shiftTypesLoadError: string;
  shiftTypesEmpty: string;
  nameLabel: string;
  optionalNameLabel: string;
  addShiftType: string;
  saveSettings: string;
  staffRecipeManagementTitle: string;
  manageStaffButton: string;
  manageRecipesButton: string;
  manageStaffModalTitle: string;
  manageRecipesModalTitle: string;
  recipeManagerHelp: string;
  recipeListLoadError: string;
  recipeListEmpty: string;
  recipeUntitled: string;
  recipeStatusPublished: string;
  recipeStatusDraft: string;
  recipeStatusArchived: string;
  recipeKindRecipe: string;
  recipeKindInstruction: string;
  savingEllipsis: string;
  respondedFeedback: string;
  autoScheduleConfirmTitle: string;
  autoScheduleConfirmAction: string;
  deleteButton: string;
  weekdayAriaSuffix: string;
  unknownStaffFallback: string;
  backToHub: string;
  removeStaffButton: string;
  confirmRemoveStaffTitle: string;
  confirmRemoveStaffBody: string;
  permanentDeleteStaffButton: string;
  confirmPermanentDeleteStaffTitle: string;
  confirmPermanentDeleteStaffBody: string;
  confirmPermanentDeleteStaffButton: string;
  staffFilterActive: string;
  staffFilterInactive: string;
  staffFilterAll: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
}

const MANAGER_DICT: Record<Lang, ManagerDict> = {
  ja: {
    dashboardTitle: '店長ダッシュボード',
    needsReview: '要確認',
    shiftTable: 'シフト表',
    shiftTableHelp:
      'セルをクリックして手動でシフトを編集できます。列見出しの「!」は必要人数に対して人員が不足している日を示します。',
    prevWeek: '前の週',
    today: '今日',
    nextWeek: '次の週',
    staffListLoadError: 'スタッフ一覧を読み込めませんでした。',
    staffListEmpty: 'スタッフを追加すると週間シフト表が表示されます。',
    monthlyReportCsv: '月間レポートCSV',
    monthlyReportComingSoon: '月間レポートは次のリリースで有効になります',
    saved: '保存しました。',
    staffManagementSubtitle: '在籍状況と店舗での役割を管理します。',
    addStaff: 'スタッフを追加',
    staffListErrorShort: 'スタッフ一覧を読み込めませんでした。',
    staffListEmptyShort: 'スタッフがまだ登録されていません。',
    roleFallback: 'スタッフ',
    employmentTypeUnset: '雇用形態未設定',
    active: '在籍中',
    inactive: '休止中',
    edit: '編集',
    deactivate: '休止',
    reactivate: '再開',
    editStaffTitle: 'スタッフを編集',
    addStaffTitle: 'スタッフを追加',
    displayName: '表示名',
    position: '役職',
    employmentType: '雇用形態',
    cancel: 'キャンセル',
    save: '保存',
    shiftAddSection: 'シフトの追加',
    staffLabel: 'スタッフ',
    selectPlaceholder: '選択してください',
    shiftTypeLabel: 'シフト種別',
    customOption: 'カスタム',
    workDateLabel: '勤務日',
    breakMinutesLabel: '休憩(分)',
    startTimeLabel: '開始時刻',
    endTimeLabel: '終了時刻',
    roleLabel: '役割',
    noteLabel: 'メモ',
    addShift: 'シフトを追加',
    editShiftsSection: 'シフトの編集・解除',
    noShiftsThisWeek: '今週のシフトはまだありません。',
    dateColumn: '日付',
    timeColumn: '時刻',
    assignedColumn: '担当',
    unassigned: '(未割当)',
    publishedLabel: '公開済み',
    updateShift: '更新する',
    removeShift: '解除',
    shiftModalTitleFallback: 'スタッフ',
    unassignShift: 'シフトを解除',
    correctionRequestsTrigger: '勤怠修正申請',
    correctionRequestsModalTitle: '勤怠修正申請への対応',
    recentDecisionsHeading: '最近の対応履歴',
    staffColumn: 'スタッフ',
    dateColumnShort: '日付',
    attendanceColumn: '勤怠',
    statusColumn: '状態',
    contentColumn: '内容',
    statusApproved: '承認済み',
    statusRejected: '却下',
    dash: '-',
    approve: '承認',
    reject: '却下',
    noPendingCorrections: '対応が必要な修正申請はありません。',
    autoScheduleButton: '自動シフト作成',
    publishScheduleButton: 'スケジュールを公開',
    autoScheduleConfirmBody: 'のシフトを、スタッフの希望と設定内容にもとづいて自動作成します。公開済みのシフトは上書きしません。続けますか？',
    settingsCardTitle: '設定',
    requiredHeadcountHeading: '必要人数（曜日ごと）',
    maxWorkHoursLabel: 'スタッフ最大勤務時間 / 月',
    shiftTypesHeading: 'シフト種別',
    shiftTypesLoadError: 'シフト種別を読み込めませんでした。',
    shiftTypesEmpty: 'シフト種別がまだ設定されていません。',
    nameLabel: '名称',
    optionalNameLabel: '名称（任意）',
    addShiftType: 'シフト種別を追加',
    saveSettings: '設定を保存',
    staffRecipeManagementTitle: 'スタッフ・レシピ管理',
    manageStaffButton: 'スタッフ管理',
    manageRecipesButton: 'レシピ管理',
    manageStaffModalTitle: 'スタッフ管理',
    manageRecipesModalTitle: 'レシピ管理',
    recipeManagerHelp: '店舗のレシピと業務手順を管理します。インストラクションはスタッフ画面の先頭に表示されます。',
    recipeListLoadError: '一覧を取得できません。',
    recipeListEmpty: 'レシピがまだ登録されていません。',
    recipeUntitled: '名称未設定',
    recipeStatusPublished: '公開中',
    recipeStatusDraft: '下書き',
    recipeStatusArchived: 'アーカイブ',
    recipeKindRecipe: 'レシピ ★',
    recipeKindInstruction: 'インストラクション ⓘ',
    savingEllipsis: '保存中…',
    respondedFeedback: '対応しました。',
    autoScheduleConfirmTitle: '自動シフト作成',
    autoScheduleConfirmAction: '自動作成する',
    deleteButton: '削除',
    weekdayAriaSuffix: '曜日の必要人数',
    unknownStaffFallback: '不明なスタッフ',
    backToHub: 'ホームに戻る',
    removeStaffButton: 'スタッフを削除',
    confirmRemoveStaffTitle: 'スタッフを削除しますか？',
    confirmRemoveStaffBody:
      '在籍中のスタッフ一覧・シフト割り当て・ログインからすぐに外れます。勤務履歴・勤怠・レポート・申請の記録はすべて保持され、後で「編集」から復帰できます。',
    permanentDeleteStaffButton: '完全に削除する',
    confirmPermanentDeleteStaffTitle: 'このスタッフを完全に削除しますか？',
    confirmPermanentDeleteStaffBody:
      'シフト・勤怠・申請などの履歴が一切ない場合のみ削除できます。この操作は取り消せません。',
    confirmPermanentDeleteStaffButton: '完全に削除する',
    staffFilterActive: '在籍中',
    staffFilterInactive: '削除済み',
    staffFilterAll: 'すべて',
    savingStatus: '保存中…',
    savedStatus: '保存しました',
    saveErrorStatus: '保存できませんでした',
  },
  en: {
    dashboardTitle: 'Manager dashboard',
    needsReview: 'Needs review',
    shiftTable: 'Shift schedule',
    shiftTableHelp:
      'Click a cell to edit that shift manually. A "!" in a column header marks a day understaffed relative to the required headcount.',
    prevWeek: 'Prev week',
    today: 'Today',
    nextWeek: 'Next week',
    staffListLoadError: 'Could not load the staff list.',
    staffListEmpty: 'Add staff to see the weekly shift table.',
    monthlyReportCsv: 'Monthly report CSV',
    monthlyReportComingSoon: 'The monthly report will be enabled in a future release',
    saved: 'Saved.',
    staffManagementSubtitle: 'Manage staff status and their role at this store.',
    addStaff: 'Add staff',
    staffListErrorShort: 'Could not load the staff list.',
    staffListEmptyShort: 'No staff have been added yet.',
    roleFallback: 'Staff',
    employmentTypeUnset: 'Employment type not set',
    active: 'Active',
    inactive: 'Inactive',
    edit: 'Edit',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    editStaffTitle: 'Edit staff',
    addStaffTitle: 'Add staff',
    displayName: 'Display name',
    position: 'Position',
    employmentType: 'Employment type',
    cancel: 'Cancel',
    save: 'Save',
    shiftAddSection: 'Add a shift',
    staffLabel: 'Staff',
    selectPlaceholder: 'Please select',
    shiftTypeLabel: 'Shift type',
    customOption: 'Custom',
    workDateLabel: 'Work date',
    breakMinutesLabel: 'Break (min)',
    startTimeLabel: 'Start time',
    endTimeLabel: 'End time',
    roleLabel: 'Role',
    noteLabel: 'Note',
    addShift: 'Add shift',
    editShiftsSection: 'Edit or remove shifts',
    noShiftsThisWeek: 'No shifts yet this week.',
    dateColumn: 'Date',
    timeColumn: 'Time',
    assignedColumn: 'Assigned',
    unassigned: '(Unassigned)',
    publishedLabel: 'Published',
    updateShift: 'Update',
    removeShift: 'Remove',
    shiftModalTitleFallback: 'Staff',
    unassignShift: 'Unassign shift',
    correctionRequestsTrigger: 'Attendance correction requests',
    correctionRequestsModalTitle: 'Respond to attendance correction requests',
    recentDecisionsHeading: 'Recent decisions',
    staffColumn: 'Staff',
    dateColumnShort: 'Date',
    attendanceColumn: 'Attendance',
    statusColumn: 'Status',
    contentColumn: 'Details',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    dash: '-',
    approve: 'Approve',
    reject: 'Reject',
    noPendingCorrections: 'No correction requests need attention.',
    autoScheduleButton: 'Auto-create shifts',
    publishScheduleButton: 'Publish schedule',
    autoScheduleConfirmBody:
      'Automatically creates shifts using staff shift preferences and your settings. Already-published shifts are not overwritten. Continue?',
    settingsCardTitle: 'Settings',
    requiredHeadcountHeading: 'Required headcount (per weekday)',
    maxWorkHoursLabel: 'Max staff working hours / month',
    shiftTypesHeading: 'Shift types',
    shiftTypesLoadError: 'Could not load shift types.',
    shiftTypesEmpty: 'No shift types have been set up yet.',
    nameLabel: 'Name',
    optionalNameLabel: 'Name (optional)',
    addShiftType: 'Add shift type',
    saveSettings: 'Save settings',
    staffRecipeManagementTitle: 'Staff & recipe management',
    manageStaffButton: 'Manage staff',
    manageRecipesButton: 'Manage recipes',
    manageStaffModalTitle: 'Manage staff',
    manageRecipesModalTitle: 'Manage recipes',
    recipeManagerHelp: 'Manage this store’s recipes and manuals. Instructions appear at the top of the staff screen.',
    recipeListLoadError: 'Could not load the list.',
    recipeListEmpty: 'No recipes have been added yet.',
    recipeUntitled: 'Untitled',
    recipeStatusPublished: 'Published',
    recipeStatusDraft: 'Draft',
    recipeStatusArchived: 'Archived',
    recipeKindRecipe: 'Recipe ★',
    recipeKindInstruction: 'Instruction ⓘ',
    savingEllipsis: 'Saving…',
    respondedFeedback: 'Response recorded.',
    autoScheduleConfirmTitle: 'Auto-create shifts',
    autoScheduleConfirmAction: 'Auto-create',
    deleteButton: 'Delete',
    weekdayAriaSuffix: ' required headcount',
    unknownStaffFallback: 'Unknown staff',
    backToHub: 'Back to hub',
    removeStaffButton: 'Remove staff',
    confirmRemoveStaffTitle: 'Remove this staff member?',
    confirmRemoveStaffBody:
      'They will immediately disappear from the active staff list, scheduling, and login. Shifts, attendance, reports, and requests all stay on record, and you can restore them later from Edit.',
    permanentDeleteStaffButton: 'Delete permanently',
    confirmPermanentDeleteStaffTitle: 'Delete this staff member permanently?',
    confirmPermanentDeleteStaffBody:
      'This only works when they have zero shift/attendance/request history. This cannot be undone.',
    confirmPermanentDeleteStaffButton: 'Delete permanently',
    staffFilterActive: 'Active',
    staffFilterInactive: 'Removed',
    staffFilterAll: 'All',
    savingStatus: 'Saving…',
    savedStatus: 'Saved',
    saveErrorStatus: 'Could not save',
  },
};

export type ManagerDictKey = keyof ManagerDict;

export const tManager = makeTranslator(MANAGER_DICT);
