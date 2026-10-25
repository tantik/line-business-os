import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';
import type { UnplacedReason, WindowCode } from '@/lib/workforce/auto-distribute';
import type { RunAutoDistributionInvalidConfigReason } from '@/lib/workforce/schedule-types';
import type { ShiftRequestKind } from '@/lib/workforce/shift-exchanges';

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
  attentionConflictsPopupHelpAriaLabel: string;
  attentionConflictsPopupHelpTitle: string;
  attentionConflictsPopupHelpBody: string;
  attentionReviewAll: string;
  attentionReviewAllTitle: string;
  attentionReviewAllHelpAriaLabel: string;
  attentionReviewAllHelpTitle: string;
  attentionReviewAllHelpBody: string;
  attentionWarningsGroupHeading: string;
  // QA3 (2026-10-14): Issues + Operations exceptions folded into Attention.
  attentionIssueTitle: string;
  attentionOperationsTitle: string;
  attentionItemIssueCriticalTitle: string;
  attentionItemIssueNoticeTitle: string;
  attentionOpenIssues: string;
  attentionOpenOperations: string;
  // Entry-points card (Recipes/Inventory/Manage staff)
  entryPointsHeading: string;
  // Staff section
  staffHeading: string;
  manageStaff: string;
  addStaff: string;
  staffUnavailable: string;
  staffEmpty: string;
  /** Mission 8 Quality Sweep fix (F9/F10): fallback label when a staff/shift-type id can't be resolved to a name, instead of showing the raw id -- same convention as Inventory/Purchases' existing `unknownStaffLabel`. */
  unknownStaffLabel: string;
  unknownShiftTypeLabel: string;
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
  /** 0140 (DEBT-123 b): own staff row, non-Owner -- same wording as the server refusal (server-message-copy.ts). */
  staffSelfOffboardingBlocked: string;
  // 2026-08-21 redesign: compact row summary badges (LINE/access), read-only.
  lineLinkedShort: string;
  lineNotLinkedShort: string;
  accessActiveShort: string;
  accessPendingShort: string;
  accessExpiredShort: string;
  accessNoneShort: string;
  accessSectionHeading: string;
  dangerZoneHeading: string;
  // 4B-4a (0138): Manager appointment (Owner/Admin only).
  managerBadge: string;
  managerRoleHeading: string;
  managerRoleIsManager: string;
  managerRoleIsStaff: string;
  appointManager: string;
  revokeManager: string;
  appointManagerConfirmTitle: string;
  appointManagerConfirmBody: string;
  revokeManagerConfirmTitle: string;
  revokeManagerConfirmBody: string;
  managerAppointed: string;
  managerRevoked: string;
  managerNeedsAccountHint: string;
  managerInactiveHint: string;
  managerOwnRoleHint: string;
  managerRoleErrorPermission: string;
  managerRoleErrorSession: string;
  managerRoleErrorNotFound: string;
  managerRoleErrorModule: string;
  managerRoleErrorUnexpected: string;
  // 4B-4b (0140): Admin (管理者) appointment (Owner only). Copy keys returned by lib/workforce/admin-role.ts.
  adminBadge: string;
  adminRoleIsAdmin: string;
  appointAdmin: string;
  revokeAdmin: string;
  appointAdminConfirmTitle: string;
  appointAdminConfirmBody: string;
  revokeAdminConfirmTitle: string;
  revokeAdminConfirmBody: string;
  adminAppointed: string;
  adminRevoked: string;
  adminNeedsAccountHint: string;
  adminInactiveHint: string;
  adminOwnRoleHint: string;
  adminRoleErrorPermission: string;
  adminRoleErrorSession: string;
  adminRoleErrorNotFound: string;
  adminRoleErrorModule: string;
  adminRoleErrorUnexpected: string;
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
  inviteEmailSentMessage: string;
  inviteNoEmailExistingAccountMessage: string;
  confirmRecoverAccessTitle: string;
  confirmRecoverAccessBody: string;
  confirmSendButton: string;
  confirmRevokeInvitationTitle: string;
  confirmRevokeInvitationBody: string;
  inviteErrorNotFound: string;
  inviteErrorDuplicate: string;
  /** 0140 (DEBT-123 c): the email's account already belongs to an earlier (possibly inactive) staff record. */
  inviteErrorUserHasOtherEmployeeRecord: string;
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
  fieldLineUserId: string;
  fieldPosition: string;
  fieldHourlyWage: string;
  hourlyWageHint: string;
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
  actionsHeading: string;
  confirmUnassignShift: string;
  scheduleHelpAriaLabel: string;
  scheduleHelpTitle: string;
  scheduleHelpBody: string;
  // WP-8: understaffed-day column marker + past-day pending-correction cell marker
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
  // QA4 F2: month selector in the Staff monthly report popup.
  staffNamePopupWorkedHoursMonth: string;
  staffNamePopupEarnedMonth: string;
  staffNamePopupPrevMonth: string;
  staffNamePopupNextMonth: string;
  staffNamePopupLoading: string;
  staffNamePopupLoadFailed: string;
  staffNamePopupRetry: string;
  // QA4 F11-C: 「シフト外の出勤」 attention category.
  attentionClockInWithoutShiftTitle: string;
  attentionClockInWithoutShiftPopupHelpAriaLabel: string;
  attentionClockInWithoutShiftPopupHelpTitle: string;
  attentionClockInWithoutShiftPopupHelpBody: string;
  // Settings section (A8)
  settingsCardTitle: string;
  settingsHelpAriaLabel: string;
  settingsHelpBody: string;
  requiredHeadcountHeading: string;
  maxWorkHoursLabel: string;
  /** Weekly labour limits (0126) the auto-schedule engine respects. */
  maxWeeklyHoursLabel: string;
  maxWeeklyHoursSuffix: string;
  maxDaysPerWeekLabel: string;
  maxDaysPerWeekSuffix: string;
  weeklyLimitsHint: string;
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
  deleteShiftTypeButton: string;
  confirmDeleteShiftTypeTitle: string;
  confirmDeleteShiftTypeBody: string;
  shiftTypeBlockedByHistory: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
  duplicateShiftTypeName: string;
  // Automatic schedule (Auto Scheduling completion mission, 2026-09-04): now
  // real end-to-end. A Manager turns scheduled monthly generation ON/OFF and
  // picks the day of month (1-28) it runs on; when ON, the scheduled worker
  // generates the NEXT calendar month's schedule as a review-pending
  // proposal on that day (never auto-published, never sent via LINE). The
  // manual "create schedule automatically" button below remains a separate,
  // always-available regeneration tool for the week being viewed, sharing
  // the exact same distribution engine.
  automationSectionHeading: string;
  automationCreateOnLabel: string;
  automationDayOfMonthSuffix: string;
  automationHelpAriaLabel: string;
  automationHelpTitle: string;
  automationHelpBody: string;
  /** ON/OFF toggle label for the scheduled monthly auto-create job. */
  automationEnabledLabel: string;
  /** "Last generated: YYYY-MM" line, shown only after the scheduled worker has run at least once for this location. */
  automationLastGeneratedLabel: string;
  /** Accessible name of the scheduled auto-create run-log list (DEBT-074). */
  automationRunLogHeading: string;
  automationManualCreateButton: string;
  automationManualCreateRunning: string;
  automationLastResultHeading: string;
  autoCreateConfirmTitle: string;
  autoCreateConfirmBody: string;
  /** Shown in the confirm dialog only when part of the displayed week is already past -- the run will only touch the remaining (future) days. */
  autoCreatePastDaysExcludedNote: string;
  /** Shown instead of the button when the WHOLE displayed week is already past -- past shifts are immutable, so there's nothing left to regenerate. */
  autoCreateWeekFullyPastNote: string;
  autoCreateResultTitle: string;
  autoCreateManualPreservedNote: string;
  autoCreateShortagesHeading: string;
  autoCreateUnplacedHeading: string;
  autoCreateNonSubmittersHeading: string;
  autoCreateAssignedWithoutPreferenceHeading: string;
  autoCreateNoIssues: string;
  autoCreateUndoButton: string;
  autoCreateUndoing: string;
  autoCreateUndone: string;
  // Publishing a week's drafts (auto-created shifts are drafts; staff see only published shifts).
  publishWeekButton: string;
  publishingWeek: string;
  publishWeekConfirmTitle: string;
  // "Estimated labour cost" box below the schedule grid (Round 3, 2026-08-22)
  estimatedLabourCostLabel: string;
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
  // Weekly Schedule Founder Review Round 2 (2026-08-22): Draft/Published is
  // no longer a Manager UX concept -- editing an existing FUTURE/TODAY
  // assignment with a real field change confirms first (it's already
  // visible to the employee); a PAST edit shows a quiet inline notice
  // instead (a deliberate historical correction, not an ordinary edit).
  shiftAlreadyVisibleNotice: string;
  confirmChangeScheduledShiftTitle: string;
  correctingPastScheduleNotice: string;
  reassignEmployeeButton: string;
  // Weekly Schedule redesign: compact grid cell -- whole-cell click target,
  // "+" empty-cell affordance (future/today) vs "correct past schedule"
  // (past, quiet "-" by default).
  assignCellAriaLabelPrefix: string;
  editCellAriaLabelPrefix: string;
  /** QA3 (2026-10-14): appended to an unpublished (draft) cell's aria-label/title. */
  draftCellAriaSuffix: string;
  correctPastScheduleAriaLabelPrefix: string;
  // Shift preferences review popup (Settings entry point). "Reviewed" is
  // persisted as `workforce.shift_requests.status = 'approved'` on the
  // preference row (2026-10-06 recovery) -- a review note only, never
  // "approval" of a schedule, so the copy says 確認済み / Reviewed.
  shiftRequestsCardTitle: string;
  viewRequestsButton: string;
  shiftRequestsPopupHelpAriaLabel: string;
  shiftRequestsPopupHelpTitle: string;
  shiftRequestsPopupHelpBody: string;
  submittedPreferencesEmpty: string;
  noPreferenceSubmittedHint: string;
  markedUnavailableHint: string;
  preferenceUnavailableChip: string;
  // One-glyph cell form of preferenceUnavailableChip: a day column is ~20px wide at a 320px viewport.
  preferenceUnavailableCellShort: string;
  preferenceMonthCurrent: string;
  preferenceMonthNext: string;
  reviewPreferenceTitle: string;
  priorityExplainerBody: string;
  markReviewedButton: string;
  reviewedPreferenceTitle: string;
  reviewedPreferenceBody: string;
  unmarkReviewedButton: string;
  reviewSaveFailed: string;
  close: string;
  sendReminderTitle: string;
  sendReminderBody: string;
  reminderPreviewLabel: string;
  sendReminderButton: string;
  sendingReminder: string;
  reminderSentNotice: string;
  reminderNoEmailNotice: string;
  reminderFailedNotice: string;
  reminderNotConfiguredNotice: string;
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
  viewHistoryButton: string;
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
  // Shift Exchange Manager Resolution UX (2026-08-22): assign/change a
  // replacement employee before approval.
  exchangeReplacementLabel: string;
  exchangeReplacementNotAssigned: string;
  exchangeWaitingForCandidate: string;
  exchangeExpiredNote: string;
  assignReplacementButton: string;
  changeReplacementButton: string;
  selectReplacementTitle: string;
  searchReplacementPlaceholder: string;
  noEligibleReplacements: string;
  candidateAvailable: string;
  candidateScheduleConflict: string;
  candidateMarkedUnavailable: string;
  confirmAssignReplacementButton: string;
  assigningReplacement: string;
  // Staff<->Manager Mail module (0090): AttentionPanel chip + StaffMessagesPopup
  mailChipTitle: string;
  mailHeading: string;
  mailEmptyThreads: string;
  mailBackToThreads: string;
  mailArchivedTag: string;
  mailMoreActionsAriaLabel: string;
  mailMarkRead: string;
  mailArchive: string;
  mailComposePlaceholder: string;
  mailSend: string;
  mailSending: string;
  mailPopupHelpAriaLabel: string;
  mailPopupHelpTitle: string;
  mailPopupHelpBody: string;
  // Page chrome
  pageTitle: string;
  signOut: string;
  notSetLabel: string;
  navWeeklyReview: string;
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
  replacementAssigned: string;
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
    attentionExchangeTitle: 'Shift requests',
    attentionUnavailableConflictTitle: 'Unavailable conflicts',
    attentionInventoryTitle: 'Inventory shortage',
    attentionItemCorrectionTitle: 'Attendance correction',
    attentionItemExchangeTitle: 'Shift request',
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
    attentionConflictsPopupHelpAriaLabel: 'About unavailable conflicts',
    attentionConflictsPopupHelpTitle: 'About unavailable conflicts',
    attentionConflictsPopupHelpBody:
      'Shows shifts assigned on a day the staff member marked as unavailable. Review each item and open the shift if you need to confirm or change the assignment. This warning does not change the schedule automatically.',
    attentionReviewAll: 'Review all',
    attentionReviewAllTitle: 'All attention items',
    attentionReviewAllHelpAriaLabel: 'About all attention items',
    attentionReviewAllHelpTitle: 'About all attention items',
    attentionReviewAllHelpBody:
      'Shows all current items that need your attention. "Requires action" means someone is waiting for your decision. "Warnings" highlight situations to check, such as a schedule conflict or low stock. Open an item to review or resolve it.',
    attentionWarningsGroupHeading: 'Warnings',
    attentionIssueTitle: 'Issue reports',
    attentionOperationsTitle: 'Operations',
    attentionItemIssueCriticalTitle: 'Issue report – needs action',
    attentionItemIssueNoticeTitle: 'Issue report',
    attentionOpenIssues: 'View issues',
    attentionOpenOperations: 'View Operations',
    entryPointsHeading: 'Staff & recipe & Inventory management',
    staffHeading: 'Staff',
    manageStaff: 'Manage staff',
    addStaff: '+ Add staff',
    staffUnavailable: 'Staff list is temporarily unavailable.',
    staffEmpty: 'No staff added yet.',
    unknownStaffLabel: 'Unknown staff',
    unknownShiftTypeLabel: 'Unknown shift type',
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
    staffSelfOffboardingBlocked: 'You cannot deactivate or delete your own staff record. Ask the owner.',
    lineLinkedShort: 'LINE linked',
    lineNotLinkedShort: 'LINE not linked',
    accessActiveShort: 'Access active',
    accessPendingShort: 'Invited',
    accessExpiredShort: 'Invite expired',
    accessNoneShort: 'No access',
    accessSectionHeading: 'Account access',
    dangerZoneHeading: 'Danger zone',
    managerBadge: 'Manager',
    managerRoleHeading: 'Role',
    managerRoleIsManager: 'Manager: can manage staff (incl. hourly wages and contacts), shifts, purchasing, inventory and store settings.',
    managerRoleIsStaff: 'Staff',
    appointManager: 'Make manager',
    revokeManager: 'Remove manager role',
    appointManagerConfirmTitle: 'Make this staff member a manager?',
    appointManagerConfirmBody: 'They will be able to manage staff information (including hourly wages and contacts), shifts, purchasing, inventory and store settings. Their staff access stays as it is.',
    revokeManagerConfirmTitle: 'Remove the manager role?',
    revokeManagerConfirmBody: 'They keep their staff access but can no longer use the Manager screen.',
    managerAppointed: 'Manager role given.',
    managerRevoked: 'Manager role removed.',
    managerNeedsAccountHint: 'Staff who have not accepted their invitation cannot be made managers.',
    managerInactiveHint: 'Inactive staff cannot be made managers. Reactivate them first.',
    managerOwnRoleHint: 'You cannot change your own role.',
    managerRoleErrorPermission: 'Only the owner or an admin can change manager roles.',
    managerRoleErrorSession: 'Your session has expired. Please sign in again.',
    managerRoleErrorNotFound: 'This staff member was not found. Refresh the page and try again.',
    managerRoleErrorModule: 'Shift management is turned off for this workspace.',
    managerRoleErrorUnexpected: 'Could not change the role. Please try again.',
    adminBadge: 'Admin',
    adminRoleIsAdmin: 'Admin: can do everything the owner can except billing, including appointing managers, staff information and store settings.',
    appointAdmin: 'Make admin',
    revokeAdmin: 'Remove admin role',
    appointAdminConfirmTitle: 'Make this staff member an admin?',
    appointAdminConfirmBody: 'They will be able to do everything the owner can except billing, including appointing managers, managing staff information (including hourly wages and contacts) and store settings. Their staff access stays as it is.',
    revokeAdminConfirmTitle: 'Remove the admin role?',
    revokeAdminConfirmBody: 'They can keep using the app as before but lose admin rights.',
    adminAppointed: 'Admin role given.',
    adminRevoked: 'Admin role removed.',
    adminNeedsAccountHint: 'Staff who have not accepted their invitation cannot be made admins.',
    adminInactiveHint: 'Inactive staff cannot be made admins. Reactivate them first.',
    adminOwnRoleHint: 'You cannot change your own role.',
    adminRoleErrorPermission: 'Only the owner can appoint or remove admins.',
    adminRoleErrorSession: 'Your session has expired. Please sign in again.',
    adminRoleErrorNotFound: 'This staff member was not found. Refresh the page and try again.',
    adminRoleErrorModule: 'Shift management is turned off for this workspace.',
    adminRoleErrorUnexpected: 'Could not change the role. Please try again.',
    inviteButton: 'Invite',
    resendButton: 'Resend',
    sendingStatus: 'Sending…',
    recoverAccessButton: 'Recover access',
    revokeInvitationButton: 'Revoke',
    recoveryEmailSentMessage: 'Recovery email sent.',
    inviteEmailSentMessage: 'Invitation email sent.',
    inviteNoEmailExistingAccountMessage: 'No email was sent: this person already has an account. If they have not set a password yet, use "Recover access".',
    confirmRecoverAccessTitle: 'Send this staff member a password-reset email?',
    confirmRecoverAccessBody: 'They can reset their password using the link in the email.',
    confirmSendButton: 'Send',
    confirmRevokeInvitationTitle: 'Revoke this invitation?',
    confirmRevokeInvitationBody: 'The revoked invitation becomes invalid. You can resend it later if needed.',
    inviteErrorNotFound: 'Staff member not found.',
    inviteErrorDuplicate: 'This staff member already has account access.',
    inviteErrorUserHasOtherEmployeeRecord: 'This email is already linked to an earlier staff record (possibly inactive). Reactivate that record in the staff list instead.',
    inviteErrorGeneric:'Could not send the invitation. Please try again.',
    revokeErrorNotFound: 'This invitation no longer exists.',
    revokeErrorGeneric: 'Could not revoke the invitation. Please try again.',
    recoverErrorGeneric: 'Could not send the recovery email. Please try again.',
    errorUnauthorizedAction: 'You do not have permission to do this.',
    fieldName: 'Name',
    fieldFamilyName: 'Family name',
    fieldGivenName: 'Given name',
    fieldEmail: 'Email',
    fieldLineUserId: 'LINE user id (optional)',
    fieldPosition: 'Position',
    fieldHourlyWage: 'Hourly rate (JPY per hour)',
    hourlyWageHint: 'Whole yen, 0 to 1,000,000. Leave blank if there is no rate. Clearing an existing rate removes it, and this person is then left out of the estimated labour cost.',
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
    unassign: 'Remove shift',
    unassigning: 'Removing...',
    actionsHeading: 'Actions',
    confirmUnassignShift: 'Remove this shift from the schedule?',
    scheduleHelpAriaLabel: 'About the shift schedule',
    scheduleHelpTitle: 'About the shift schedule',
    scheduleHelpBody: 'Select a staff member\'s date cell to assign, change, or remove a shift. Saved changes appear on the staff schedule immediately.',
    pendingCorrectionCellAriaLabel: 'This shift has a pending correction request awaiting your review',
    staffPopupHelpAriaLabel: 'About staff management',
    staffPopupHelpTitle: 'About staff management',
    staffPopupHelpBody:
      'Deactivate a staff member to remove them from future scheduling while keeping their records. You can reactivate them later. Permanent deletion is available only when there are no work records that must be retained.',
    staffNamePopupTitlePrefix: 'Staff',
    staffNamePopupMonth: 'Month',
    staffNamePopupWorkedHours: 'Worked hours (this month)',
    staffNamePopupHourlyWage: 'Hourly rate',
    staffNamePopupEarnedSoFar: 'Earned so far',
    staffNamePopupCopyReport: 'Copy monthly report',
    staffNamePopupCopied: 'Copied.',
    staffNamePopupCopyFailed: 'Could not copy -- please copy the numbers manually.',
    staffNamePopupWorkedHoursMonth: 'Worked hours',
    staffNamePopupEarnedMonth: 'Estimated earnings',
    staffNamePopupPrevMonth: 'Previous month',
    staffNamePopupNextMonth: 'Next month',
    staffNamePopupLoading: 'Loading…',
    staffNamePopupLoadFailed: 'Could not load attendance for this month.',
    staffNamePopupRetry: 'Retry',
    attentionClockInWithoutShiftTitle: 'Clock-in without a shift',
    attentionClockInWithoutShiftPopupHelpAriaLabel: 'About clock-ins without a shift',
    attentionClockInWithoutShiftPopupHelpTitle: 'About clock-ins without a shift',
    attentionClockInWithoutShiftPopupHelpBody:
      'Shows staff who clocked in today (or are still clocked in from a recent day) with no shift on the schedule for that day. Open the day to add a shift if the work was planned. Nothing changes automatically.',
    settingsCardTitle: 'Settings',
    settingsHelpAriaLabel: 'About settings',
    settingsHelpBody:
      'Set the usual staffing needed for each weekday, the monthly working-hours limit, and the standard shift patterns used when creating the schedule.',
    requiredHeadcountHeading: 'Required staff per shift, by weekday',
    maxWorkHoursLabel: 'Max staff working hours / month',
    maxWeeklyHoursLabel: 'Max hours per week',
    maxWeeklyHoursSuffix: 'hours',
    maxDaysPerWeekLabel: 'Max working days per week',
    maxDaysPerWeekSuffix: 'days',
    weeklyLimitsHint: 'Japanese labour law guide: 40 hours per week, at least 1 day off per week',
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
    deleteShiftTypeButton: 'Delete',
    confirmDeleteShiftTypeTitle: 'Permanently delete this shift type?',
    confirmDeleteShiftTypeBody: 'This can\'t be undone. A shift type that was ever used in a schedule can\'t be deleted -- keep it deactivated instead.',
    shiftTypeBlockedByHistory: 'This shift type has schedule history and can\'t be deleted. It will stay deactivated.',
    savingStatus: 'Saving...',
    savedStatus: 'Saved',
    saveErrorStatus: 'Could not save',
    duplicateShiftTypeName: 'An active shift type with this name already exists.',
    automationSectionHeading: 'Automatic schedule',
    automationCreateOnLabel: 'Create automatically on',
    automationDayOfMonthSuffix: 'day of each month',
    automationHelpAriaLabel: 'About automatic schedule',
    automationHelpTitle: 'About automatic schedule',
    automationHelpBody:
      'When "Automatic schedule" is ON, the system creates next month\'s schedule for you on the day you choose below (1-28) -- as a draft proposal, based on staff preferences, your required-staff and monthly-hour-limit settings, and each employee\'s hours already used that month. It never publishes automatically and never notifies staff -- you always review and publish it yourself, the same as any other draft. You can also use the "Create schedule automatically" button any time to fill the week you are viewing right now. Past dates are never touched -- if part of the displayed week is already in the past, only the remaining days are filled. A shortage is shown honestly if not enough staff are available. A staff member who has not submitted a preference may still be assigned to fill a required slot, but this is always shown separately in the result so you can review it. Running it again (manually, or the next scheduled run) replaces that period\'s unconfirmed automatic shifts with a new set. Confirmed and manual shifts are always kept.',
    automationEnabledLabel: 'Automatically create next month\'s schedule',
    automationLastGeneratedLabel: 'Last automatically created',
    automationRunLogHeading: 'Automatic creation log',
    automationManualCreateButton: 'Create schedule automatically',
    automationManualCreateRunning: 'Creating...',
    automationLastResultHeading: 'Last result',
    autoCreateConfirmTitle: 'Create this week\'s schedule automatically?',
    autoCreateConfirmBody: 'Staff will be assigned based on their preferences and your settings. This week\'s unconfirmed automatic shifts will be replaced with the new set. Confirmed and manual shifts are left as they are.',
    autoCreatePastDaysExcludedNote: 'Days already past will not be changed -- only the remaining days above will be filled.',
    autoCreateWeekFullyPastNote: 'This whole week is already in the past, so it cannot be regenerated.',
    autoCreateResultTitle: 'Automatic creation result',
    autoCreateManualPreservedNote: 'Confirmed and manual shifts were not changed.',
    autoCreateShortagesHeading: 'Time slots still short',
    autoCreateUnplacedHeading: 'Preferences that could not be assigned',
    autoCreateNonSubmittersHeading: 'Staff who have not submitted preferences',
    autoCreateAssignedWithoutPreferenceHeading: 'Assigned without a submitted preference (fallback)',
    autoCreateNoIssues: 'No shortages or unassigned preferences.',
    autoCreateUndoButton: 'Undo automatic creation',
    autoCreateUndoing: 'Undoing...',
    autoCreateUndone: 'Automatic creation undone -- the shifts it created were removed.',
    publishWeekButton: 'Publish this week',
    publishingWeek: 'Publishing…',
    publishWeekConfirmTitle: "Publish this week's shifts?",
    estimatedLabourCostLabel: 'Estimated labour cost (this month)',
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
    shiftAlreadyVisibleNotice: 'This shift is already visible to the employee.',
    confirmChangeScheduledShiftTitle: 'Change scheduled shift?',
    correctingPastScheduleNotice: 'Correcting past schedule — this date has already passed.',
    reassignEmployeeButton: 'Reassign employee',
    assignCellAriaLabelPrefix: 'Assign shift',
    editCellAriaLabelPrefix: 'Edit shift',
    draftCellAriaSuffix: ' (draft, not published)',
    correctPastScheduleAriaLabelPrefix: 'Correct past schedule',
    shiftRequestsCardTitle: 'Shift preferences',
    viewRequestsButton: 'View preferences',
    shiftRequestsPopupHelpAriaLabel: 'About shift preferences',
    shiftRequestsPopupHelpTitle: 'About shift preferences',
    shiftRequestsPopupHelpBody:
      'See the shift preferences your staff sent for a month. Staff send preferences for next month, so "Next month" is shown first.\n\nEach day shows one of:\n• A shift name: the shift they would like to work.\n• "Off": they cannot work that day. Automatic scheduling will not place them on it (you can still assign a shift by hand).\n• "—": no preference for that day. Automatic scheduling may still place them if needed.\n\nA name with a red "!" has not sent anything for that month yet ("submitted" means at least one day was sent). In the "Next month" view, tap the name to email them a reminder.\n\nTap a shift or "Off" to mark it as reviewed (✓). This is saved, but it is only a note for you: it does not change the schedule. Staff cannot change a day after sending it; if they need a change, edit the schedule directly.',
    submittedPreferencesEmpty: 'No active staff to show.',
    noPreferenceSubmittedHint: 'No preference for this day',
    markedUnavailableHint: 'Cannot work this day',
    preferenceUnavailableChip: 'Off',
    preferenceUnavailableCellShort: 'Off',
    preferenceMonthCurrent: 'This month',
    preferenceMonthNext: 'Next month',
    reviewPreferenceTitle: 'Review preference',
    priorityExplainerBody:
      'Priority when building the schedule:\n1. A shift set by hand in Weekly Schedule\n2. A submitted staff preference ("Off" days are never filled automatically). Marking it reviewed does not change this.\n3. Automatic fallback assignment',
    markReviewedButton: 'Mark as reviewed',
    reviewedPreferenceTitle: 'Reviewed preference',
    reviewedPreferenceBody: 'You marked this preference as reviewed. It is a note for your own tracking and does not change how the schedule is generated.',
    unmarkReviewedButton: 'Mark as not reviewed',
    reviewSaveFailed: 'Could not save. Please try again.',
    close: 'Close',
    sendReminderTitle: 'Send reminder',
    sendReminderBody: 'This employee has not sent shift preferences for next month yet. The email below goes to the address in their staff profile.',
    reminderPreviewLabel: 'Email to be sent',
    sendReminderButton: 'Send reminder',
    sendingReminder: 'Sending…',
    reminderSentNotice: 'Reminder email sent.',
    reminderNoEmailNotice: 'No email address is registered for this employee. Add one in Manage staff, then try again.',
    reminderFailedNotice: 'The email could not be sent. Please try again later.',
    reminderNotConfiguredNotice: 'Email sending is not set up yet. Please contact support.',
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
    viewHistoryButton: 'View history',
    correctionsPopupHelpAriaLabel: 'About correction requests',
    correctionsPopupHelpTitle: 'About correction requests',
    correctionsPopupHelpBody:
      'Staff send a correction request when their clock-in, clock-out, or break record is wrong. Approving updates the attendance record; rejecting keeps the original record. Use the archive to review older decisions.',
    exchangesHeading: 'Shift requests',
    exchangesUnavailable: 'Shift requests are temporarily unavailable.',
    noPendingExchanges: 'No pending shift requests.',
    colRequester: 'Requester',
    colShift: 'Shift',
    colRequest: 'Request',
    colReason: 'Reason',
    requestKindCancellation: 'Cancellation',
    requestKindChange: 'Shift change',
    requestKindExchange: 'Exchange',
    awaitingCandidate: 'awaiting candidate',
    exchangesPopupHelpAriaLabel: 'About shift requests',
    exchangesPopupHelpTitle: 'About shift requests',
    exchangesPopupHelpBody:
      'Staff use these requests to change, cancel, or exchange an assigned shift. An exchange can be approved after a replacement accepts it or you select a replacement. Use the archive to review older decisions.',
    exchangeReplacementLabel: 'Replacement',
    exchangeReplacementNotAssigned: 'Not assigned',
    exchangeWaitingForCandidate: 'Waiting for candidate',
    exchangeExpiredNote: 'Expired: this shift has already started, so it can no longer be approved. Reject it to clear it from the list.',
    assignReplacementButton: 'Assign replacement',
    changeReplacementButton: 'Change',
    selectReplacementTitle: 'Select replacement',
    searchReplacementPlaceholder: 'Search staff...',
    noEligibleReplacements: 'No other active staff are available to assign.',
    candidateAvailable: 'Available',
    candidateScheduleConflict: 'Already scheduled at this time',
    candidateMarkedUnavailable: 'Marked unavailable that day',
    confirmAssignReplacementButton: 'Assign',
    assigningReplacement: 'Assigning...',
    mailChipTitle: 'Mail',
    mailHeading: 'Mail',
    mailEmptyThreads: 'No messages yet.',
    mailBackToThreads: '‹ Back to conversations',
    mailArchivedTag: 'Archived',
    mailMoreActionsAriaLabel: 'More actions for this message',
    mailMarkRead: 'Mark read',
    mailArchive: 'Archive',
    mailComposePlaceholder: 'Write a reply',
    mailSend: 'Send',
    mailSending: 'Sending...',
    mailPopupHelpAriaLabel: 'About Mail',
    mailPopupHelpTitle: 'About Mail',
    mailPopupHelpBody: 'Use Mail for a private conversation with each staff member. Open a conversation to read or reply. Archiving removes it from the active list without deleting it.',
    pageTitle: 'Manager',
    signOut: 'Sign out',
    notSetLabel: 'Not set',
    navWeeklyReview: 'Weekly Review',
    backToWorkforce: 'Platform dashboard',
    staffActivated: 'Staff member activated.',
    staffDeactivated: 'Staff member deactivated.',
    shiftUnassigned: 'Shift unassigned.',
    correctionApproved: 'Correction approved.',
    correctionRejected: 'Correction rejected.',
    exchangeApproved: 'Request approved.',
    exchangeRejected: 'Request rejected.',
    replacementAssigned: 'Replacement assigned.',
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
    attentionExchangeTitle: 'シフト申請',
    attentionUnavailableConflictTitle: '不可との重複',
    attentionInventoryTitle: '在庫不足',
    attentionItemCorrectionTitle: '勤怠修正',
    attentionItemExchangeTitle: 'シフト申請',
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
    attentionConflictsPopupHelpAriaLabel: '不可との重複について',
    attentionConflictsPopupHelpTitle: '不可との重複について',
    attentionConflictsPopupHelpBody:
      'スタッフが勤務不可と回答した日に、シフトが割り当てられている項目を表示します。内容を確認し、必要な場合は「シフトを見る」から担当者を変更してください。この警告によってスケジュールが自動で変更されることはありません。',
    attentionReviewAll: 'すべて確認',
    attentionReviewAllTitle: 'すべての要確認項目',
    attentionReviewAllHelpAriaLabel: 'すべての要確認項目について',
    attentionReviewAllHelpTitle: 'すべての要確認項目について',
    attentionReviewAllHelpBody:
      '現在の要確認項目をまとめて表示します。「対応が必要」は、スタッフが店長の判断を待っている項目です。「注意事項」は、シフトの重複や在庫不足など確認しておきたい状態です。項目を開くと、そのまま確認や対応ができます。',
    attentionWarningsGroupHeading: '注意事項',
    attentionIssueTitle: '問題報告',
    attentionOperationsTitle: 'オペレーション',
    attentionItemIssueCriticalTitle: '要対応の問題報告',
    attentionItemIssueNoticeTitle: '問題報告',
    attentionOpenIssues: '問題報告を開く',
    attentionOpenOperations: 'オペレーションを開く',
    entryPointsHeading: 'スタッフ・レシピ・在庫管理',
    staffHeading: 'スタッフ',
    manageStaff: 'スタッフ管理',
    addStaff: '+ スタッフを追加',
    staffUnavailable: 'スタッフ一覧は一時的に利用できません。',
    staffEmpty: 'まだスタッフが追加されていません。',
    unknownStaffLabel: '不明なスタッフ',
    unknownShiftTypeLabel: '不明なシフト種別',
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
    confirmDeleteStaffBody: 'この操作は取り消せません。プロフィールは完全に削除されます。',
    staffDeleted: 'スタッフを完全に削除しました。',
    staffBlockedByHistory: 'このスタッフにはシフト・勤怠・申請などの履歴があるため完全に削除できません。「無効化」をご利用ください。',
    staffSelfOffboardingBlocked: '自分自身のスタッフ登録は無効化・削除できません。オーナーに依頼してください。',
    lineLinkedShort: 'LINE連携済み',
    lineNotLinkedShort: 'LINE未連携',
    accessActiveShort: 'アクセス有効',
    accessPendingShort: '招待中',
    accessExpiredShort: '招待期限切れ',
    accessNoneShort: 'アクセスなし',
    accessSectionHeading: 'アカウントアクセス',
    dangerZoneHeading: '危険な操作',
    managerBadge: '店長',
    managerRoleHeading: '役割',
    managerRoleIsManager: '店長：スタッフ情報（時給・連絡先を含む）、シフト、仕入れ・在庫、店舗設定を管理できます。',
    managerRoleIsStaff: 'スタッフ',
    appointManager: '店長にする',
    revokeManager: '店長から外す',
    appointManagerConfirmTitle: 'このスタッフを店長にしますか？',
    appointManagerConfirmBody: 'スタッフ情報（時給・連絡先を含む）、シフト、仕入れ・在庫、店舗設定を管理できるようになります。スタッフとしての利用はそのままです。',
    revokeManagerConfirmTitle: '店長から外しますか？',
    revokeManagerConfirmBody: 'スタッフとしては引き続き利用できますが、マネージャー画面は使えなくなります。',
    managerAppointed: '店長にしました。',
    managerRevoked: '店長から外しました。',
    managerNeedsAccountHint: '招待を承認していないスタッフは店長にできません。',
    managerInactiveHint: '無効のスタッフは店長にできません。先に有効にしてください。',
    managerOwnRoleHint: 'ご自身の役割は変更できません。',
    managerRoleErrorPermission: '店長の任命・解除はオーナーまたは管理者のみ行えます。',
    managerRoleErrorSession: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    managerRoleErrorNotFound: 'スタッフが見つかりません。画面を更新して、もう一度お試しください。',
    managerRoleErrorModule: 'このワークスペースではシフト管理機能が無効です。',
    managerRoleErrorUnexpected: '役割を変更できませんでした。もう一度お試しください。',
    adminBadge: '管理者',
    adminRoleIsAdmin: '管理者：請求以外はオーナーと同じ操作（店長の任命・解除、スタッフ情報、店舗設定など）ができます。',
    appointAdmin: '管理者にする',
    revokeAdmin: '管理者から外す',
    appointAdminConfirmTitle: 'このスタッフを管理者にしますか？',
    appointAdminConfirmBody: '店長の任命・解除、スタッフ情報（時給・連絡先を含む）の管理、店舗設定など、請求以外はオーナーと同じ操作ができるようになります。スタッフとしての利用はそのままです。',
    revokeAdminConfirmTitle: '管理者から外しますか？',
    revokeAdminConfirmBody: 'これまでどおりアプリは使えますが、管理者の権限はなくなります。',
    adminAppointed: '管理者にしました。',
    adminRevoked: '管理者から外しました。',
    adminNeedsAccountHint: '招待を承認していないスタッフは管理者にできません。',
    adminInactiveHint: '無効のスタッフは管理者にできません。先に有効にしてください。',
    adminOwnRoleHint: 'ご自身の役割は変更できません。',
    adminRoleErrorPermission: '管理者の任命・解除はオーナーのみ行えます。',
    adminRoleErrorSession: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    adminRoleErrorNotFound: 'スタッフが見つかりません。画面を更新して、もう一度お試しください。',
    adminRoleErrorModule: 'このワークスペースではシフト管理機能が無効です。',
    adminRoleErrorUnexpected: '役割を変更できませんでした。もう一度お試しください。',
    inviteButton: '招待する',
    resendButton: '再送信',
    sendingStatus: '送信中…',
    recoverAccessButton: 'アクセスを回復',
    revokeInvitationButton: '取り消す',
    recoveryEmailSentMessage: '復旧メールを送信しました。',
    inviteEmailSentMessage: '招待メールを送信しました。',
    inviteNoEmailExistingAccountMessage: 'このスタッフにはすでにアカウントがあるため、メールは送信されていません。まだパスワードを設定していない場合は「アクセスを回復」を使ってください。',
    confirmRecoverAccessTitle: 'このスタッフにパスワード再設定メールを送信しますか？',
    confirmRecoverAccessBody: 'スタッフはメールに記載されたリンクからパスワードを再設定できます。',
    confirmSendButton: '送信する',
    confirmRevokeInvitationTitle: 'この招待を取り消しますか？',
    confirmRevokeInvitationBody: '取り消した招待は無効になります。必要であれば再送信できます。',
    inviteErrorNotFound: '従業員が見つかりません。',
    inviteErrorDuplicate: 'この従業員はすでにアクセス権を持っています。',
    inviteErrorUserHasOtherEmployeeRecord: 'このメールアドレスは、以前のスタッフ登録（無効を含む）にすでに使われています。スタッフ一覧で以前の登録を「有効にする」で戻してください。',
    inviteErrorGeneric:'招待を送信できませんでした。もう一度お試しください。',
    revokeErrorNotFound: 'この招待はすでに存在しません。',
    revokeErrorGeneric: '取り消せませんでした。もう一度お試しください。',
    recoverErrorGeneric: '復旧メールを送信できませんでした。もう一度お試しください。',
    errorUnauthorizedAction: 'この操作を行う権限がありません。',
    fieldName: '氏名',
    fieldFamilyName: '姓',
    fieldGivenName: '名',
    fieldEmail: 'メールアドレス',
    fieldLineUserId: 'LINEユーザーID（任意）',
    fieldPosition: '役職',
    fieldHourlyWage: '時給（円）',
    hourlyWageHint: '0〜1,000,000の整数（円）。未設定の場合は空欄のままにしてください。入力済みの時給を消すと削除され、この方は概算人件費に含まれません。',
    fieldEmploymentType: '雇用形態',
    addStaffSubmit: 'スタッフを追加',
    saveChanges: '変更を保存',
    cancel: 'キャンセル',
    errorNotFound: '見つかりませんでした。',
    errorNotAuthenticated: 'もう一度ログインしてください。',
    errorNoMembership: 'このワークスペースのメンバーではありません。',
    errorStaleReference: 'この依頼は最新の状態ではありません。シフトが変更されたか、別の店長が既に対応した可能性があります。最新の状態を確認するには更新してください。',
    prevWeek: '前週',
    thisWeek: '今週',
    nextWeek: '次週',
    addStaffToSeeSchedule: 'スタッフを追加すると週間スケジュールが表示されます。',
    colStaff: 'スタッフ',
    assign: '割り当て',
    unassign: 'シフトを削除',
    unassigning: '削除中...',
    actionsHeading: '操作',
    confirmUnassignShift: 'このシフトをスケジュールから削除しますか？',
    scheduleHelpAriaLabel: 'シフトスケジュールについて',
    scheduleHelpTitle: 'シフトスケジュールについて',
    scheduleHelpBody: 'スタッフと日付が交わるセルを選ぶと、シフトの割り当て・変更・削除ができます。保存した内容は、スタッフのシフト表にすぐ反映されます。',
    pendingCorrectionCellAriaLabel: 'このシフトには確認待ちの修正申請があります',
    staffPopupHelpAriaLabel: 'スタッフ管理について',
    staffPopupHelpTitle: 'スタッフ管理について',
    staffPopupHelpBody:
      'スタッフを無効化すると、記録を残したまま今後のシフト作成対象から外せます。必要になれば再度有効化できます。完全削除は、保存が必要な勤務記録がない場合に限り実行できます。',
    staffNamePopupTitlePrefix: 'スタッフ',
    staffNamePopupMonth: '対象月',
    staffNamePopupWorkedHours: '実働時間（今月）',
    staffNamePopupHourlyWage: '時給',
    staffNamePopupEarnedSoFar: '現時点の概算支給額',
    staffNamePopupCopyReport: '月次レポートをコピー',
    staffNamePopupCopied: 'コピーしました。',
    staffNamePopupCopyFailed: 'コピーできませんでした。数値を手動でコピーしてください。',
    staffNamePopupWorkedHoursMonth: '実働時間',
    staffNamePopupEarnedMonth: '概算支給額',
    staffNamePopupPrevMonth: '前月',
    staffNamePopupNextMonth: '次月',
    staffNamePopupLoading: '読み込み中…',
    staffNamePopupLoadFailed: 'この月の勤怠を読み込めませんでした。',
    staffNamePopupRetry: '再試行',
    attentionClockInWithoutShiftTitle: 'シフト外の出勤',
    attentionClockInWithoutShiftPopupHelpAriaLabel: 'シフト外の出勤について',
    attentionClockInWithoutShiftPopupHelpTitle: 'シフト外の出勤について',
    attentionClockInWithoutShiftPopupHelpBody:
      '今日出勤した、または最近出勤してまだ退勤していないスタッフのうち、その日にシフトが入っていない人を表示します。予定どおりの勤務であれば、その日を開いてシフトを追加してください。自動で変更されることはありません。',
    settingsCardTitle: '設定',
    settingsHelpAriaLabel: '設定について',
    settingsHelpBody:
      '曜日ごとに通常必要な人数、スタッフの月間勤務時間の上限、スケジュール作成時に使う標準的なシフト時間を設定します。',
    requiredHeadcountHeading: '曜日ごとの各シフト必要人数',
    maxWorkHoursLabel: 'スタッフ最大勤務時間 / 月',
    maxWeeklyHoursLabel: '週の最大勤務時間',
    maxWeeklyHoursSuffix: '時間',
    maxDaysPerWeekLabel: '週の最大勤務日数',
    maxDaysPerWeekSuffix: '日',
    weeklyLimitsHint: '労働基準法の目安：週40時間・週1日以上の休日',
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
    deleteShiftTypeButton: '削除',
    confirmDeleteShiftTypeTitle: 'このシフト種別を完全に削除しますか？',
    confirmDeleteShiftTypeBody: 'この操作は取り消せません。スケジュールで一度でも使用されたシフト種別は削除できません。その場合は無効化のままにしてください。',
    shiftTypeBlockedByHistory: 'このシフト種別にはスケジュール履歴があるため削除できません。無効化された状態のままになります。',
    savingStatus: '保存中…',
    savedStatus: '保存しました',
    saveErrorStatus: '保存できませんでした',
    duplicateShiftTypeName: '同じ名称の有効なシフト種別がすでに存在します。',
    automationSectionHeading: '自動スケジュール',
    automationCreateOnLabel: '自動作成する日',
    automationDayOfMonthSuffix: '日（毎月）',
    automationHelpAriaLabel: '自動スケジュールについて',
    automationHelpTitle: '自動スケジュールについて',
    automationHelpBody:
      '「自動スケジュール」をONにすると、下で設定した日（1〜28日）に、来月分のシフトを自動で作成します。作成されるのは、スタッフの希望・必要人数・月間労働時間の上限・その月すでに入っている勤務時間にもとづいた「案」で、自動で公開されることも、スタッフに通知されることもありません。内容を確認してから、いつものように公開のタイミングはあなたが決めます。いま表示している週については、「自動でシフトを作成」ボタンでいつでも作成できます。過去の日付は変更されません。表示中の週の一部がすでに過去の場合、残りの日だけが対象になります。人数が足りない場合はその不足がそのまま表示されます。希望を出していないスタッフも、必要な枠を埋めるために割り当てられることがありますが、その場合は結果に必ず分けて表示されるので確認できます。もう一度実行すると（手動でも、次回の自動実行でも）、その期間の未確定の自動シフトは新しい案に置き換わります。確定済み・手動のシフトは常にそのまま残ります。',
    automationEnabledLabel: '来月のシフトを自動で作成する',
    automationLastGeneratedLabel: '最後に自動作成した月',
    automationRunLogHeading: '自動作成の記録',
    automationManualCreateButton: '自動でシフトを作成',
    automationManualCreateRunning: '作成中...',
    automationLastResultHeading: '直近の結果',
    autoCreateConfirmTitle: 'この週のシフトを自動で作成しますか？',
    autoCreateConfirmBody: 'スタッフの希望と設定にもとづいて割り当てます。この週の未確定の自動シフトは新しい案に置き換わります。確定済み・手動のシフトはそのまま残ります。',
    autoCreatePastDaysExcludedNote: 'すでに過ぎた日は変更されません。残りの日のみが対象になります。',
    autoCreateWeekFullyPastNote: 'この週はすでに過去のため、作り直すことはできません。',
    autoCreateResultTitle: '自動作成の結果',
    autoCreateManualPreservedNote: '確定済み・手動のシフトは変更していません',
    autoCreateShortagesHeading: '不足している時間帯',
    autoCreateUnplacedHeading: '割り当てできなかった希望',
    autoCreateNonSubmittersHeading: '希望シフト未提出のスタッフ',
    autoCreateAssignedWithoutPreferenceHeading: '希望未提出のまま割り当てたスタッフ',
    autoCreateNoIssues: '不足や未割り当ての希望はありません。',
    autoCreateUndoButton: '自動作成を取り消す',
    autoCreateUndoing: '取り消し中...',
    autoCreateUndone: '自動作成を取り消しました。作成されたシフトは削除されました。',
    publishWeekButton: 'この週のシフトを公開',
    publishingWeek: '公開中…',
    publishWeekConfirmTitle: 'この週のシフトを公開しますか？',
    estimatedLabourCostLabel: '今月の概算人件費',
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
    shiftAlreadyVisibleNotice: 'このシフトはすでにスタッフに表示されています。',
    confirmChangeScheduledShiftTitle: '予定済みのシフトを変更しますか？',
    correctingPastScheduleNotice: '過去のスケジュールを修正しています。この日付はすでに過ぎています。',
    reassignEmployeeButton: '担当を変更',
    assignCellAriaLabelPrefix: 'シフトを割り当てる',
    editCellAriaLabelPrefix: 'シフトを編集',
    draftCellAriaSuffix: '（下書き・未公開）',
    correctPastScheduleAriaLabelPrefix: '過去のスケジュールを修正',
    shiftRequestsCardTitle: 'シフト希望',
    viewRequestsButton: '希望を見る',
    shiftRequestsPopupHelpAriaLabel: 'シフト希望について',
    shiftRequestsPopupHelpTitle: 'シフト希望について',
    shiftRequestsPopupHelpBody:
      'スタッフが提出した月ごとのシフト希望を確認できます。スタッフは来月分を提出するため、最初は「来月」を表示します。\n\n各日の表示:\n• シフト名: その日に働きたいシフトです。\n• 「休」（休み）: 勤務できない日です。自動作成ではこの日にシフトは入りません（手動では割り当てできます）。\n• 「—」: その日の希望はありません。必要に応じて自動作成でシフトが入ることがあります。\n\n赤い「!」が付いた名前は、その月の希望をまだ1日も提出していないスタッフです（1日以上提出していれば「提出済み」と数えます）。「来月」表示で名前をタップすると、リマインダーメールを送れます。\n\nシフトまたは「休」をタップすると「確認済み（✓）」にできます。記録は保存されますが、店長用のメモであり、スケジュールは変わりません。スタッフは提出後に自分で変更できないため、変更が必要な場合はスケジュールを直接編集してください。',
    submittedPreferencesEmpty: '表示できる有効なスタッフがいません。',
    noPreferenceSubmittedHint: 'この日の希望はありません',
    markedUnavailableHint: 'この日は勤務できません',
    preferenceUnavailableChip: '休み',
    preferenceUnavailableCellShort: '休',
    preferenceMonthCurrent: '今月',
    preferenceMonthNext: '来月',
    reviewPreferenceTitle: '希望を確認',
    priorityExplainerBody:
      'スケジュール作成時の優先順位:\n1. 週間スケジュールで手動設定したシフト\n2. スタッフが提出した希望（「休み」の日は自動で埋められません）。確認済みにしても、この順番は変わりません。\n3. 自動割り当て',
    markReviewedButton: '確認済みにする',
    reviewedPreferenceTitle: '確認済みの希望',
    reviewedPreferenceBody: 'この希望を確認済みとして記録しました。ご自身の確認用のメモであり、スケジュールの自動作成には影響しません。',
    unmarkReviewedButton: '確認済みを取り消す',
    reviewSaveFailed: '保存できませんでした。もう一度お試しください。',
    close: '閉じる',
    sendReminderTitle: 'リマインダーを送信',
    sendReminderBody: 'このスタッフは来月のシフト希望をまだ提出していません。スタッフ情報に登録されたメールアドレスに、下記のメールを送信します。',
    reminderPreviewLabel: '送信されるメール',
    sendReminderButton: 'リマインダーを送信',
    sendingReminder: '送信中…',
    reminderSentNotice: 'リマインダーメールを送信しました。',
    reminderNoEmailNotice: 'このスタッフにはメールアドレスが登録されていません。スタッフ管理で登録してから、もう一度お試しください。',
    reminderFailedNotice: 'メールを送信できませんでした。しばらくしてからもう一度お試しください。',
    reminderNotConfiguredNotice: 'メール送信がまだ設定されていません。サポートにお問い合わせください。',
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
    viewHistoryButton: '履歴を見る',
    correctionsPopupHelpAriaLabel: '修正依頼について',
    correctionsPopupHelpTitle: '修正依頼について',
    correctionsPopupHelpBody:
      '出勤・退勤・休憩の記録に誤りがある場合、スタッフから修正依頼が届きます。承認すると勤怠記録が更新され、却下すると元の記録が残ります。過去の対応はアーカイブから確認できます。',
    exchangesHeading: 'シフト申請',
    exchangesUnavailable: 'シフト申請は一時的に利用できません。',
    noPendingExchanges: '保留中のシフト申請はありません。',
    colRequester: '申請者',
    colShift: 'シフト',
    colRequest: '申請内容',
    colReason: '理由',
    requestKindCancellation: 'キャンセル',
    requestKindChange: 'シフト変更',
    requestKindExchange: '交換',
    awaitingCandidate: '交換相手を待っています',
    exchangesPopupHelpAriaLabel: 'シフト申請について',
    exchangesPopupHelpTitle: 'シフト申請について',
    exchangesPopupHelpBody:
      '割り当て済みのシフトについて、変更・キャンセル・同僚との交換申請を確認できます。交換は、代わりのスタッフが承諾するか、店長が担当者を選ぶと承認できます。過去の対応はアーカイブから確認できます。',
    exchangeReplacementLabel: '交換相手',
    exchangeReplacementNotAssigned: '未指定',
    exchangeWaitingForCandidate: '交換相手を待っています',
    exchangeExpiredNote: '期限切れ：シフトの開始時刻を過ぎているため承認できません。「却下」で一覧から消せます。',
    assignReplacementButton: '交換相手を指名',
    changeReplacementButton: '変更',
    selectReplacementTitle: '交換相手を選択',
    searchReplacementPlaceholder: 'スタッフを検索...',
    noEligibleReplacements: '指名できる有効なスタッフがいません。',
    candidateAvailable: '対応可能',
    candidateScheduleConflict: 'この時間帯は既に予定あり',
    candidateMarkedUnavailable: 'この日は「不可」と回答済み',
    confirmAssignReplacementButton: '指名する',
    assigningReplacement: '指名中...',
    mailChipTitle: 'メール',
    mailHeading: 'メール',
    mailEmptyThreads: 'まだメッセージはありません。',
    mailBackToThreads: '‹ 会話一覧に戻る',
    mailArchivedTag: 'アーカイブ済み',
    mailMoreActionsAriaLabel: 'このメッセージの操作',
    mailMarkRead: '既読にする',
    mailArchive: 'アーカイブ',
    mailComposePlaceholder: '返信を入力',
    mailSend: '送信',
    mailSending: '送信中...',
    mailPopupHelpAriaLabel: 'メールについて',
    mailPopupHelpTitle: 'メールについて',
    mailPopupHelpBody: 'スタッフごとの個別連絡に使います。会話を開くと内容の確認と返信ができます。アーカイブすると、削除せずに対応中の一覧から外せます。',
    pageTitle: 'マネージャー',
    signOut: 'ログアウト',
    notSetLabel: '未設定',
    navWeeklyReview: '週次レビュー',
    backToWorkforce: 'プラットフォームダッシュボード',
    staffActivated: 'スタッフを有効化しました。',
    staffDeactivated: 'スタッフを無効化しました。',
    shiftUnassigned: 'シフトの割り当てを解除しました。',
    correctionApproved: '修正依頼を承認しました。',
    correctionRejected: '修正依頼を却下しました。',
    exchangeApproved: '申請を承認しました。',
    exchangeRejected: '申請を却下しました。',
    replacementAssigned: '交換相手を指名しました。',
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

