import { makeTranslator, type Lang } from '@/lib/demo/cafe/i18n';
import type { UnplacedReason, WindowCode } from '@/lib/workforce/auto-distribute';
import type { RunAutoDistributionInvalidConfigReason } from '@/lib/workforce/schedule-types';

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
  fieldLineUserId: string;
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
  // Settings section (A8)
  settingsCardTitle: string;
  settingsHelpAriaLabel: string;
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
  deleteShiftTypeButton: string;
  confirmDeleteShiftTypeTitle: string;
  confirmDeleteShiftTypeBody: string;
  shiftTypeBlockedByHistory: string;
  savingStatus: string;
  savedStatus: string;
  saveErrorStatus: string;
  duplicateShiftTypeName: string;
  // Automatic schedule (Round 3, 2026-08-22): a capability actively being
  // built, not yet live -- the day-of-month input is a disabled preview of
  // its future configuration. Round 2's Run now/Publish schedule buttons
  // were removed here (Founder direction: the feature is mid-development,
  // so no half-working action should be exposed) in favor of a `(?)` info
  // popover explaining what this section will do once implemented.
  automationSectionHeading: string;
  automationCreateOnLabel: string;
  automationDayOfMonthSuffix: string;
  automationHelpAriaLabel: string;
  automationHelpTitle: string;
  automationHelpBody: string;
  // Manual "auto-create schedule" workflow (restored 2026-09-03): the
  // monthly scheduled job is still coming-soon (the day-of-month input is
  // disabled), but a manager can run the fill manually for the week they are
  // viewing. Server derives the staffing windows + headcount; confirmed and
  // manual shifts are always kept.
  automationComingSoonNote: string;
  automationManualCreateButton: string;
  automationManualCreateRunning: string;
  automationLastResultHeading: string;
  autoCreateConfirmTitle: string;
  autoCreateConfirmBody: string;
  autoCreateResultTitle: string;
  autoCreateManualPreservedNote: string;
  autoCreateShortagesHeading: string;
  autoCreateUnplacedHeading: string;
  autoCreateNonSubmittersHeading: string;
  autoCreateNoIssues: string;
  autoCreateUndoButton: string;
  autoCreateUndoing: string;
  autoCreateUndone: string;
  autoCreateErrorNoWindows: string;
  autoCreateErrorNoRequirement: string;
  autoCreateErrorStaleProposal: string;
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
  correctPastScheduleAriaLabelPrefix: string;
  // Shift requests review popup (v2.1 UI-only -- Settings entry point;
  // "Approve"/"Remove approval" toggle local component state, no
  // `workforce.shift_requests.status` write yet, see project memory /
  // plan file for the v2.2 follow-up that wires real persistence).
  shiftRequestsCardTitle: string;
  viewRequestsButton: string;
  shiftRequestsPopupHelpAriaLabel: string;
  shiftRequestsPopupHelpTitle: string;
  shiftRequestsPopupHelpBody: string;
  submittedPreferencesEmpty: string;
  noPreferenceSubmittedHint: string;
  markedUnavailableHint: string;
  approvePreferenceTitle: string;
  priorityExplainerBody: string;
  approvedPreferenceTitle: string;
  approvedPreferenceBody: string;
  removeApprovalButton: string;
  close: string;
  sendReminderTitle: string;
  sendReminderBody: string;
  copyReminderButton: string;
  reminderCopiedNotice: string;
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
  navRecipes: string;
  navInventory: string;
  navPurchases: string;
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
    fieldLineUserId: 'LINE user id (optional)',
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
    settingsCardTitle: 'Settings',
    settingsHelpAriaLabel: 'About settings',
    settingsHelpBody:
      'Set the usual staffing needed for each weekday, the monthly working-hours limit, and the standard shift patterns used when creating the schedule.',
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
      'Monthly automatic creation is coming later -- the day-of-month setting above is not active yet. You can use the "Create schedule automatically" button now to fill the week you are viewing, based on staff preferences and your settings. Confirmed and manual shifts are always kept.',
    automationComingSoonNote: 'Coming soon',
    automationManualCreateButton: 'Create schedule automatically',
    automationManualCreateRunning: 'Creating...',
    automationLastResultHeading: 'Last result',
    autoCreateConfirmTitle: 'Create this week\'s schedule automatically?',
    autoCreateConfirmBody: 'Staff will be assigned based on their preferences and your settings. Confirmed and manual shifts are left as they are.',
    autoCreateResultTitle: 'Automatic creation result',
    autoCreateManualPreservedNote: 'Confirmed and manual shifts were not changed.',
    autoCreateShortagesHeading: 'Time slots still short',
    autoCreateUnplacedHeading: 'Preferences that could not be assigned',
    autoCreateNonSubmittersHeading: 'Staff who have not submitted preferences',
    autoCreateNoIssues: 'No shortages or unassigned preferences.',
    autoCreateUndoButton: 'Undo automatic creation',
    autoCreateUndoing: 'Undoing...',
    autoCreateUndone: 'Automatic creation undone -- the shifts it created were removed.',
    autoCreateErrorNoWindows: 'No active shift types are set for this location yet. Add shift types in Settings first.',
    autoCreateErrorNoRequirement: 'No required staff count is set for any weekday. Set "Required staff per shift" in Settings first.',
    autoCreateErrorStaleProposal: 'This week still has unconfirmed automatically-created shifts. Confirm or undo them first.',
    estimatedLabourCostLabel: 'Estimated labour cost',
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
    correctPastScheduleAriaLabelPrefix: 'Correct past schedule',
    shiftRequestsCardTitle: 'Shift requests',
    viewRequestsButton: 'View requests',
    shiftRequestsPopupHelpAriaLabel: 'About shift requests',
    shiftRequestsPopupHelpTitle: 'About shift requests',
    shiftRequestsPopupHelpBody:
      'Check who has submitted next month\'s availability and review each person\'s preferred shifts. A red name means the request is still missing; open it to copy a reminder. Marking a request as approved records your review but does not change the schedule. "+" means no preference was entered for that day, and "—" means unavailable.',
    submittedPreferencesEmpty: 'No active staff to show.',
    noPreferenceSubmittedHint: 'No preference submitted for this day',
    markedUnavailableHint: 'Marked unavailable this day',
    approvePreferenceTitle: 'Approve preference',
    priorityExplainerBody:
      'Priority when building the schedule:\n1. A shift set by hand in Weekly Schedule\n2. An approved preference (like this one)\n3. An unapproved employee preference\n4. Automatic fallback assignment',
    approvedPreferenceTitle: 'Approved preference',
    approvedPreferenceBody: 'This preference is marked as a priority for scheduling.',
    removeApprovalButton: 'Remove approval',
    close: 'Close',
    sendReminderTitle: 'Remind employee',
    sendReminderBody: 'This employee hasn\'t submitted shift preferences yet. Copy this message and send it yourself for now.',
    copyReminderButton: 'Copy',
    reminderCopiedNotice: 'Copied',
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
      'Staff use these requests to change, cancel, or exchange an assigned shift. An exchange can be approved after a replacement accepts it or you select a replacement. Use the archive to review older decisions.',
    exchangeReplacementLabel: 'Replacement',
    exchangeReplacementNotAssigned: 'Not assigned',
    exchangeWaitingForCandidate: 'Waiting for candidate',
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
    navRecipes: 'Recipes',
    navInventory: 'Inventory',
    navPurchases: 'Purchases',
    backToWorkforce: 'Platform dashboard',
    staffActivated: 'Staff member activated.',
    staffDeactivated: 'Staff member deactivated.',
    shiftUnassigned: 'Shift unassigned.',
    correctionApproved: 'Correction approved.',
    correctionRejected: 'Correction rejected.',
    exchangeApproved: 'Shift exchange approved.',
    exchangeRejected: 'Shift exchange rejected.',
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
    fieldLineUserId: 'LINEユーザーID（任意）',
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
    settingsCardTitle: '設定',
    settingsHelpAriaLabel: '設定について',
    settingsHelpBody:
      '曜日ごとに通常必要な人数、スタッフの月間勤務時間の上限、スケジュール作成時に使う標準的なシフト時間を設定します。',
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
    deleteShiftTypeButton: '削除',
    confirmDeleteShiftTypeTitle: 'このシフト種別を完全に削除しますか？',
    confirmDeleteShiftTypeBody: 'この操作は取り消せません。スケジュールで一度でも使用されたシフト種別は削除できません -- その場合は無効化のままにしてください。',
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
      '毎月の自動作成は今後対応予定で、上の「自動作成する日」の設定はまだ有効ではありません。いま表示している週については、「自動でシフトを作成」ボタンで、スタッフの希望と設定にもとづいて割り当てできます。確定済み・手動のシフトは常にそのまま残ります。',
    automationComingSoonNote: '準備中',
    automationManualCreateButton: '自動でシフトを作成',
    automationManualCreateRunning: '作成中...',
    automationLastResultHeading: '直近の結果',
    autoCreateConfirmTitle: 'この週のシフトを自動で作成しますか？',
    autoCreateConfirmBody: 'スタッフの希望と設定にもとづいて割り当てます。確定済み・手動のシフトはそのまま残ります。',
    autoCreateResultTitle: '自動作成の結果',
    autoCreateManualPreservedNote: '確定済み・手動のシフトは変更していません',
    autoCreateShortagesHeading: '不足している時間帯',
    autoCreateUnplacedHeading: '割り当てできなかった希望',
    autoCreateNonSubmittersHeading: '希望シフト未提出のスタッフ',
    autoCreateNoIssues: '不足や未割り当ての希望はありません。',
    autoCreateUndoButton: '自動作成を取り消す',
    autoCreateUndoing: '取り消し中...',
    autoCreateUndone: '自動作成を取り消しました -- 作成されたシフトは削除されました。',
    autoCreateErrorNoWindows: 'この店舗には有効なシフト種別がまだ設定されていません。先に設定でシフト種別を追加してください。',
    autoCreateErrorNoRequirement: 'どの曜日にも必要人数が設定されていません。先に設定の「1シフトあたりの必要人数」を設定してください。',
    autoCreateErrorStaleProposal: 'この期間には未確定の自動シフト案があります。先に確定するか取り消してください。',
    estimatedLabourCostLabel: '概算人件費',
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
    correctingPastScheduleNotice: '過去のスケジュールを修正しています -- この日付はすでに過ぎています。',
    reassignEmployeeButton: '担当を変更',
    assignCellAriaLabelPrefix: 'シフトを割り当てる',
    editCellAriaLabelPrefix: 'シフトを編集',
    correctPastScheduleAriaLabelPrefix: '過去のスケジュールを修正',
    shiftRequestsCardTitle: 'シフト希望',
    viewRequestsButton: '希望を見る',
    shiftRequestsPopupHelpAriaLabel: 'シフト希望について',
    shiftRequestsPopupHelpTitle: 'シフト希望について',
    shiftRequestsPopupHelpBody:
      '来月のシフト希望を提出したスタッフと、未提出のスタッフを確認できます。赤色の名前を開くと、送信用のリマインダー文をコピーできます。「承認済み」は店長が確認した記録で、スケジュールは変更しません。「+」は希望未入力、「—」は勤務不可を表します。',
    submittedPreferencesEmpty: '表示できる有効なスタッフがいません。',
    noPreferenceSubmittedHint: 'この日は希望が提出されていません',
    markedUnavailableHint: 'この日は勤務不可としています',
    approvePreferenceTitle: '希望を承認',
    priorityExplainerBody:
      'スケジュール作成時の優先順位:\n1. Weekly Scheduleで手動設定したシフト\n2. 承認済みの希望（これ）\n3. 未承認のスタッフ希望\n4. 自動割り当て',
    approvedPreferenceTitle: '承認済みの希望',
    approvedPreferenceBody: 'この希望はスケジュール作成時に優先するものとして記録されています。',
    removeApprovalButton: '承認を取り消す',
    close: '閉じる',
    sendReminderTitle: 'スタッフに知らせる',
    sendReminderBody: 'このスタッフはまだシフト希望を提出していません。このメッセージをコピーして、ご自身で送ってください。',
    copyReminderButton: 'コピー',
    reminderCopiedNotice: 'コピーしました',
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
      '割り当て済みのシフトについて、変更・キャンセル・同僚との交換申請を確認できます。交換は、代わりのスタッフが承諾するか、店長が担当者を選ぶと承認できます。過去の対応はアーカイブから確認できます。',
    exchangeReplacementLabel: '交換相手',
    exchangeReplacementNotAssigned: '未指定',
    exchangeWaitingForCandidate: '交換相手を待っています',
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
    signOut: 'サインアウト',
    notSetLabel: '未設定',
    navRecipes: 'レシピ',
    navInventory: '在庫',
    navPurchases: '仕入れ',
    backToWorkforce: 'プラットフォームダッシュボード',
    staffActivated: 'スタッフを有効化しました。',
    staffDeactivated: 'スタッフを無効化しました。',
    shiftUnassigned: 'シフトの割り当てを解除しました。',
    correctionApproved: '修正依頼を承認しました。',
    correctionRejected: '修正依頼を却下しました。',
    exchangeApproved: 'シフト交換を承認しました。',
    exchangeRejected: 'シフト交換を却下しました。',
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
  en: (submittedCount, totalCount) => `${submittedCount}/${totalCount} submitted`,
  ja: (submittedCount, totalCount) => `${submittedCount}/${totalCount}名提出済み`,
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

