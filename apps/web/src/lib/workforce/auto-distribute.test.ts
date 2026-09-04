import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoDistribute, deriveActiveScheduleWindowCodes } from './auto-distribute.js';
import type {
  AutoDistributeEmployee,
  AutoDistributeExistingAssignment,
  AutoDistributeOptions,
  AutoDistributePreference,
  AutoDistributeShiftType,
} from './auto-distribute.js';

// Fixed shift-type catalog. `code` no longer drives the engine's grouping
// (see the module-level fix note in auto-distribute.ts) -- some rows keep a
// recognized code (AM/PM/etc) to prove backward compatibility, others use a
// `CUSTOM_<timestamp>`-style code exactly like a real Manager-created shift
// type (the literal Preview-bug repro).
const SHIFT_TYPES: AutoDistributeShiftType[] = [
  { shiftTypeId: 'st-all', code: 'ALL', startsAtLocal: '08:30', endsAtLocal: '17:30', breakMinutes: 60, sortOrder: 1, isActive: true },
  { shiftTypeId: 'st-am', code: 'AM', startsAtLocal: '08:30', endsAtLocal: '13:00', breakMinutes: 0, sortOrder: 2, isActive: true },
  { shiftTypeId: 'st-pm', code: 'PM', startsAtLocal: '12:00', endsAtLocal: '17:30', breakMinutes: 0, sortOrder: 3, isActive: true },
  { shiftTypeId: 'st-ap', code: 'A-P', startsAtLocal: '12:00', endsAtLocal: '15:00', breakMinutes: 0, sortOrder: 4, isActive: true },
  { shiftTypeId: 'st-short-am', code: 'SHORT_AM', startsAtLocal: '08:30', endsAtLocal: '10:00', breakMinutes: 0, sortOrder: 5, isActive: true },
  { shiftTypeId: 'st-custom', code: 'CUSTOM_1234567890', startsAtLocal: '10:00', endsAtLocal: '15:00', breakMinutes: 0, sortOrder: 6, isActive: true },
];

/** A tenant whose ONLY shift types are Manager-created ones (`CUSTOM_<timestamp>` codes, `is_custom: true` in the real schema) -- the literal Preview-bug repro from the mission brief. */
const ALL_CUSTOM_SHIFT_TYPES: AutoDistributeShiftType[] = [
  { shiftTypeId: 'ct-morning', code: 'CUSTOM_1700000000000', startsAtLocal: '08:00', endsAtLocal: '13:00', breakMinutes: 0, sortOrder: 1, isActive: true },
  { shiftTypeId: 'ct-evening', code: 'CUSTOM_1700000000001', startsAtLocal: '13:00', endsAtLocal: '18:00', breakMinutes: 0, sortOrder: 2, isActive: true },
];

function makeEmployee(overrides: Partial<AutoDistributeEmployee> & { employeeId: string }): AutoDistributeEmployee {
  return { isActive: true, ...overrides };
}

function makePreference(
  overrides: Partial<AutoDistributePreference> & { employeeId: string; workDate: string },
): AutoDistributePreference {
  return { shiftTypeId: null, isUnavailable: false, ...overrides };
}

function makeExisting(
  overrides: Partial<AutoDistributeExistingAssignment> & { employeeId: string; workDate: string },
): AutoDistributeExistingAssignment {
  return {
    shiftTypeId: null,
    startsAtLocal: '08:30',
    endsAtLocal: '17:30',
    breakMinutes: 60,
    published: true,
    ...overrides,
  };
}

function baseOptions(overrides: Partial<AutoDistributeOptions> = {}): AutoDistributeOptions {
  return { periodStart: '2026-08-03', periodEnd: '2026-08-09', ...overrides };
}

// -- 1. Simple fully covered week --------------------------------------------

