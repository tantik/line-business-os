/**
 * 4B-4b: Owner checklist 「はじめにやること」 on /manager -- pure derivation,
 * no React, no I/O. Every step is computed from data the Manager page
 * already loads (page.tsx); nothing here triggers a new read.
 *
 * Step rules ("self" = the caller's own employee row, `selfStaffId`; an
 * Owner/Admin without an employee row has no self, so every row counts):
 * 1. add_staff         -- at least one ACTIVE staff row other than self.
 * 2. invite_staff      -- at least one active staff (not self) whose account
 *                         is bound (`hasAccountAccess`, i.e. accepted an
 *                         invitation). A pending invitation does not count.
 * 3. appoint_manager   -- at least one active staff (not self) holding the
 *                         店長 role (`isManager`).
 * 4. schedule_settings -- the location has a schedule-settings row AND at
 *                         least one weekday's required headcount is > 0
 *                         (i.e. there is at least one business day with a
 *                         staffing requirement -- the precondition the
 *                         auto-create reports as `no_staffing_requirement`).
 *                         KNOWN LIMIT: a tenant created by provisioning
 *                         (0133) already gets the package template's row, so
 *                         this step starts as done for it. The api view has
 *                         no created_at to tell "template" from "saved by the
 *                         Owner" apart; doing that needs a migration.
 *                         A failed settings read reaches the client as
 *                         `null` too, so it shows as not done (fail-visible).
 * 5. first_shift       -- at least one shift assignment with an assignee in
 *                         the loaded window (the -8..+8 week window, or the
 *                         current week if that window failed to load).
 *
 * `null` staff (the roster read failed) means nothing can be derived: the
 * caller renders no card at all rather than a wrong "0 / 5".
 */

export type OwnerChecklistStepId = 'add_staff' | 'invite_staff' | 'appoint_manager' | 'schedule_settings' | 'first_shift';

export const OWNER_CHECKLIST_STEP_ORDER: readonly OwnerChecklistStepId[] = [
  'add_staff',
  'invite_staff',
  'appoint_manager',
  'schedule_settings',
  'first_shift',
];

export interface OwnerChecklistStaffInput {
  staffId: string;
  isActive: boolean;
  hasAccountAccess: boolean;
  isManager: boolean;
}

export interface OwnerChecklistInput {
  staff: readonly OwnerChecklistStaffInput[];
  selfStaffId: string | null;
  scheduleSettings: { requiredHeadcountByWeekday: readonly number[] } | null;
  /** Loaded shift assignments; `null` when the read failed (step stays not done). */
  assignments: readonly { employeeId: string | null }[] | null;
}

export interface OwnerChecklistStep {
  id: OwnerChecklistStepId;
  done: boolean;
}

export interface OwnerChecklistState {
  steps: OwnerChecklistStep[];
  doneCount: number;
  total: number;
  allDone: boolean;
}

export function isScheduleSettingsConfigured(settings: OwnerChecklistInput['scheduleSettings']): boolean {
  if (!settings) return false;
  return settings.requiredHeadcountByWeekday.some((n) => Number.isFinite(n) && n > 0);
}

export function deriveOwnerChecklist(input: OwnerChecklistInput): OwnerChecklistState {
  const others = input.staff.filter((s) => s.isActive && s.staffId !== input.selfStaffId);
  const doneById: Record<OwnerChecklistStepId, boolean> = {
    add_staff: others.length > 0,
    invite_staff: others.some((s) => s.hasAccountAccess),
    appoint_manager: others.some((s) => s.isManager),
    schedule_settings: isScheduleSettingsConfigured(input.scheduleSettings),
    first_shift: (input.assignments ?? []).some((a) => a.employeeId !== null),
  };
  const steps = OWNER_CHECKLIST_STEP_ORDER.map((id) => ({ id, done: doneById[id] }));
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, total: steps.length, allDone: doneCount === steps.length };
}

/**
 * 「閉じる」 is remembered per tenant in this browser's localStorage. Once
 * hidden the card stays hidden, even if a step later becomes not done again
 * (e.g. the only invited staff is deactivated) -- data never re-opens a card
 * the Owner closed. Independently, the card is never shown once all steps
 * are done, hidden flag or not.
 */
export function ownerChecklistStorageKey(tenantId: string): string {
  return `oruwa.manager.ownerChecklist.hidden.${tenantId}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** `false` when storage is missing or throws (private mode, blocked cookies): the card simply shows. */
export function readOwnerChecklistHidden(storage: StorageLike | null | undefined, tenantId: string): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ownerChecklistStorageKey(tenantId)) === '1';
  } catch {
    return false;
  }
}

/** Best-effort; a storage failure only means the card shows again on the next load. */
export function writeOwnerChecklistHidden(storage: StorageLike | null | undefined, tenantId: string): void {
  if (!storage) return;
  try {
    storage.setItem(ownerChecklistStorageKey(tenantId), '1');
  } catch {
    // ignore -- hiding still applies for this page view via component state
  }
}
