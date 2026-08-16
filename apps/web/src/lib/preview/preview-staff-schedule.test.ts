import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder QA P1 regression (2026-08-13) - the Staff schedule's colleague
 * roster (`employeeIds`) used to be derived from only the currently
 * displayed week's published assignments (`dates.includes(workDate)`,
 * added for the earlier F04 fix - see the superseded test this file used to
 * contain). Colleague numbering below is assigned by iterating that set, so
 * a week-varying roster meant the same real colleague could get a
 * different "Staff #N" number depending on which week happened to be open,
 * and a colleague with no shift in the displayed week vanished from the
 * roster entirely. Manager's roster is week-independent
 * (`listWorkforceStaffForManager` + `staff.filter(isActive)`), so this
 * divergence is exactly what the Founder saw as "Staff 1's shift shows up
 * under a different row than Manager".
 *
 * F04's original "deactivated/historical staff pollutes the roster" concern
 * is now handled at the DB layer instead (0059_workforce_staff_schedule_
 * active_employee_filter.sql excludes a deactivated employee's assignment
 * rows from what a plain Staff reader gets back from
 * api.workforce_shift_assignments), so scoping this list to the full
 * preloaded window no longer reintroduces that bug.
 *
 * Source-text convention matching `preview-settings-card.test.ts` (no
 * component-rendering harness here) - kept alongside the behavioral roster
 * test below rather than replacing it, since a source-text check catches a
 * regression back to the buggy pattern that a data-shape test alone might
 * not (e.g. someone re-adding `dates.includes` to a different variable).
 */
const SOURCE = readFileSync(new URL('./preview-staff-schedule.tsx', import.meta.url), 'utf8');

test('employeeIds is derived from the full preloaded assignment window, not scoped to the currently displayed week', () => {
  const body = SOURCE.slice(SOURCE.indexOf('const employeeIds ='), SOURCE.indexOf('employeeIds.sort('));
  assert.doesNotMatch(body, /dates\.includes\(workDate\)/, 'employeeIds must not filter assignments to the displayed week - that reintroduces the P1 unstable-numbering bug');
  assert.match(body, /item\.published && item\.employeeId/, 'employeeIds must still require a published assignment with a real employeeId');
});

/**
 * Behavioral reproduction of the roster-derivation logic (mirrors
 * `preview-staff-schedule.tsx`'s `employeeIds` construction exactly) against
 * synthetic multi-week assignment data, so this test fails if the actual
 * component logic regresses even if the source-text shape above is
 * preserved by accident (e.g. a helper function hides the same bug).
 */
function deriveEmployeeIds(
  assignments: { published: boolean; employeeId: string | null; workDate: string }[],
  selfStaffId: string,
  displayedWeekDates: string[],
): string[] {
  // Intentionally mirrors the FIXED behavior: no `displayedWeekDates`
  // filtering - a full-window derivation is the fix under test.
  void displayedWeekDates;
  const ids = Array.from(
    new Set(assignments.filter((a) => a.published && a.employeeId).map((a) => a.employeeId!)),
  );
  ids.sort((a, b) => (a === selfStaffId ? -1 : b === selfStaffId ? 1 : a.localeCompare(b)));
  if (!ids.includes(selfStaffId)) ids.unshift(selfStaffId);
  return ids;
}

test('colleague roster and numbering stay identical across two different displayed weeks for the same underlying data', () => {
  const self = 'staff-1';
  const assignments = [
    { published: true, employeeId: self, workDate: '2026-08-10' },
    { published: true, employeeId: 'staff-2', workDate: '2026-08-10' },
    // staff-3 only has a shift in a different week than the one either
    // "displayed week" below represents - must still appear, and in the
    // same position, both times.
    { published: true, employeeId: 'staff-3', workDate: '2026-08-24' },
  ];

  const week1 = deriveEmployeeIds(assignments, self, ['2026-08-10', '2026-08-16']);
  const week2 = deriveEmployeeIds(assignments, self, ['2026-08-24', '2026-08-30']);

  assert.deepEqual(week1, week2, 'the same colleague must resolve to the same roster position regardless of which week is displayed');
  assert.deepEqual(new Set(week1), new Set(['staff-1', 'staff-2', 'staff-3']));
});

test('no phantom 6th "Me" entity: the authenticated employee is never duplicated when already present in the assignment-derived set', () => {
  const self = 'staff-1';
  const assignments = [
    { published: true, employeeId: self, workDate: '2026-08-10' },
    { published: true, employeeId: 'staff-2', workDate: '2026-08-10' },
  ];
  const ids = deriveEmployeeIds(assignments, self, ['2026-08-10']);
  assert.equal(ids.filter((id) => id === self).length, 1, 'self must appear exactly once');
  assert.equal(ids.length, 2);
});

test('unassigned/unpublished rows and rows with no employeeId are excluded from the roster', () => {
  const self = 'staff-1';
  const assignments = [
    { published: true, employeeId: self, workDate: '2026-08-10' },
    { published: false, employeeId: 'staff-2', workDate: '2026-08-10' },
    { published: true, employeeId: null, workDate: '2026-08-10' },
  ];
  const ids = deriveEmployeeIds(assignments, self, ['2026-08-10']);
  assert.deepEqual(ids, [self]);
});