test('creates assignments for a simple fully covered week', () => {
  const dates = [
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ];
  const employees = [makeEmployee({ employeeId: 'e1' }), makeEmployee({ employeeId: 'e2' })];
  const staffingRequirements = dates.map((workDate) => ({
    workDate,
    shiftTypeId: 'st-am',
    requiredHeadcount: 1,
  }));
  const preferences = dates.map((workDate, index) =>
    makePreference({ employeeId: index % 2 === 0 ? 'e1' : 'e2', workDate, shiftTypeId: 'st-am' }),
  );

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions(),
  });

  assert.equal(result.draftAssignments.length, 7);
  assert.deepEqual(result.shortages, []);
  assert.deepEqual(result.unplaced, []);
  assert.deepEqual(result.nonSubmitters, []);
  assert.deepEqual(result.assignedWithoutPreference, []);
  for (const assignment of result.draftAssignments) {
    assert.equal(assignment.shiftTypeId, 'st-am');
    assert.equal(assignment.startsAtLocal, '08:30');
    assert.equal(assignment.endsAtLocal, '13:00');
    assert.equal(assignment.breakMinutes, 0);
    assert.equal(assignment.published, false);
    assert.equal(assignment.source, 'auto');
  }
});

// -- 1b. Root-cause regression: Manager-created CUSTOM_* shift types --------

test('REGRESSION (Preview bug): a location whose ONLY shift types are Manager-created CUSTOM_* ones is fully recognized', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const staffingRequirements = [
    { workDate: '2026-08-03', shiftTypeId: 'ct-morning', requiredHeadcount: 1 },
  ];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'ct-morning' })];

  const result = autoDistribute({
    employees,
    shiftTypes: ALL_CUSTOM_SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.equal(result.draftAssignments.length, 1, 'a CUSTOM_* shift type must be able to fill its own staffing requirement');
  assert.equal(result.draftAssignments[0]?.employeeId, 'e1');
  assert.equal(result.draftAssignments[0]?.shiftTypeId, 'ct-morning');
  assert.deepEqual(result.shortages, []);
});

// -- 2. NG / unavailable exclusion --------------------------------------------

test('excludes NG/unavailable preferences from that date (hard exclusion, not a failed placement, and never used as fallback)', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am', isUnavailable: true }),
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
  assert.equal(
    result.unplaced.some((entry) => entry.employeeId === 'e1'),
    false,
  );
});

// -- 3. nonSubmitters ----------------------------------------------------------

test('returns nonSubmitters for employees with no preferences in the period', () => {
  const employees = [makeEmployee({ employeeId: 'e1' }), makeEmployee({ employeeId: 'e2' })];
  // Requirement fully satisfied by e1 alone so e2's lack of a preference is
  // purely about reporting, not fallback placement.
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.nonSubmitters, [{ employeeId: 'e2' }]);
  assert.deepEqual(result.assignedWithoutPreference, []);
});

// -- 4. No-preference fallback placement (mandatory per product contract) ---

test('fallback: a no-preference employee is assigned (and reported) to fill a still-short slot; an explicitly-unavailable one never is', () => {
  const employees = [
    makeEmployee({ employeeId: 'a-preferred' }),
    makeEmployee({ employeeId: 'b-no-preference' }),
    makeEmployee({ employeeId: 'c-unavailable' }),
  ];
  const preferences = [
    makePreference({ employeeId: 'a-preferred', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'c-unavailable', workDate: '2026-08-03', shiftTypeId: 'st-am', isUnavailable: true }),
    // b-no-preference submits nothing for this date at all.
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 2 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.equal(result.draftAssignments.length, 2);
  const assignedIds = result.draftAssignments.map((a) => a.employeeId).sort();
  assert.deepEqual(assignedIds, ['a-preferred', 'b-no-preference']);
  assert.equal(
    result.draftAssignments.every((a) => a.employeeId !== 'c-unavailable'),
    true,
    'an explicitly-unavailable employee must never be used as a fallback',
  );
  assert.deepEqual(result.assignedWithoutPreference, [
    { employeeId: 'b-no-preference', workDate: '2026-08-03', shiftTypeId: 'st-am' },
  ]);
  assert.deepEqual(result.shortages, []);
});

// -- 5. Preserve published existing assignments ---------------------------------

test('preserves published existing assignments when overwriteExisting=false', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const existingAssignments = [
    makeExisting({
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-all',
      startsAtLocal: '08:30',
      endsAtLocal: '17:30',
      breakMinutes: 60,
      published: true,
    }),
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-all', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences: [],
    staffingRequirements,
    existingAssignments,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.shortages, []);
});

