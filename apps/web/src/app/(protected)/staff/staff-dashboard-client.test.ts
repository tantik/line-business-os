import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Regression guard for the Founder QA Scenario `CUSTOM_<timestamp>` leak
 * (docs/ai/CAFE_MANAGER_FOUNDER_QA_SCENARIO_HANDOFF_2026-08-23.md §3): the
 * submitted-preferences table and the selected-day shift detail both used to
 * render a shift type's raw `code` (an internal id, `CUSTOM_<timestamp>` for
 * any type ever created through the create-shift-type form) instead of its
 * display label. Same convention as `manager-dashboard-client.test.ts`'s
 * equivalent guard on the Manager side.
 */
const SOURCE = readFileSync(new URL('./staff-dashboard-client.tsx', import.meta.url), 'utf8');

test('staff dashboard never renders a shift type\'s raw `code` as a display label (regression guard for the CUSTOM_<timestamp> leak)', () => {
  assert.doesNotMatch(SOURCE, /\?\.code \?\?/, 'no shift-type lookup may fall back to raw `.code`');
  assert.match(SOURCE, /shiftTypeDisplayLabel\(st\)/, 'preference/shift labels must resolve through shiftTypeDisplayLabel');
});
