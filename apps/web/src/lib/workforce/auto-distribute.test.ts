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

// Fixed shift-type catalog matching the task brief's table exactly.
const SHIFT_TYPES: AutoDistributeShiftType[] = [
  { shiftTypeId: 'st-all', code: 'ALL', startsAtLocal: '08:30', endsAtLocal: '17:30', breakMinutes: 60, sortOrder: 1, isActive: true },
  { shiftTypeId: 'st-am', code: 'AM', startsAtLocal: '08:30', endsAtLocal: '13:00', breakMinutes: 0, sortOrder: 2, isActive: true },
  { shiftTypeId: 'st-pm', code: 'PM', startsAtLocal: '12:00', endsAtLocal: '17:30', breakMinutes: 0, sortOrder: 3, isActive: true },
  { shiftTypeId: 'st-ap', code: 'A-P', startsAtLocal: '12:00', endsAtLocal: '15:00', breakMinutes: 0, sortOrder: 4, isActive: true },
  { shiftTypeId: 'st-short-am', code: 'SHORT_AM', startsAtLocal: '08:30', endsAtLocal: '10:00', breakMinutes: 0, sortOrder: 5, isActive: true },
  { shiftTypeId: 'st-custom', code: 'CUSTOM', startsAtLocal: '00:00', endsAtLocal: '00:00', breakMinutes: 0, sortOrder: 6, isActive: true },
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
    windowCode: 'AM' as const,
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
  for (const assignment of result.draftAssignments) {
    assert.equal(assignment.shiftTypeId, 'st-am');
    assert.equal(assignment.startsAtLocal, '08:30');
    assert.equal(assignment.endsAtLocal, '13:00');
    assert.equal(assignment.breakMinutes, 0);
    assert.equal(assignment.published, false);
    assert.equal(assignment.source, 'auto');
  }
});

// -- 2. NG / unavailable exclusion --------------------------------------------

test('excludes NG/unavailable preferences from that date (hard exclusion, not a failed placement)', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am', isUnavailable: true }),
  ];
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
  assert.equal(
    result.unplaced.some((entry) => entry.employeeId === 'e1'),
    false,
  );
});

// -- 3. nonSubmitters ----------------------------------------------------------

test('returns nonSubmitters for employees with no preferences in the period', () => {
  const employees = [makeEmployee({ employeeId: 'e1' }), makeEmployee({ employeeId: 'e2' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.nonSubmitters, [{ employeeId: 'e2' }]);
});

// -- 4. Never guess non-submitters ----------------------------------------------

test('does not guess assignments for non-submitters', () => {
  const employees = [makeEmployee({ employeeId: 'e1' }), makeEmployee({ employeeId: 'e2' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 2 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.equal(
    result.draftAssignments.some((a) => a.employeeId === 'e2'),
    false,
  );
  assert.equal(
    result.unplaced.some((u) => u.employeeId === 'e2'),
    false,
  );
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 2, assignedHeadcount: 1, shortage: 1 },
  ]);
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
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'ALL' as const, requiredHeadcount: 1 }];

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
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
    { workDate: '2026-08-03', windowCode: 'ALL' as const, requiredHeadcount: 1 },
    { workDate: '2026-08-04', windowCode: 'ALL' as const, requiredHeadcount: 1 },
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

// -- 8. Shortage reporting ---------------------------------------------------

test('reports shortage when required headcount cannot be met', () => {
  const employees = [makeEmployee({ employeeId: 'e1' })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 3 }];

  const result = autoDistribute({
    employees,
    shiftTypes: SHIFT_TYPES,
    preferences,
    staffingRequirements,
    existingAssignments: [],
    options: baseOptions({ periodStart: '2026-08-03', periodEnd: '2026-08-03' }),
  });

  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 3, assignedHeadcount: 1, shortage: 2 },
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
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
    staffingRequirements: [],
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

test('ignores inactive employees entirely', () => {
  const employees = [makeEmployee({ employeeId: 'e1', isActive: false })];
  const preferences = [makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' })];
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
});

// -- 12. Stable result order -----------------------------------------------------

test('returns a stable, deterministic result order regardless of input order', () => {
  const employees = [
    makeEmployee({ employeeId: 'e3' }),
    makeEmployee({ employeeId: 'e1' }),
    makeEmployee({ employeeId: 'e2' }),
  ];
  // Deliberately scrambled input order. Each (date, window) has exactly one
  // candidate, so there is no competitive tie-break to reason about here
  // (see the dedicated tie-breaker test above) -- this test is purely about
  // output ordering.
  const preferences = [
    makePreference({ employeeId: 'e2', workDate: '2026-08-04', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e1', workDate: '2026-08-03', shiftTypeId: 'st-am' }),
    makePreference({ employeeId: 'e3', workDate: '2026-08-03', shiftTypeId: 'st-pm' }),
  ];
  const staffingRequirements = [
    { workDate: '2026-08-04', windowCode: 'AM' as const, requiredHeadcount: 1 },
    { workDate: '2026-08-03', windowCode: 'PM' as const, requiredHeadcount: 1 },
    { workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 },
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
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
  // Still reported as a real shortage -- the requirement genuinely went unfilled.
  assert.deepEqual(result.shortages, [
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
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
  const staffingRequirements = [{ workDate: '2026-08-03', windowCode: 'AM' as const, requiredHeadcount: 1 }];

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
    { workDate: '2026-08-03', windowCode: 'AM', requiredHeadcount: 1, assignedHeadcount: 0, shortage: 1 },
  ]);
});

// -- deriveActiveScheduleWindowCodes -----------------------------------------

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