/** "Shift preferences — {month}" heading for the Shift-requests review popup (v2.1 UI-only). */
export const shiftRequestsHeadingValue: Record<Lang, (monthLabel: string) => string> = {
  en: (monthLabel) => `Shift preferences — ${monthLabel}`,
  ja: (monthLabel) => `シフト希望 — ${monthLabel}`,
};

/** Compact "{submitted}/{total} submitted, {missing} missing" summary, shown on the review popup's footer (a single flat line there, per the agreed design). */
export const shiftRequestsSummaryLabel: Record<Lang, (submittedCount: number, totalCount: number, missingCount: number) => string> = {
  en: (submittedCount, totalCount, missingCount) => `${submittedCount}/${totalCount} submitted, ${missingCount} missing`,
  ja: (submittedCount, totalCount, missingCount) => `${submittedCount}/${totalCount}名提出済み、未提出${missingCount}名`,
};

/** Settings card summary, split into two independently-styled pieces (submitted in success tone always, missing in warning tone only when > 0) so "2 missing" can draw a Manager's eye without a full warning block. */
export const shiftRequestsSubmittedLabel: Record<Lang, (submittedCount: number, totalCount: number) => string> = {
  en: (submittedCount, totalCount) => `Next month: ${submittedCount}/${totalCount} submitted`,
  ja: (submittedCount, totalCount) => `来月分 ${submittedCount}/${totalCount}名提出済み`,
};
export const shiftRequestsMissingLabel: Record<Lang, (missingCount: number) => string> = {
  en: (missingCount) => `${missingCount} missing`,
  ja: (missingCount) => `未提出${missingCount}名`,
};