// -- 6. Overwrite only when overwriteExisting=true -------------------------------

test('can overwrite published assignments only when overwriteExisting=true', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const existingAssignments = [
    makeExisting({
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-all',
      startsAtLocal: '08:30',
      endsAtLocal: '17:30',
      breakMinutes: 60,
      published: true,
    }),
  ];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const notOverwritten = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });
  assert.deepEqual(notOverwritten.draftAssignments, []);
  assert.deepEqual(notOverwritten.unplaced, [
    { employeeId: 'e1', workDate: '2026-08-03', reason: 'already_assigned' },
  ]);

  const overwritten = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: true }),
  });
  assert.equal(overwritten.draftAssignments.length, 1);
  assert.equal(overwritten.draftAssignments[0]?.employeeId, 'e1');
  assert.equal(overwritten.draftAssignments[0]?.shiftTypeId, 'st-am');
});

// -- 7. maxPeriodHours -----------------------------------------------------------

test('respects maxPeriodHours', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-all' }), // 8h
    makePreference({ employeeId: 'e1', workDate: '2026-08-04', shiftTypeId: 'st-all' }), // would bring total to 16h
  ];
  const staffingRequirements = [
    { workDate: '2026-08-03', shiftTypeId: 'st-all', requiredHeadcount: 1 },
    { workDate: '2026-08-04', shiftTypeId: 'st-all', requiredHeadcount: 1 },
  ];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-04', maxPeriodHours: 10 }),
  });

  assert.equal(result.draftAssignments.length, 1);
  assert.equal(result.draftAssignments[0]?.workDate, '2026-08-03');
  assert.deepEqual(
    result.unplaced.filter((u) => u.reason === 'max_period_hours_exceeded'),
    [{ employeeId: 'e1', workDate: '2026-08-04', reason: 'max_period_hours_exceeded' }],
  );
});

// -- 7b. Calendar-month hour cap: hours already used elsewhere in the month --

test('CALENDAR-MONTH CAP: 160h monthly cap, 120h already used outside this run\'s period -> at most 40h more assignable', () => {
  // 8h/day shift type; 5 candidate days in the regeneration slice = 40h if
  // fully filled. With 120h already accrued elsewhere this same calendar
  // month, the cap (160h) allows exactly those 40h and no more.
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const dates = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'];
  const preferences = dates.map((workDate) => makePreference({ employeeId: 'e1', workDate, shiftTypeId: 'st-all' }));
  const staffingRequirements = dates.map((workDate) => ({ workDate, shiftTypeId: 'st-all', requiredHeadcount: 1 }));

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({
      periodStart: '2026-09-16',
      periodEnd: '2026-09-21',
      maxPeriodHours: 160,
      extraHoursByEmployee: { e1: 120 },
    }),
  });

  // 40h / 8h per shift = exactly 5 of the 6 candidate days.
  assert.equal(result.draftAssignments.length, 5);
  const totalNewHours = result.draftAssignments.length * 8;
  assert.equal(totalNewHours, 40);
  assert.equal(
    result.unplaced.some((u) => u.reason === 'max_period_hours_exceeded'),
    true,
  );
});