/** Pre-filled copy-to-clipboard reminder text (v2.1 stub -- no real send). */
export const reminderMessageTemplate: Record<Lang, (staffName: string, monthLabel: string) => string> = {
  en: (staffName, monthLabel) => `Hi ${staffName}, please submit your shift preferences for ${monthLabel} when you get a chance. Thank you!`,
  ja: (staffName, monthLabel) => `${staffName}さん、${monthLabel}のシフト希望をまだ提出いただいていないようです。お手すきの際にご提出をお願いします。`,
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
      already_assigned: 'the staff member already has a shift that day',
      unknown_shift_type: 'the requested shift type no longer exists',
      inactive_shift_type: 'the requested shift type is no longer active',
    })[reason] ?? 'it could not be assigned',
  ja: (reason) =>
    ({
      headcount_filled: 'その時間帯はすでに定員に達していました',
      no_staffing_requirement: 'その時間帯に必要な人員がありませんでした',
      max_period_hours_exceeded: '勤務時間の上限を超えるため割り当てできませんでした',
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
      stale_proposal:
        'This week still has unconfirmed automatically-created shifts. Confirm or undo them first.',
    })[reason],
  ja: (reason) =>
    ({
      no_active_windows:
        'この店舗には有効なシフト種別がまだ設定されていません。先に設定でシフト種別を追加してください。',
      no_staffing_requirement:
        'どの曜日にも必要人数が設定されていません。先に設定の「1シフトあたりの必要人数」を設定してください。',
      stale_proposal:
        'この期間には未確定の自動シフト案があります。先に確定するか取り消してください。',
    })[reason],
};

export const autoCreateCreatedMessage: Record<Lang, (count: number) => string> = {
  en: (count) => `Created ${count} shift(s).`,
  ja: (count) => `${count}件のシフトを作成しました`,
};

/** One shortage row: date, window label, how many people are still missing. */
export const autoCreateShortageLine: Record<Lang, (date: string, windowLabel: string, missing: number) => string> = {
  en: (date, windowLabel, missing) => `${date} · ${windowLabel} — ${missing} short`,
  ja: (date, windowLabel, missing) => `${date}・${windowLabel} — 不足${missing}名`,
};

/** One unplaced-preference row: staff name, date, plain-language reason. */
export const autoCreateUnplacedLine: Record<Lang, (staffName: string, date: string, reason: string) => string> = {
  en: (staffName, date, reason) => `${staffName} · ${date} — ${reason}`,
  ja: (staffName, date, reason) => `${staffName}・${date} — ${reason}`,
};