/** "{weekStart}–{weekEnd}" range shown under the review popup's month heading, next to its week pager. */
export const weekRangeLabel: Record<Lang, (weekStart: string, weekEnd: string) => string> = {
  en: (weekStart, weekEnd) => `${weekStart} – ${weekEnd}`,
  ja: (weekStart, weekEnd) => `${weekStart} 〜 ${weekEnd}`,
};

export const breakMinutesValue: Record<Lang, (minutes: number) => string> = {
  en: (minutes) => `${minutes} min`,
  ja: (minutes) => `${minutes}分`,
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
  en: (count) => `${count} shift request(s) waiting on your decision`,
  ja: (count) => `${count}件のシフト申請があなたの判断を待っています`,
};

/**
 * QA4 F10: success banner after the Manager approves/rejects a staff shift
 * request -- worded for its kind, so a cancellation never reads as an
 * "exchange". `null` (request no longer in the loaded list) falls back to the
 * neutral `exchangeApproved` / `exchangeRejected` copy.
 */
export const exchangeDecisionMessage: Record<Lang, (kind: ShiftRequestKind | null, decision: 'approved' | 'rejected') => string> = {
  en: (kind, decision) => {
    const approved = decision === 'approved';
    if (kind === 'cancel') return approved ? 'Shift cancellation approved.' : 'Shift cancellation rejected.';
    if (kind === 'change') return approved ? 'Shift change approved.' : 'Shift change rejected.';
    if (kind === 'exchange') return approved ? 'Shift exchange approved.' : 'Shift exchange rejected.';
    return tManagerDashboard('en', approved ? 'exchangeApproved' : 'exchangeRejected');
  },
  ja: (kind, decision) => {
    const approved = decision === 'approved';
    if (kind === 'cancel') return approved ? 'シフトの取り消しを承認しました。' : 'シフトの取り消しを却下しました。';
    if (kind === 'change') return approved ? 'シフトの変更を承認しました。' : 'シフトの変更を却下しました。';
    if (kind === 'exchange') return approved ? 'シフト交換を承認しました。' : 'シフト交換を却下しました。';
    return tManagerDashboard('ja', approved ? 'exchangeApproved' : 'exchangeRejected');
  },
};

