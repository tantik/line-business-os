import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder QA F04 regression - the Staff schedule's colleague roster
 * (`employeeIds`) was built from every published assignment across the
 * whole preloaded ±8-week window instead of the currently displayed week,
 * so it silently accumulated employees who had a shift at some other point
 * in that 17-week span (including past/deactivated staff) - producing a
 * "Staff 1..Staff 9" colleague count that did not match Manager's current
 * active-staff roster. Source-text convention matching
 * `preview-settings-card.test.ts` (no component-rendering harness here).
 */
const SOURCE = readFileSync(new URL('./preview-staff-schedule.tsx', import.meta.url), 'utf8');

test('employeeIds is scoped to the currently displayed week, the same dates.includes(workDate) pattern referencedShiftTypeIds already uses', () => {
  const body = SOURCE.slice(SOURCE.indexOf('const employeeIds ='), SOURCE.indexOf('employeeIds.sort('));
  assert.match(body, /dates\.includes\(workDate\)/, 'employeeIds must filter assignments to the displayed week');
  assert.match(body, /utcIsoToLocalDateTime\(item\.startsAt, timeZone\)\.workDate/, 'must derive workDate the same way referencedShiftTypeIds does');
});