test('CALENDAR-MONTH CAP: an employee already at/over the cap gets zero additional assignments', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-09-16', shiftTypeId: 'st-all' })];
  const staffingRequirements = [{ workDate: '2026-09-16', shiftTypeId: 'st-all', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({
      periodStart: '2026-09-16',
      periodEnd: '2026-09-16',
      maxPeriodHours: 160,
      extraHoursByEmployee: { e1: 160 },
    }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.unplaced, [{ employeeId: 'e1', workDate: '2026-09-16', reason: 'max_period_hours_exceeded' }]);
});

test('CALENDAR-MONTH CAP: an employee comfortably below the cap is assigned normally', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-09-16', shiftTypeId: 'st-all' })];
  const staffingRequirements = [{ workDate: '2026-09-16', shiftTypeId: 'st-all', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({
      periodStart: '2026-09-16',
      periodEnd: '2026-09-16',
      maxPeriodHours: 160,
      extraHoursByEmployee: { e1: 20 },
    }),
  });

  assert.equal(result.draftAssignments.length, 1);
  assert.deepEqual(result.unplaced, []);
});

// -- 8. Shortage reporting ---------------------------------------------------

test('reports shortage when required headcount cannot be met even after fallback', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 3 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  // Only one active employee exists at all, so no fallback pool remains
  // after they're placed -- shortage must be honestly reported, never
  // fabricated.
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 3, assignedHeadcount: 1, shortage: 2 },
  ]);
});

// -- 9. Deterministic tie-breaker ---------------------------------------------

test('uses a deterministic tie-breaker: fewer hours, then displayOrder, then employeeId', () => {
  const employees = [
    makeEmployee({ employeeId: 'e-b', displayOrder: 2 }),
    makeEmployee({ employeeId: 'e-a', displayOrder: 1 }),
    makeEmployee({ employeeId: 'e-c' }), // no displayOrder -> sorts after every employee that has one
  ];
  const preferences = [
    makePreference({ employeeId: 'e-b', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e-a', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e-c', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  // All three tie on hours (0) -> lowest displayOrder (e-a: 1) wins.
  assert.equal(result.draftAssignments.length, 1);
  assert.equal(result.draftAssignments[0]?.employeeId, 'e-a');
  assert.deepEqual(
    result.unplaced.map((u) => u.employeeId).sort(),
    ['e-b', 'e-c'],
  );

  // Final tiebreaker (employeeId) when hours AND displayOrder both tie (neither has one).
  const employeesNoOrder = [makeEmployee({ employeeId: 'emp-b' }), makeEmployee({ employeeId: 'emp-a' })];
  const preferencesNoOrder = [
    makePreference({ employeeId: 'emp-b', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'emp-a', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
  ];
  const secondResult = autoDistribute({
    employees: employeesNoOrder,
    shiftTypes: SHIFT_TYPES,
    preferences: preferencesNoOrder,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });
  assert.equal(secondResult.draftAssignments[0]?.employeeId, 'emp-a');
});

// -- 10. Custom start/end pass-through ------------------------------------------

test('passes through a custom start/end preference as a custom draft assignment', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [
    makePreference({
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-custom',
      customStartsAtLocal: '09:15',
      customEndsAtLocal: '11:45',
    }),
  ];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements: [{ workDate: '2026-08-03', shiftTypeId: 'st-custom', requiredHeadcount: 1 }],
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.draftAssignments, [
    {
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-custom',
      startsAtLocal: '09:15',
      endsAtLocal: '11:45',
      breakMinutes: 0,
      published: false,
      source: 'auto',
    },
  ]);
  assert.deepEqual(result.shortages, []);
});

// -- 11. Inactive employees ignored ---------------------------------------------

test('ignores inactive employees entirely (not even as fallback candidates)', () => {
  const employees = [makeEmployee({ employeeId: 'e1', isActive: false })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.nonSubmitters, []); // ignored, not reported at all -- not even as a non-submitter
  assert.deepEqual(result.unplaced, []);
  assert.deepEqual(result.assignedWithoutPreference, []);
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
});

// -- 12. Stable result order -----------------------------------------------------

test('returns a stable, deterministic result order regardless of input order', () => {
  const employees = [
    makeEmployee({ employeeId: 'e3' }),
    makeEmployee({ employeeId: 'e1' }),
    makeEmployee({ employeeId: 'e2' }),
  ];
  // Deliberately scrambled input order. Each (date, shift type) has exactly
  // one candidate, so there is no competitive tie-break to reason about here
  // (see the dedicated tie-breaker test above) -- this test is purely about
  // output ordering.
  const preferences = [
    makePreference({ employeeId: 'e2', workDate: '2026-08-04', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e3', workDate: '2026-08-03', shiftTypeId: 'st-pm' }),
  ];
  const staffingRequirements = [
    { workDate: '2026-08-04', shiftTypeId: 'st-am', requiredHeadcount: 1 },
    { workDate: '2026-08-03', shiftTypeId: 'st-pm', requiredHeadcount: 1 },
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 },
  ];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-04' }),
  });

  assert.deepEqual(
    result.draftAssignments.map((a) => `${a.workDate}:${a.employeeId}`),
    ['2026-08-03:e1', '2026-08-03:e3', '2026-08-04:e2'],
  );
});

// -- 13. Unknown shift type -----------------------------------------------------

test('returns unplaced with reason unknown_shift_type for a preference referencing a shiftTypeId with no matching shift type', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-does-not-exist' }),
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.unplaced, [
    { employeeId: 'e1', workDate: '2026-08-03', reason: 'unknown_shift_type' },
  ]);
  // e1 has a (unresolvable) preference row, so they are excluded from the
  // fallback pool too (never double-guessed) -- shortage is honestly reported.
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
});