export const attentionInventoryLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} inventory item(s) need restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

/** Full chip aria-label for the Issues category: names the critical count when there is one, otherwise the open count. */
export const attentionIssueLabel: Record<Lang, (count: number, criticalCount: number) => string> = {
  en: (count, criticalCount) =>
    criticalCount > 0
      ? `${criticalCount} issue report(s) need action${count > criticalCount ? `, ${count - criticalCount} other open issue report(s)` : ''}`
      : `${count} open issue report(s)`,
  ja: (count, criticalCount) =>
    criticalCount > 0
      ? `要対応の問題報告が${criticalCount}件あります${count > criticalCount ? `（その他の未対応の問題報告${count - criticalCount}件）` : ''}`
      : `未対応の問題報告が${count}件あります`,
};

/** Visible chip count for the Issues category: the open total, plus the needs-action share when there is one (UX review, PR #584) -- so it never reads as contradicting the red Issues entry badge. */
export const attentionIssueChipCount: Record<Lang, (count: number, criticalCount: number) => string> = {
  en: (count, criticalCount) => (criticalCount > 0 ? `${count} (${criticalCount} needs action)` : `${count}`),
  ja: (count, criticalCount) => (criticalCount > 0 ? `${count}（要対応 ${criticalCount}）` : `${count}`),
};

