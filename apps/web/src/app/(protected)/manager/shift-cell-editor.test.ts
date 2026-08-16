import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Cafe v2.1 final closure mission (F2): this editor was previously entirely
 * hardcoded English, ignoring the Manager JA/EN toggle already proven on the
 * surrounding page. Source-text regression guard -- this repo's test runner
 * has no DOM/React harness, so these are source-text checks, same convention
 * as `staff-form.test.ts`.
 */
const SOURCE = readFileSync(new URL('./shift-cell-editor.tsx', import.meta.url), 'utf8');

test('ShiftCellEditor uses the existing Manager useLang/tManagerDashboard mechanism, not a new i18n system', () => {
  assert.match(SOURCE, /import\s*\{\s*useLang\s*\}\s*from\s*'@\/lib\/demo\/cafe\/i18n'/);
  assert.match(SOURCE, /import\s*\{\s*tManagerDashboard\s*\}\s*from\s*'\.\/manager-dashboard-i18n'/);
  assert.doesNotMatch(SOURCE, /LangProvider/, 'ShiftCellEditor must not introduce its own LangProvider');
});

test('ShiftCellEditor renders every system/chrome label through t(...), not a hardcoded English literal', () => {
  for (const key of [
    'fieldEmployee', 'fieldShiftType', 'shiftTypeCustom', 'fieldStart', 'fieldEnd', 'fieldBreakMinutes',
    'saving', 'save', 'assign', 'cancel',
  ]) {
    assert.ok(new RegExp(`t\\('${key}'\\)`).test(SOURCE), `ShiftCellEditor must render the '${key}' key via t(...)`);
  }
  for (const hardcoded of ['>Employee<', '>Shift type<', '>Start<', '>End<', '>Break (min)<', '>Custom<', '>Cancel<', "'Saving...'"]) {
    assert.ok(!SOURCE.includes(hardcoded), `ShiftCellEditor must not contain the hardcoded English literal ${hardcoded}`);
  }
});

test('ShiftCellEditor keeps staff names and shift-type codes bound directly to their records, never translated', () => {
  assert.ok(SOURCE.includes('{s.name}'), 'the employee <option> must render the raw staff name');
  assert.ok(
    SOURCE.includes('{st.code} ({st.startsAtLocal}-{st.endsAtLocal})'),
    'the shift-type <option> must render the raw code/time, not a translated label',
  );
});

test('ShiftCellEditor localizes the write-error states it can actually receive (not_found/not_authenticated/no_membership/stale_reference)', () => {
  for (const status of ["'not_found'", "'not_authenticated'", "'no_membership'", "'stale_reference'"]) {
    assert.ok(SOURCE.includes(`case ${status}:`), `ShiftCellEditor's error localizer must handle ${status}`);
  }
});