// -- 14. Inactive shift type -----------------------------------------------------

test('returns unplaced with reason inactive_shift_type for a preference referencing a known but inactive shift type', () => {
  const shiftTypesWithInactive: AutoDistributeShiftType[] = [
    ...SHIFT_TYPES,
    {
      shiftTypeId: 'st-retired',
      code: 'AM',
      startsAtLocal: '08:30',
      endsAtLocal: '13:00',
      breakMinutes: 0,
      sortOrder: 7,
      isActive: false,
    },
  ];
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-retired' })];
  const staffingRequirements = [{ workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: shiftTypesWithInactive,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.draftAssignments, []);
  assert.deepEqual(result.unplaced, [
    { employeeId: 'e1', workDate: '2026-08-03', reason: 'inactive_shift_type' },
  ]);
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', shiftTypeId: 'st-am', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
});

// -- deriveActiveScheduleWindowCodes (legacy, presentation-only helper) -----

test('deriveActiveScheduleWindowCodes returns the deduped, KNOWN_WINDOW_CODES-ordered set of active windows', () => {
  const result = deriveActiveScheduleWindowCodes([
    { code: 'PM', isActive: true },
    { code: 'am', isActive: true },
    { code: 'AM', isActive: true },
  ]);
  assert.deepEqual(result, ['AM', 'PM']);
});

test('deriveActiveScheduleWindowCodes excludes inactive shift types', () => {
  const result = deriveActiveScheduleWindowCodes([
    { code: 'AM', isActive: true },
    { code: 'PM', isActive: false },
  ]);
  assert.deepEqual(result, ['AM']);
});

test('deriveActiveScheduleWindowCodes excludes CUSTOM and other unresolved codes', () => {
  const result = deriveActiveScheduleWindowCodes([
    { code: 'CUSTOM', isActive: true },
    { code: 'UNKNOWN', isActive: true },
    { code: 'ALL', isActive: true },
  ]);
  assert.deepEqual(result, ['ALL']);
});

test('deriveActiveScheduleWindowCodes returns an empty array for zero active windows', () => {
  assert.deepEqual(deriveActiveScheduleWindowCodes([]), []);
  assert.deepEqual(deriveActiveScheduleWindowCodes([{ code: 'AM', isActive: false }]), []);
});

// -- Manual-priority guarantee (canonical Manager auto-create) ---------------
// The canonical `runAutoDistribution` always passes `overwriteExisting: false`.
// A published (manager-confirmed / manual) assignment must then be preserved
// untouched AND never re-generated, while an unconfirmed auto draft
// (`published: false`) gets no such preservation.

test('a published existing assignment is neither overwritten nor re-generated when overwriteExisting is false', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const staffingRequirements = [{ weekday: 1, shiftTypeId: 'st-am', requiredHeadcount: 1 }];
  // e1 asks for AM on 2026-08-03 (a Monday) but already has a published shift
  // that day -- a different, manager-set one (st-pm).
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const existing = [
    makeExisting({
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-pm',
      startsAtLocal: '12:00',
      endsAtLocal: '17:30',
      breakMinutes: 0,
      published: true,
    }),
  ];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: existing,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });

  // Nothing new created for e1 that day: the published shift already occupies
  // the one-shift-per-day slot and counts toward the AM headcount is NOT the
  // point -- the point is the algorithm did not touch it and did not add a
  // second shift for e1.
  assert.equal(result.draftAssignments.length, 0, 'no draft may be created on top of a preserved published shift');
  assert.ok(
    result.unplaced.some((u) => u.employeeId === 'e1' && u.workDate === '2026-08-03' && u.reason === 'already_assigned'),
    'the preference must be reported already_assigned, not silently placed',
  );
});