/** Operations chip aria-label: distinguishes needs-action from warning counts (Operations module's own 要対応/注意 terms). */
export const attentionOperationsLabel: Record<Lang, (count: number, actionRequiredCount: number) => string> = {
  en: (count, actionRequiredCount) => {
    const warnings = count - actionRequiredCount;
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`${actionRequiredCount} need action`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
    return `Operations: ${parts.join(', ')}`;
  },
  ja: (count, actionRequiredCount) => {
    const warnings = count - actionRequiredCount;
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`要対応${actionRequiredCount}件`);
    if (warnings > 0) parts.push(`注意${warnings}件`);
    return `オペレーション：${parts.join('、')}`;
  },
};

/** "N occurrences" suffix for a collapsed Operations queue group (shown only when > 1). */
export const attentionOperationsGroupCount: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} occurrences`,
  ja: (count) => `${count}件`,
};

export const attentionUnavailableConflictLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} shift(s) assigned to a staff member who marked that day Unavailable`,
  ja: (count) => `${count}件のシフトが、その日「不可」と回答したスタッフに割り当てられています`,
};

/** QA4 F11-C chip aria-label. */
export const attentionClockInWithoutShiftLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} clock-in(s) without a shift on the schedule`,
  ja: (count) => `シフトのない日の出勤が${count}件あります`,
};

/** QA4 F11-C queue-item detail line: clock-in time and whether the staff member is still working. */
export const attentionClockInWithoutShiftDetail: Record<Lang, (clockInLocal: string, stillWorking: boolean) => string> = {
  en: (clockInLocal, stillWorking) => `Clocked in ${clockInLocal}${stillWorking ? ' · still working' : ''}`,
  ja: (clockInLocal, stillWorking) => `出勤 ${clockInLocal}${stillWorking ? '・勤務中' : ''}`,
};

/** QA4 F11-A presence marker in the week grid's today column (visible text and accessible name). */
export const presenceWorkingLabel: Record<Lang, (sinceLocal: string) => string> = {
  en: (sinceLocal) => `Working since ${sinceLocal}`,
  ja: (sinceLocal) => `出勤中 ${sinceLocal}〜`,
};
export const presenceLeftLabel: Record<Lang, (atLocal: string) => string> = {
  en: (atLocal) => `Clocked out ${atLocal}`,
  ja: (atLocal) => `退勤 ${atLocal}`,
};
/** QA4 F12: appended to the presence label when today's clock-in was late. */
export const presenceLateSuffix: Record<Lang, (minutes: number) => string> = {
  en: (minutes) => ` · ${minutes} min late`,
  ja: (minutes) => `（遅刻${minutes}分）`,
};

export const unavailableConflictBadgeLabel: Record<Lang, string> = {
  en: '⚠ Unavailable',
  ja: '⚠ 不可',
};

/**
 * Mission 8 Quality Sweep fix (F2): `workforce.employees.employment_type` is
 * free text (no DB enum), but every value ever written by the app itself is
 * one of these two -- the raw-string input was removed from the Add/Edit
 * Staff form (2026-08-24 Founder direction), so this only surfaces for
 * legacy rows. A value outside this map (hand-edited data, a future value)
 * falls back to the raw string rather than hiding it -- never worse than
 * before this fix, just no longer unlabeled for the common case.
 */
export const employmentTypeLabel: Record<Lang, Record<string, string>> = {
  en: {
    full_time: 'Full-time',
    part_time: 'Part-time',
  },
  ja: {
    full_time: '正社員',
    part_time: 'アルバイト・パート',
  },
};

/**
 * Level-1 attention summary subtitle, e.g. "3 require action · 6 warnings · 2 unread mail" -- omits a part when its count is 0 rather than showing "0 warnings".
 * Unread mail is folded into the Level-1 total at the render site (see `attention-panel.tsx`), so it is named here too: otherwise the total exceeds the sum of the parts shown.
 */
export const attentionSummarySubtitle: Record<Lang, (actionRequiredCount: number, warningCount: number, unreadMailCount?: number) => string> = {
  en: (actionRequiredCount, warningCount, unreadMailCount = 0) => {
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`${actionRequiredCount} require action`);
    if (warningCount > 0) parts.push(`${warningCount} warning(s)`);
    if (unreadMailCount > 0) parts.push(`${unreadMailCount} unread mail`);
    return parts.join(' · ');
  },
  ja: (actionRequiredCount, warningCount, unreadMailCount = 0) => {
    const parts: string[] = [];
    if (actionRequiredCount > 0) parts.push(`対応が必要 ${actionRequiredCount}件`);
    if (warningCount > 0) parts.push(`注意事項 ${warningCount}件`);
    if (unreadMailCount > 0) parts.push(`未読メール ${unreadMailCount}件`);
    return parts.join(' · ');
  },
};

/**
 * Shown next to the estimated labour cost when some active staff have no hourly rate
 * set: their hours are not priced, so the figure is a lower bound, not the true total.
 */
export const estimatedLabourCostMissingRate: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} staff member(s) without an hourly rate are not included`,
  ja: (count) => `時給が未設定の${count}名は含まれていません`,
};

