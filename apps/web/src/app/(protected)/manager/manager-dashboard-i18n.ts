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
  // Attention layer -- Manager Attention UX Reconciliation (2026-08-21):
  // Level-1 summary and the per-category action targets ("View shift" /
  // "Open Inventory"). Individual queue-item card fields.
  attentionItemCorrectionTitle: string;
  attentionItemExchangeTitle: string;
  attentionItemConflictTitle: string;
  attentionItemInventoryTitle: string;
  attentionWaitingDecision: string;
  attentionConflictSummary: string;
  attentionReplacementNotSelected: string;
  attentionReplacementRequiredReason: string;
  attentionViewShift: string;
  attentionOpenInventory: string;
  attentionTargetWord: string;
  attentionSubmittedAtPrefix: string;
  // Attention UX Compactness Correction (2026-08-21): the always-visible
  // Level-3 item feed was replaced by two on-demand surfaces -- a
  // conflicts-only popup (opened from the "Unavailable conflicts" chip) and
  // a single "Review all" popup grouping every category by severity.
  attentionConflictsPopupTitle: string;
  attentionReviewAll: string;
  attentionReviewAllTitle: string;
  attentionWarningsGroupHeading: string;
  // Entry-points card (Recipes/Inventory/Manage staff)
  entryPointsHeading: string;
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
  deleteStaffButton: string;
  deletingStaff: string;
  confirmDeleteStaffTitle: string;
  confirmDeleteStaffBody: string;
  staffDeleted: string;
  staffBlockedByHistory: string;
  // 2026-08-21 redesign: compact row summary badges (LINE/access), read-only.
  lineLinkedShort: string;
  lineNotLinkedShort: string;
  accessActiveShort: string;
  accessPendingShort: string;
  accessExpiredShort: string;
  accessNoneShort: string;
  accessSectionHeading: string;
  dangerZoneHeading: string;
  // 2026-08-21: InvitationCell's own interactive copy -- previously JA-only
  // per an older, now-superseded Founder scope decision (F4) made back when
  // the surrounding Manager dashboard was still English-only; the whole
  // popup is bilingual now, so a JA-only cell inside it just reads as a
  // missing translation instead of a deliberate choice. Founder confirmed
  // 2026-08-21: localize it like everything else around it.
  inviteButton: string;
  resendButton: string;
  sendingStatus: string;
  recoverAccessButton: string;
  revokeInvitationButton: string;
  recoveryEmailSentMessage: string;
  confirmRecoverAccessTitle: string;
  confirmRecoverAccessBody: string;
  confirmSendButton: string;
  confirmRevokeInvitationTitle: string;
  confirmRevokeInvitationBody: string;
  inviteErrorNotFound: string;
  inviteErrorDuplicate: string;
  inviteErrorGeneric: string;
  revokeErrorNotFound: string;
  revokeErrorGeneric: string;
  recoverErrorGeneric: string;
  errorUnauthorizedAction: string;
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
  // WP-8: understaffed-day column marker + past-day pending-correction cell marker
  understaffedDayAriaLabel: string;
  pendingCorrectionCellAriaLabel: string;
  // WP-9: shared "?" help affordance on the Manage Staff popup
  staffPopupHelpAriaLabel: string;
  staffPopupHelpTitle: string;
  staffPopupHelpBody: string;
  // Staff-name detail popup (A6)
  staffNamePopupTitlePrefix: string;
  staffNamePopupMonth: string;
  staffNamePopupWorkedHours: string;
  staffNamePopupHourlyWage: string;
  staffNamePopupEarnedSoFar: string;
  staffNamePopupCopyReport: string;
  staffNamePopupCopied: string;
  staffNamePopupCopyFailed: string;
  // Settings section (A8)
  settingsCardTitle: string;
  settingsHelpBody: string;
  requiredHeadcountHeading: string;
  maxWorkHoursLabel: string;
  weekdayAriaSuffix: string;
  nameLabel: string;
  optionalNameLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  addShiftType: string;
  deactivateShiftTypeButton: string;
  confirmDeactivateShiftTypeTitle: string;
  confirmDeactivateShiftTypeBody: string;
  showDeactivatedShiftTypes: string;
  hideDeactivatedShiftTypes: string;
  deactivatedShiftTypesHeading: string;
  deactivatedShiftTypesEmpty: string;
  reactivate: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
  duplicateShiftTypeName: string;
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
  // WP-11: shared "Archive" toggle (Correction requests + Shift exchange requests popups)
  showArchiveButton: string;
  hideArchiveButton: string;
  correctionsPopupHelpAriaLabel: string;
  correctionsPopupHelpTitle: string;
  correctionsPopupHelpBody: string;
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
  exchangesPopupHelpAriaLabel: string;
  exchangesPopupHelpTitle: string;
  exchangesPopupHelpBody: string;
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
    attentionItemCorrectionTitle: 'Attendance correction',
    attentionItemExchangeTitle: 'Shift exchange',
    attentionItemConflictTitle: 'Schedule conflict',
    attentionItemInventoryTitle: 'Inventory shortage',
    attentionWaitingDecision: 'Waiting for your decision',
    attentionConflictSummary: 'Assigned while marked unavailable',
    attentionReplacementNotSelected: 'Replacement not selected yet',
    attentionReplacementRequiredReason: 'Replacement employee is required before approval.',
    attentionViewShift: 'View shift',
    attentionOpenInventory: 'Open Inventory',
    attentionTargetWord: 'target',
    attentionSubmittedAtPrefix: 'Submitted',
    attentionConflictsPopupTitle: 'Unavailable conflicts',
    attentionReviewAll: 'Review all',
    attentionReviewAllTitle: 'All attention items',
    attentionWarningsGroupHeading: 'Warnings',
    entryPointsHeading: 'Staff & recipe & Inventory management',
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
    deleteStaffButton: 'Delete permanently',
    deletingStaff: 'Deleting...',
    confirmDeleteStaffTitle: 'Permanently delete this staff member?',
    confirmDeleteStaffBody: 'This cannot be undone — their profile will be permanently removed.',
    staffDeleted: 'Staff member permanently deleted.',
    staffBlockedByHistory: 'This staff member has shift, attendance, or request history, so they cannot be permanently deleted. Use Deactivate instead.',
    lineLinkedShort: 'LINE linked',
    lineNotLinkedShort: 'LINE not linked',
    accessActiveShort: 'Access active',
    accessPendingShort: 'Invited',
    accessExpiredShort: 'Invite expired',
    accessNoneShort: 'No access',
    accessSectionHeading: 'Account access',
    dangerZoneHeading: 'Danger zone',
    inviteButton: 'Invite',
    resendButton: 'Resend',
    sendingStatus: 'Sending…',
    recoverAccessButton: 'Recover access',
    revokeInvitationButton: 'Revoke',
    recoveryEmailSentMessage: 'Recovery email sent.',
    confirmRecoverAccessTitle: 'Send this staff member a password-reset email?',
    confirmRecoverAccessBody: 'They can reset their password using the link in the email.',
    confirmSendButton: 'Send',
    confirmRevokeInvitationTitle: 'Revoke this invitation?',
    confirmRevokeInvitationBody: 'The revoked invitation becomes invalid. You can resend it later if needed.',
    inviteErrorNotFound: 'Staff member not found.',
    inviteErrorDuplicate: 'This staff member already has account access.',
    inviteErrorGeneric: 'Could not send the invitation. Please try again.',
    revokeErrorNotFound: 'This invitation no longer exists.',
    revokeErrorGeneric: 'Could not revoke the invitation. Please try again.',
    recoverErrorGeneric: 'Could not send the recovery email. Please try again.',
    errorUnauthorizedAction: 'You do not have permission to do this.',
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
    understaffedDayAriaLabel: 'Understaffed -- below the required headcount for this day',
    pendingCorrectionCellAriaLabel: 'This shift has a pending correction request awaiting your review',
    staffPopupHelpAriaLabel: 'About staff management',
    staffPopupHelpTitle: 'About staff management',
    staffPopupHelpBody:
      'Deactivating a staff member hides them from scheduling without deleting their history; reactivate anytime. Deleting a staff member is permanent and only allowed once they have no protected shift/attendance history.',
    staffNamePopupTitlePrefix: 'Staff',
    staffNamePopupMonth: 'Month',
    staffNamePopupWorkedHours: 'Worked hours (this month)',
    staffNamePopupHourlyWage: 'Hourly rate',
    staffNamePopupEarnedSoFar: 'Earned so far',
    staffNamePopupCopyReport: 'Copy monthly report',
    staffNamePopupCopied: 'Copied.',
    staffNamePopupCopyFailed: 'Could not copy -- please copy the numbers manually.',
    settingsCardTitle: 'Settings',
    settingsHelpBody:
      'These settings control auto-distribution (required staff per weekday) and the max monthly hours guardrail. Shift types define the reusable start/end/break templates offered when assigning a shift.',
    requiredHeadcountHeading: 'Required staff per shift, by weekday',
    maxWorkHoursLabel: 'Max staff working hours / month',
    weekdayAriaSuffix: ' required headcount',
    nameLabel: 'Name',
    optionalNameLabel: 'Name (optional)',
    startTimeLabel: 'Start time',
    endTimeLabel: 'End time',
    addShiftType: 'Add shift type',
    deactivateShiftTypeButton: 'Deactivate',
    confirmDeactivateShiftTypeTitle: 'Deactivate this shift type?',
    confirmDeactivateShiftTypeBody:
      'Deactivating will remove it from the choices offered when creating new shifts. Past shift records are preserved, and you can reactivate it anytime.',
    showDeactivatedShiftTypes: 'Show deactivated shift types',
    hideDeactivatedShiftTypes: 'Hide deactivated shift types',
    deactivatedShiftTypesHeading: 'Deactivated shift types',
    deactivatedShiftTypesEmpty: 'No deactivated shift types.',
    reactivate: 'Reactivate',
    savingStatus: 'Saving...',
    savedStatus: 'Saved',
    saveErrorStatus: 'Could not save',
    duplicateShiftTypeName: 'An active shift type with this name already exists.',
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
    showArchiveButton: 'Show archive',
    hideArchiveButton: 'Hide archive',
    correctionsPopupHelpAriaLabel: 'About correction requests',
    correctionsPopupHelpTitle: 'About correction requests',
    correctionsPopupHelpBody:
      'Staff submit these when their actual clock-in/out or break differs from what was recorded. Approving applies the requested change to their attendance record; rejecting leaves the original record untouched. "Recently decided" shows the last 10 by default -- use "Show archive" to see the full history.',
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
    exchangesPopupHelpAriaLabel: 'About shift exchange requests',
    exchangesPopupHelpTitle: 'About shift exchange requests',
    exchangesPopupHelpBody:
      'Staff request these to change, cancel, or exchange a published shift with a colleague. An Exchange request has nothing to approve until a colleague accepts it (shown as "awaiting candidate" until then). "Recently decided" shows the last 10 by default -- use "Show archive" to see the full history.',
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
    attentionItemCorrectionTitle: '勤怠修正',
    attentionItemExchangeTitle: 'シフト交換',
    attentionItemConflictTitle: 'スケジュールの重複',
    attentionItemInventoryTitle: '在庫不足',
    attentionWaitingDecision: 'あなたの判断を待っています',
    attentionConflictSummary: '「不可」と回答した日にシフトが割り当てられています',
    attentionReplacementNotSelected: '交換相手がまだ選ばれていません',
    attentionReplacementRequiredReason: '承認するには交換相手のスタッフが必要です。',
    attentionViewShift: 'シフトを見る',
    attentionOpenInventory: '在庫を開く',
    attentionTargetWord: '目標',
    attentionSubmittedAtPrefix: '申請日時',
    attentionConflictsPopupTitle: '不可との重複',
    attentionReviewAll: 'すべて確認',
    attentionReviewAllTitle: 'すべての要確認項目',
    attentionWarningsGroupHeading: '注意事項',
    entryPointsHeading: 'スタッフ・レシピ・在庫管理',
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
    deleteStaffButton: '完全に削除',
    deletingStaff: '削除中...',
    confirmDeleteStaffTitle: 'このスタッフを完全に削除しますか？',
    confirmDeleteStaffBody: 'この操作は取り消せません -- プロフィールは完全に削除されます。',
    staffDeleted: 'スタッフを完全に削除しました。',
    staffBlockedByHistory: 'このスタッフにはシフト・勤怠・申請などの履歴があるため完全に削除できません。「無効化」をご利用ください。',
    lineLinkedShort: 'LINE連携済み',
    lineNotLinkedShort: 'LINE未連携',
    accessActiveShort: 'アクセス有効',
    accessPendingShort: '招待中',
    accessExpiredShort: '招待期限切れ',
    accessNoneShort: 'アクセスなし',
    accessSectionHeading: 'アカウントアクセス',
    dangerZoneHeading: '危険な操作',
    inviteButton: '招待する',
    resendButton: '再送信',
    sendingStatus: '送信中…',
    recoverAccessButton: 'アクセスを回復',
    revokeInvitationButton: '取り消す',
    recoveryEmailSentMessage: '復旧メールを送信しました。',
    confirmRecoverAccessTitle: 'このスタッフにパスワード再設定メールを送信しますか？',
    confirmRecoverAccessBody: 'スタッフはメールに記載されたリンクからパスワードを再設定できます。',
    confirmSendButton: '送信する',
    confirmRevokeInvitationTitle: 'この招待を取り消しますか？',
    confirmRevokeInvitationBody: '取り消した招待は無効になります。必要であれば再送信できます。',
    inviteErrorNotFound: '従業員が見つかりません。',
    inviteErrorDuplicate: 'この従業員はすでにアクセス権を持っています。',
    inviteErrorGeneric: '招待を送信できませんでした。もう一度お試しください。',
    revokeErrorNotFound: 'この招待はすでに存在しません。',
    revokeErrorGeneric: '取り消せませんでした。もう一度お試しください。',
    recoverErrorGeneric: '復旧メールを送信できませんでした。もう一度お試しください。',
    errorUnauthorizedAction: 'この操作を行う権限がありません。',
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
    understaffedDayAriaLabel: '人員不足 -- この日の必要人数を下回っています',
    pendingCorrectionCellAriaLabel: 'このシフトには確認待ちの修正申請があります',
    staffPopupHelpAriaLabel: 'スタッフ管理について',
    staffPopupHelpTitle: 'スタッフ管理について',
    staffPopupHelpBody:
      '無効化すると履歴を削除せずにシフト作成の対象から外れます -- いつでも再度有効化できます。削除は完全かつ元に戻せず、保護対象のシフト・勤怠履歴がない場合のみ実行できます。',
    staffNamePopupTitlePrefix: 'スタッフ',
    staffNamePopupMonth: '対象月',
    staffNamePopupWorkedHours: '実働時間（今月）',
    staffNamePopupHourlyWage: '時給',
    staffNamePopupEarnedSoFar: '現時点の概算支給額',
    staffNamePopupCopyReport: '月次レポートをコピー',
    staffNamePopupCopied: 'コピーしました。',
    staffNamePopupCopyFailed: 'コピーできませんでした。数値を手動でコピーしてください。',
    settingsCardTitle: '設定',
    settingsHelpBody:
      'ここでの設定は自動割り当て（曜日ごとの必要人数）と月間最大勤務時間の上限に反映されます。シフト種別は、シフト割り当て時に選べる開始・終了・休憩のテンプレートです。',
    requiredHeadcountHeading: '曜日ごとの各シフト必要人数',
    maxWorkHoursLabel: 'スタッフ最大勤務時間 / 月',
    weekdayAriaSuffix: '曜日の必要人数',
    nameLabel: '名称',
    optionalNameLabel: '名称（任意）',
    startTimeLabel: '開始時刻',
    endTimeLabel: '終了時刻',
    addShiftType: 'シフト種別を追加',
    deactivateShiftTypeButton: '無効化',
    confirmDeactivateShiftTypeTitle: 'このシフト種別を無効化しますか？',
    confirmDeactivateShiftTypeBody: '無効化すると、新しいシフト作成時の選択肢に表示されなくなります。過去のシフト記録は保持され、いつでも再度有効化できます。',
    showDeactivatedShiftTypes: '無効化したシフト種別を表示',
    hideDeactivatedShiftTypes: '無効化したシフト種別を隠す',
    deactivatedShiftTypesHeading: '無効化済みのシフト種別',
    deactivatedShiftTypesEmpty: '無効化されたシフト種別はありません。',
    reactivate: '再開',
    savingStatus: '保存中…',
    savedStatus: '保存しました',
    saveErrorStatus: '保存できませんでした',
    duplicateShiftTypeName: '同じ名称の有効なシフト種別がすでに存在します。',
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
    showArchiveButton: 'アーカイブを表示',
    hideArchiveButton: 'アーカイブを隠す',
    correctionsPopupHelpAriaLabel: '修正依頼について',
    correctionsPopupHelpTitle: '修正依頼について',
    correctionsPopupHelpBody:
      '実際の出退勤や休憩が記録と異なる場合にスタッフが申請します。承認すると勤怠記録に反映され、却下すると元の記録は変更されません。「最近対応した項目」はデフォルトで直近10件のみ表示 -- 「アーカイブを表示」で全履歴を確認できます。',
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
    exchangesPopupHelpAriaLabel: 'シフト交換リクエストについて',
    exchangesPopupHelpTitle: 'シフト交換リクエストについて',
    exchangesPopupHelpBody:
      '公開済みのシフトの変更・キャンセル・同僚との交換をスタッフが申請します。交換リクエストは同僚が承諾するまで承認できません（それまでは「交換相手を待っています」と表示）。「最近対応した項目」はデフォルトで直近10件のみ表示 -- 「アーカイブを表示」で全履歴を確認できます。',
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