test('an unconfirmed auto draft (published: false) is NOT preserved -- the day is free to be filled again', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const staffingRequirements = [{ weekday: 1, shiftTypeId: 'st-am', requiredHeadcount: 1 }];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const existing = [
    makeExisting({
      employeeId: 'e1',
      workDate: '2026-08-03',
      shiftTypeId: 'st-am',
      startsAtLocal: '08:30',
      endsAtLocal: '13:00',
      breakMinutes: 0,
      published: false,
    }),
  ];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: existing,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });

  // The unpublished row does not occupy the slot: e1's AM preference is placed
  // fresh, exactly as if the draft weren't there.
  assert.equal(result.draftAssignments.length, 1);
  assert.equal(result.draftAssignments[0]?.employeeId, 'e1');
  assert.equal(result.draftAssignments[0]?.shiftTypeId, 'st-am');
  assert.equal(result.draftAssignments[0]?.published, false);
});

// -- Location isolation safety-net (algorithm level) ------------------------
// The canonical/preview Server Actions scope `existingAssignments` to the
// resolved location before calling `autoDistribute`. This test locks the
// algorithm's own guarantee that a stray existing assignment for an
// employee NOT in the `employees` snapshot (e.g. a sibling-location
// employee, or a foreign row that slipped through) contributes nothing:
// no preserved headcount, no hours seeded, no date blocked, no shortage
// change.

test('an existing assignment for an employee absent from the employees snapshot is ignored entirely', () => {
  const employees = [makeEmployee({ employeeId: 'locA-1' })];
  // A published ALL-day shift on the target Monday for someone the snapshot
  // does not contain (imagine Location B's employee, same tenant).
  const foreignExisting = [
    makeExisting({
      employeeId: 'locB-9',
      workDate: '2026-08-03',
      shiftTypeId: 'st-all',
      startsAtLocal: '08:30',
      endsAtLocal: '17:30',
      breakMinutes: 60,
      published: true,
    }),
  ];
  const preferences = [makePreference({ employeeId: 'locA-1', workDate: '2026-08-03', shiftTypeId: 'st-all' })];
  const staffingRequirements = [{ weekday: 1, shiftTypeId: 'st-all', requiredHeadcount: 1 }];

  const withForeign = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: foreignExisting,
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });
  const withoutForeign = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03', overwriteExisting: false }),
  });

  // The foreign published shift does NOT pre-fill the ALL window: locA-1 is
  // still placed, and the outcome is byte-identical to the no-foreign run.
  assert.deepEqual(withForeign.draftAssignments, withoutForeign.draftAssignments);
  assert.deepEqual(withForeign.shortages, withoutForeign.shortages);
  assert.deepEqual(withForeign.unplaced, withoutForeign.unplaced);
  assert.equal(withForeign.draftAssignments.length, 1);
  assert.equal(withForeign.draftAssignments[0]?.employeeId, 'locA-1');
});