/** "N items require restocking" for the single collapsed Inventory queue item. */
export const attentionInventoryShortageSummary: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} item(s) require restocking`,
  ja: (count) => `${count}件の商品が要補充です`,
};

/**
 * Day-header staffing-shortage explanation (Founder Review Round 2,
 * 2026-08-22, section 19) -- "Staffing shortage — required 3, scheduled 2,
 * missing 1", replacing an unexplained "!" with the actual coverage this
 * date is short by. Only ever called when `missing > 0` (see
 * `computeDailyStaffingCoverage`); the caller gates that.
 */
export const dailyStaffingShortageExplanation: Record<Lang, (required: number, scheduled: number, missing: number) => string> = {
  en: (required, scheduled, missing) => `Staffing shortage — required ${required}, scheduled ${scheduled}, missing ${missing}`,
  ja: (required, scheduled, missing) => `人員不足 -- 必要${required}名、予定${scheduled}名、不足${missing}名`,
};

// ============================================================================
// Manual "auto-create schedule" result copy (restored 2026-09-03)
// ============================================================================

/** Plain-Japanese (and English) label for each staffing window code. */
export const windowCodeLabel: Record<Lang, Record<WindowCode, string>> = {
  en: { AM: 'Morning', PM: 'Afternoon', ALL: 'All day', 'A-P': 'Midday', SHORT_AM: 'Early short' },
  ja: { AM: '午前', PM: '午後', ALL: '終日', 'A-P': '昼', SHORT_AM: '早番' },
};

/** Why a submitted preference did not become a shift, in plain language. */
export const unplacedReasonLabel: Record<Lang, (reason: UnplacedReason) => string> = {
  en: (reason) =>
    ({
      headcount_filled: 'the time slot was already full',
      no_staffing_requirement: 'no staff was needed for that time slot',
      max_period_hours_exceeded: 'it would exceed the staff member\'s hours limit',
      max_weekly_hours_exceeded: 'it would exceed the staff member\'s weekly hours limit',
      max_days_per_week_exceeded: 'it would exceed the staff member\'s working days per week',
      already_assigned: 'the staff member already has a shift that day',
      unknown_shift_type: 'the requested shift type no longer exists',
      inactive_shift_type: 'the requested shift type is no longer active',
    })[reason] ?? 'it could not be assigned',
  ja: (reason) =>
    ({
      headcount_filled: 'その時間帯はすでに定員に達していました',
      no_staffing_requirement: 'その時間帯に必要な人員がありませんでした',
      max_period_hours_exceeded: '勤務時間の上限を超えるため割り当てできませんでした',
      max_weekly_hours_exceeded: '週の最大勤務時間を超えるため割り当てできませんでした',
      max_days_per_week_exceeded: '週の最大勤務日数を超えるため割り当てできませんでした',
      already_assigned: 'その日はすでに別のシフトがあります',
      unknown_shift_type: '希望されたシフト種別が存在しません',
      inactive_shift_type: '希望されたシフト種別は無効になっています',
    })[reason] ?? '割り当てできませんでした',
};

export const autoCreateConfigErrorMessage: Record<Lang, (reason: RunAutoDistributionInvalidConfigReason) => string> = {
  en: (reason) =>
    ({
      no_active_windows:
        'No active shift types are set for this location yet. Add shift types in Settings first.',
      no_staffing_requirement:
        'No required staff count is set for any weekday. Set "Required staff per shift" in Settings first.',
      period_in_past:
        'That whole period is already in the past. Past shifts cannot be regenerated.',
    })[reason],
  ja: (reason) =>
    ({
      no_active_windows:
        'この店舗には有効なシフト種別がまだ設定されていません。先に設定でシフト種別を追加してください。',
      no_staffing_requirement:
        'どの曜日にも必要人数が設定されていません。先に設定の「1シフトあたりの必要人数」を設定してください。',
      period_in_past:
        'その期間はすでに過去です。過去のシフトは作り直せません。',
    })[reason],
};

export const autoCreateCreatedMessage: Record<Lang, (count: number) => string> = {
  en: (count) => `Created ${count} shift(s).`,
  ja: (count) => `${count}件のシフトを作成しました`,
};

/** One shortage row: date, shift-type label, how many people are still missing. */
export const autoCreateShortageLine: Record<Lang, (date: string, shiftTypeLabel: string, missing: number) => string> = {
  en: (date, shiftTypeLabel, missing) => `${date} · ${shiftTypeLabel} — ${missing} short`,
  ja: (date, shiftTypeLabel, missing) => `${date}・${shiftTypeLabel} — 不足${missing}名`,
};

/** One assigned-without-preference row: staff name, date, shift-type label. */
export const autoCreateAssignedWithoutPreferenceLine: Record<Lang, (staffName: string, date: string, shiftTypeLabel: string) => string> = {
  en: (staffName, date, shiftTypeLabel) => `${staffName} · ${date} · ${shiftTypeLabel}`,
  ja: (staffName, date, shiftTypeLabel) => `${staffName}・${date}・${shiftTypeLabel}`,
};

/** Manual/confirmed-shifts-preserved note, count-aware -- 0 preserved is still worth stating explicitly. */
export const autoCreatePreservedNote: Record<Lang, (count: number) => string> = {
  en: (count) => (count > 0 ? `${count} confirmed/manual shift(s) were not changed.` : 'No confirmed or manual shifts were in this period.'),
  ja: (count) => (count > 0 ? `確定済み・手動のシフト${count}件は変更していません。` : 'この期間に確定済み・手動のシフトはありませんでした。'),
};

/** One unplaced-preference row: staff name, date, plain-language reason. */
export const autoCreateUnplacedLine: Record<Lang, (staffName: string, date: string, reason: string) => string> = {
  en: (staffName, date, reason) => `${staffName} · ${date} — ${reason}`,
  ja: (staffName, date, reason) => `${staffName}・${date} — ${reason}`,
};

/**
 * One-line "last result" summary for the Settings section: always the created
 * count, then a dot-separated tail of only the non-zero attention counts
 * (shortages / unplaced preferences / staff who did not submit preferences).
 */
export const autoCreateLastResultSummary: Record<
  Lang,
  (created: number, shortages: number, unplaced: number, missingPreferences: number) => string
> = {
  en: (created, shortages, unplaced, missingPreferences) => {
    const parts = [`Created ${created}`];
    if (shortages > 0) parts.push(`${shortages} short`);
    if (unplaced > 0) parts.push(`${unplaced} unassigned`);
    if (missingPreferences > 0) parts.push(`${missingPreferences} without preferences`);
    return parts.join(' · ');
  },
  ja: (created, shortages, unplaced, missingPreferences) => {
    const parts = [`作成${created}件`];
    if (shortages > 0) parts.push(`不足${shortages}`);
    if (unplaced > 0) parts.push(`未割り当て${unplaced}`);
    if (missingPreferences > 0) parts.push(`希望未提出${missingPreferences}`);
    return parts.join('・');
  },
};

/**
 * Scheduled monthly auto-create run log (DEBT-074, `api.workforce_auto_schedule_runs`).
 * `dateTime` is already formatted in the location's timezone; `month` is the
 * target month label from `autoScheduleTargetMonthLabel`.
 */
const enCount = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

export const autoScheduleRunGeneratedLine: Record<Lang, (dateTime: string, month: string, created: number, shortages: number) => string> = {
  en: (dateTime, month, created, shortages) =>
    `${dateTime}: created a draft for ${month} (${enCount(created, 'shift', 'shifts')}, ${enCount(shortages, 'shortage', 'shortages')})`,
  ja: (dateTime, month, created, shortages) => `${dateTime} ${month}分の下書きを作成しました（${created}件、人員不足 ${shortages}件）`,
};

/** `reason` is the full sentence from `autoScheduleConfigErrorReasonText` (the same copy as the manual auto-create's config errors). */
export const autoScheduleRunConfigErrorLine: Record<Lang, (dateTime: string, month: string, reason: string) => string> = {
  en: (dateTime, month, reason) => `${dateTime}: automatic creation for ${month} did not run: ${reason}`,
  ja: (dateTime, month, reason) => `${dateTime} ${month}分は自動作成できませんでした：${reason}`,
};

/**
 * Reason sentence for a `config_error` run's machine `error_code`, reusing
 * `autoCreateConfigErrorMessage` (the manual auto-create's copy) so both
 * paths say the same thing. Unknown code -> `null` (caller shows the generic
 * failed line instead of a raw code).
 */
export function autoScheduleConfigErrorReasonText(lang: Lang, errorCode: string | null): string | null {
  if (errorCode === 'no_active_shift_types') return autoCreateConfigErrorMessage[lang]('no_active_windows');
  if (errorCode === 'no_staffing_requirement') return autoCreateConfigErrorMessage[lang]('no_staffing_requirement');
  return null;
}

export const autoScheduleRunFailedLine: Record<Lang, (dateTime: string, month: string) => string> = {
  en: (dateTime, month) => `${dateTime}: automatic creation for ${month} failed. Please create the schedule manually.`,
  ja: (dateTime, month) => `${dateTime} ${month}分の自動作成に失敗しました。手動で作成してください。`,
};

export const autoScheduleRunMissedLine: Record<Lang, (dayOfMonth: number) => string> = {
  en: (dayOfMonth) => `This month's automatic creation (day ${dayOfMonth}) did not run. Please create the schedule manually.`,
  ja: (dayOfMonth) => `今月の自動作成（毎月${dayOfMonth}日）は実行されませんでした。手動で作成してください。`,
};