/** Level-1 attention summary subtitle, e.g. "3 require action · 6 warnings" -- omits either half when its count is 0 rather than showing "0 warnings". */
export const attentionSummarySubtitle: Record<Lang, (actionRequiredCount: number, warningCount: number) => string> = {
  en: (actionRequiredCount, warningCount) => {
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`${actionRequiredCount} require action`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    return parts.join(' · ');
  },
  ja: (actionRequiredCount, warningCount) => {
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`対応が必要 ${actionRequiredCount}件`);
    if (warningCount > 0) parts.push(`注意事項 ${warningCount}件`);
    return parts.join(' · ');
  },
};

/**
 * Compact single-line Level-1 subtitle for the main Manager Dashboard, e.g.
 * "4 require action" -- Attention UX Compactness Correction (2026-08-21):
 * deliberately omits the warning count here (unlike `attentionSummarySubtitle`,
 * which still carries the full "N require action · M warnings" breakdown
 * used inside the "Review all" popup) so the always-visible dashboard line
 * surfaces only the single number a Manager most needs at a glance; the
 * full breakdown is one click away, not duplicated on the dashboard itself.
 */
export const attentionRequireActionCompact: Record<Lang, (actionRequiredCount: number) => string> = {
  en: (actionRequiredCount) => `${actionRequiredCount} require action`,
  ja: (actionRequiredCount) => `対応が必要 ${actionRequiredCount}件`,
};

/** "N items require restocking" for the single collapsed Inventory queue item. */
export const attentionInventoryShortageSummary: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} item(s) require restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};
