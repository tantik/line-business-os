import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveOwnerChecklist,
  isScheduleSettingsConfigured,
  ownerChecklistStorageKey,
  readOwnerChecklistHidden,
  writeOwnerChecklistHidden,
  type OwnerChecklistInput,
  type OwnerChecklistStaffInput,
} from './owner-checklist.js';
import { ownerChecklistCopy } from './manager-dashboard-i18n.js';

function staff(overrides: Partial<OwnerChecklistStaffInput> & { staffId: string }): OwnerChecklistStaffInput {
  return { isActive: true, hasAccountAccess: false, isManager: false, ...overrides };
}

function input(overrides: Partial<OwnerChecklistInput> = {}): OwnerChecklistInput {
  return { staff: [], selfStaffId: 'owner', scheduleSettings: null, assignments: [], ...overrides };
}

function doneMap(state: ReturnType<typeof deriveOwnerChecklist>) {
  return Object.fromEntries(state.steps.map((s) => [s.id, s.done]));
}

test('a brand-new tenant (only the Owner row) has 0 / 5 done, in the fixed step order', () => {
  const state = deriveOwnerChecklist(input({ staff: [staff({ staffId: 'owner', hasAccountAccess: true, isManager: true })] }));
  assert.deepEqual(
    state.steps.map((s) => s.id),
    ['add_staff', 'invite_staff', 'appoint_manager', 'schedule_settings', 'first_shift'],
  );
  assert.equal(state.doneCount, 0);
  assert.equal(state.total, 5);
  assert.equal(state.allDone, false);
});

test("the caller's own row never satisfies the staff steps", () => {
  const state = deriveOwnerChecklist(input({ staff: [staff({ staffId: 'owner', hasAccountAccess: true, isManager: true })] }));
  const done = doneMap(state);
  assert.equal(done.add_staff, false);
  assert.equal(done.invite_staff, false);
  assert.equal(done.appoint_manager, false);
});

test('without an own employee row (selfStaffId null) every active row counts', () => {
  const state = deriveOwnerChecklist(input({ selfStaffId: null, staff: [staff({ staffId: 'a', hasAccountAccess: true, isManager: true })] }));
  const done = doneMap(state);
  assert.equal(done.add_staff, true);
  assert.equal(done.invite_staff, true);
  assert.equal(done.appoint_manager, true);
});

test('inactive staff do not count for any staff step', () => {
  const state = deriveOwnerChecklist(input({ staff: [staff({ staffId: 'a', isActive: false, hasAccountAccess: true, isManager: true })] }));
  const done = doneMap(state);
  assert.equal(done.add_staff, false);
  assert.equal(done.invite_staff, false);
  assert.equal(done.appoint_manager, false);
});

test('a registered staff without a bound account completes step 1 only', () => {
  const done = doneMap(deriveOwnerChecklist(input({ staff: [staff({ staffId: 'a' })] })));
  assert.equal(done.add_staff, true);
  assert.equal(done.invite_staff, false);
  assert.equal(done.appoint_manager, false);
});

test('invite and manager steps are independent: any other active staff can satisfy each', () => {
  const done = doneMap(
    deriveOwnerChecklist(input({ staff: [staff({ staffId: 'a', hasAccountAccess: true }), staff({ staffId: 'b', isManager: true })] })),
  );
  assert.equal(done.invite_staff, true);
  assert.equal(done.appoint_manager, true);
});

test('schedule settings are configured only with a row that has a weekday headcount above 0', () => {
  assert.equal(isScheduleSettingsConfigured(null), false);
  assert.equal(isScheduleSettingsConfigured({ requiredHeadcountByWeekday: [0, 0, 0, 0, 0, 0, 0] }), false);
  assert.equal(isScheduleSettingsConfigured({ requiredHeadcountByWeekday: [] }), false);
  assert.equal(isScheduleSettingsConfigured({ requiredHeadcountByWeekday: [0, 0, 1, 0, 0, 0, 0] }), true);
  assert.equal(isScheduleSettingsConfigured({ requiredHeadcountByWeekday: [Number.NaN, 0, 0, 0, 0, 0, 0] }), false);
});

test('first shift needs an assignment with an assignee; null assignments read as not done', () => {
  assert.equal(doneMap(deriveOwnerChecklist(input({ assignments: [] }))).first_shift, false);
  assert.equal(doneMap(deriveOwnerChecklist(input({ assignments: null }))).first_shift, false);
  assert.equal(doneMap(deriveOwnerChecklist(input({ assignments: [{ employeeId: null }] }))).first_shift, false);
  assert.equal(doneMap(deriveOwnerChecklist(input({ assignments: [{ employeeId: 'a' }] }))).first_shift, true);
});

test('all five done -> allDone (the card is then not rendered)', () => {
  const state = deriveOwnerChecklist(
    input({
      staff: [staff({ staffId: 'owner' }), staff({ staffId: 'a', hasAccountAccess: true, isManager: true })],
      scheduleSettings: { requiredHeadcountByWeekday: [1, 2, 2, 2, 2, 2, 1] },
      assignments: [{ employeeId: 'a' }],
    }),
  );
  assert.equal(state.doneCount, 5);
  assert.equal(state.allDone, true);
});

test('hidden flag: per-tenant key, survives missing or throwing storage', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readOwnerChecklistHidden(storage, 't1'), false);
  writeOwnerChecklistHidden(storage, 't1');
  assert.equal(readOwnerChecklistHidden(storage, 't1'), true);
  assert.equal(readOwnerChecklistHidden(storage, 't2'), false, 'another tenant is not hidden');
  assert.notEqual(ownerChecklistStorageKey('t1'), ownerChecklistStorageKey('t2'));

  const throwing = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(readOwnerChecklistHidden(throwing, 't1'), false);
  assert.doesNotThrow(() => writeOwnerChecklistHidden(throwing, 't1'));
  assert.equal(readOwnerChecklistHidden(null, 't1'), false);
  assert.doesNotThrow(() => writeOwnerChecklistHidden(undefined, 't1'));
});

test('checklist copy exists in JA and EN for every step and differs by language', () => {
  for (const lang of ['ja', 'en'] as const) {
    const c = ownerChecklistCopy[lang];
    for (const value of [c.heading, c.close, c.closeAriaLabel, c.statusDone, c.statusTodo]) assert.ok(value.length > 0);
    for (const id of ['add_staff', 'invite_staff', 'appoint_manager', 'schedule_settings', 'first_shift'] as const) {
      assert.ok(c.steps[id].title.length > 0);
      assert.ok(c.steps[id].hint.length > 0);
      assert.ok(c.steps[id].action.length > 0);
      assert.notEqual(ownerChecklistCopy.ja.steps[id].title, ownerChecklistCopy.en.steps[id].title);
    }
  }
  assert.equal(ownerChecklistCopy.ja.heading, 'はじめにやること');
  assert.equal(ownerChecklistCopy.en.heading, 'Getting started');
  assert.equal(ownerChecklistCopy.ja.progress(3, 5), '3 / 5 完了');
  assert.equal(ownerChecklistCopy.ja.steps.appoint_manager.title, '店長を決める');
});