/** `'YYYY-MM-01'` -> JA `2026年11月` / EN `November 2026`. */
export function autoScheduleTargetMonthLabel(lang: Lang, targetMonth: string): string {
  const [year, month] = targetMonth.split('-').map(Number) as [number, number];
  if (lang === 'ja') return `${year}年${month}月`;
  return `${AUTO_SCHEDULE_EN_MONTHS_LONG[month - 1] ?? ''} ${year}`;
}

const AUTO_SCHEDULE_EN_MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const AUTO_SCHEDULE_EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A run-log instant in the location's own timezone (never the browser's):
 * JA `10月20日 9:07`, EN `Oct 20, 9:07`. Hydration-safe: only the NUMERIC
 * parts come from `Intl` (explicit `timeZone`, 24h); the string itself is
 * built here, so Node (SSR) and the browser cannot differ in locale-specific
 * punctuation/spacing.
 */
export function autoScheduleRunDateTimeLabel(lang: Lang, isoInstant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(isoInstant));
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const month = num('month');
  const day = num('day');
  const hour = num('hour') % 24;
  const minute = String(num('minute')).padStart(2, '0');
  if (lang === 'ja') return `${month}月${day}日 ${hour}:${minute}`;
  return `${AUTO_SCHEDULE_EN_MONTHS[month - 1] ?? ''} ${day}, ${hour}:${minute}`;
}

