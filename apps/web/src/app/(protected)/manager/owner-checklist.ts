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
 * 3. appoint_manager   -- OPTIONAL (CTO decision 2026-10-24: a small store
 *                         may be run by the Owner alone). At least one active
 *                         staff (not self) holding the 店長 role
 *                         (`isManager`). Shown, but never counted in
 *                         `doneCount` / `total` / `allDone`.
 * 4. first_shift       -- at least one PUBLISHED shift assignment with an
 *                         assignee in the loaded window (the -8..+8 week
 *                         window, or the current week if that window failed
 *                         to load). A draft is invisible to staff, so it does
 *                         not count.
 *
 * Progress is "n / 3" over the required steps; the card hides once those
 * three are done, whether or not the optional step is.
 *
 * No "business days / staffing" step (CTO decision 2026-10-24): every
 * provisioned tenant (0133) already gets the package template's schedule
 * settings, so such a step would be either auto-done or misleading.
 *
 * `null` staff (the roster read failed) means nothing can be derived: the
 * caller renders no card at all rather than a wrong "0 / 3".
 */

export type OwnerChecklistStepId = 'add_staff' | 'invite_staff' | 'appoint_manager' | 'first_shift';

export const OWNER_CHECKLIST_STEP_ORDER: readonly OwnerChecklistStepId[] = [
  'add_staff',
  'invite_staff',
  'appoint_manager',
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
  /** Loaded shift assignments; `null` when the read failed (step stays not done). */
  assignments: readonly { employeeId: string | null; published: boolean }[] | null;
}

/** Steps shown but not counted toward progress / completion. */
export const OWNER_CHECKLIST_OPTIONAL_STEPS: ReadonlySet<OwnerChecklistStepId> = new Set<OwnerChecklistStepId>(['appoint_manager']);

export interface OwnerChecklistStep {
  id: OwnerChecklistStepId;
  done: boolean;
  optional: boolean;
}

export interface OwnerChecklistState {
  steps: OwnerChecklistStep[];
  /** Done REQUIRED steps only. */
  doneCount: number;
  /** Number of REQUIRED steps. */
  total: number;
  /** Every required step done (the optional step does not matter). */
  allDone: boolean;
}

export function deriveOwnerChecklist(input: OwnerChecklistInput): OwnerChecklistState {
  const others = input.staff.filter((s) => s.isActive && s.staffId !== input.selfStaffId);
  const doneById: Record<OwnerChecklistStepId, boolean> = {
    add_staff: others.length > 0,
    invite_staff: others.some((s) => s.hasAccountAccess),
    appoint_manager: others.some((s) => s.isManager),
    first_shift: (input.assignments ?? []).some((a) => a.employeeId !== null && a.published),
  };
  const steps = OWNER_CHECKLIST_STEP_ORDER.map((id) => ({ id, done: doneById[id], optional: OWNER_CHECKLIST_OPTIONAL_STEPS.has(id) }));
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;
  return { steps, doneCount, total: required.length, allDone: doneCount === required.length };
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