/** Settings/auto-create result: how many shifts in the displayed week are still drafts (auto-created, not yet visible to staff). */
export const unpublishedShiftsLabel: Record<Lang, (count: number) => string> = {
  en: (count) => `Unpublished shifts this week: ${count} (staff cannot see them yet)`,
  ja: (count) => `この週の未公開シフト: ${count}件（スタッフにはまだ表示されていません）`,
};

export const publishWeekConfirmBody: Record<Lang, (count: number) => string> = {
  en: (count) => `${count} draft shift(s) in this week will become visible to staff. You can still edit any shift afterwards, but running "Create schedule automatically" again will no longer replace them.`,
  ja: (count) => `この週の下書きシフト${count}件がスタッフに表示されます。公開後も各シフトは編集できますが、もう一度「自動でシフトを作成」を実行しても置き換えられません。`,
};

export const publishWeekDoneMessage: Record<Lang, (count: number) => string> = {
  en: (count) => `Published ${count} shift(s). Staff can now see them.`,
  ja: (count) => `${count}件のシフトを公開しました。スタッフに表示されます。`,
};

// ---------------------------------------------------------------------------
// 4B-4b: Owner checklist 「はじめにやること」 (owner-checklist.ts / owner-checklist-card.tsx).
// Kept as one self-contained block (not in `ManagerDashboardDict`) so it
// merges independently of other key additions to the dictionary above.
// ---------------------------------------------------------------------------
type OwnerChecklistStepCopyId = 'add_staff' | 'invite_staff' | 'appoint_manager' | 'first_shift';

export interface OwnerChecklistCopy {
  heading: string;
  progress: (done: number, total: number) => string;
  close: string;
  closeAriaLabel: string;
  statusDone: string;
  statusTodo: string;
  /** Appended to an optional step's title; not counted in progress. */
  optionalTag: string;
  steps: Record<OwnerChecklistStepCopyId, { title: string; hint: string; action: string }>;
}

export const ownerChecklistCopy: Record<Lang, OwnerChecklistCopy> = {
  ja: {
    heading: 'はじめにやること',
    progress: (done, total) => `${done} / ${total} 完了`,
    close: '閉じる',
    closeAriaLabel: '「はじめにやること」を閉じる（この端末では再表示されません）',
    statusDone: '完了',
    statusTodo: '未完了',
    optionalTag: '（任意）',
    steps: {
      add_staff: { title: 'スタッフを登録する', hint: '一緒に働くスタッフを追加します。', action: 'スタッフを追加' },
      invite_staff: { title: 'スタッフをアプリに招待する', hint: '招待メールから登録すると、スタッフがシフトや勤怠を使えます。', action: '招待する' },
      appoint_manager: { title: '店長を決める', hint: 'スタッフの詳細から「店長にする」を選びます。', action: '店長を選ぶ' },
      first_shift: { title: '最初のシフトを作る', hint: 'シフトを作って公開すると、スタッフに表示されます。マスのタップか「自動でシフトを作成」で作れます。', action: 'シフト表へ' },
    },
  },
  en: {
    heading: 'Getting started',
    progress: (done, total) => `${done} / ${total} done`,
    close: 'Close',
    closeAriaLabel: 'Close “Getting started” (it will not come back on this device)',
    statusDone: 'Done',
    statusTodo: 'Not done',
    optionalTag: ' (optional)',
    steps: {
      add_staff: { title: 'Add your staff', hint: 'Add the people who work with you.', action: 'Add staff' },
      invite_staff: { title: 'Invite staff to the app', hint: 'Once they sign up from the invitation email, staff can use shifts and attendance.', action: 'Invite' },
      appoint_manager: { title: 'Choose a manager', hint: 'Open a staff member and choose “Make manager”.', action: 'Choose' },
      first_shift: { title: 'Create your first shift', hint: 'Staff see a shift once it is published. Tap a cell, or use “Create schedule automatically”.', action: 'Go to schedule' },
    },
  },
};

/** 4B-4b: Owner-only 管理者 section in the staff detail view (admin-role-section.tsx). The other admin* keys live in the dictionary above (#645). */
export const adminRoleSectionCopy: Record<Lang, { heading: string; isNotAdmin: string }> = {
  ja: {
    heading: '管理者権限',
    isNotAdmin: '管理者ではありません。管理者にすると、請求以外はオーナーと同じ操作（店長の任命・スタッフ管理・設定）ができます。',
  },
  en: {
    heading: 'Admin rights',
    isNotAdmin: 'Not an admin. An admin can do everything the owner can except billing: appoint managers, manage staff and change settings.',
  },
};
