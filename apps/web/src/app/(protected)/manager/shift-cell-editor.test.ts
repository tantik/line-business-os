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
    'saving', 'save', 'assign', 'cancel', 'reassignEmployeeButton', 'correctingPastScheduleNotice',
  ]) {
    assert.ok(new RegExp(`t\\('${key}'\\)`).test(SOURCE), `ShiftCellEditor must render the '${key}' key via t(...)`);
  }
  for (const hardcoded of ['>Employee<', '>Shift type<', '>Start<', '>End<', '>Break (min)<', '>Custom<', '>Cancel<', "'Saving...'"]) {
    assert.ok(!SOURCE.includes(hardcoded), `ShiftCellEditor must not contain the hardcoded English literal ${hardcoded}`);
  }
});

test('ShiftCellEditor keeps staff names bound directly to their records, never translated', () => {
  assert.ok(SOURCE.includes('{s.name}'), 'the employee <option> must render the raw staff name');
});

// Weekly Schedule Founder Review Round 2 (2026-08-22, section 16): every
// user-facing shift-type label anywhere in this file must resolve through
// `shiftTypeDisplayLabel`, never render `code` directly -- `code` can be an
// internal `CUSTOM_<timestamp>` id (see `shift-types.ts`).
test('ShiftCellEditor never renders a shift type\'s raw `code` -- always through shiftTypeDisplayLabel', () => {
  assert.doesNotMatch(SOURCE, /\bst\.code\b/, 'must not render st.code directly');
  assert.match(SOURCE, /shiftTypeDisplayLabel\(st\)/);
});

test('ShiftCellEditor localizes the write-error states it can actually receive (not_found/not_authenticated/no_membership/stale_reference)', () => {
  for (const status of ["'not_found'", "'not_authenticated'", "'no_membership'", "'stale_reference'"]) {
    assert.ok(SOURCE.includes(`case ${status}:`), `ShiftCellEditor's error localizer must handle ${status}`);
  }
});

/**
 * Weekly Schedule Founder Review Round 2 (2026-08-22): Draft/Published no
 * longer gates anything in Manager UX -- editing an existing assignment
 * (any date) is always allowed. What replaced the old "editing a published
 * shift" confirmation is date-based: a real field change to an existing
 * FUTURE/TODAY assignment stages the write behind a "this is already
 * visible to the employee" confirmation; a PAST edit shows a quiet inline
 * notice instead, no extra confirmation step.
 */
test('ShiftCellEditor never gates anything on existing.assignment.published (that concept no longer exists in this file)', () => {
  assert.doesNotMatch(SOURCE, /\.published\b/, 'ShiftCellEditor must not reference published at all -- Draft/Published is not a Manager UX concept anymore');
});

test('ShiftCellEditor stages (does not immediately submit) a real change to an existing future/today assignment', () => {
  assert.match(SOURCE, /existing && !isPast && changed\)\s*\{\s*[\s\S]*?setPendingChangeConfirm\(/, 'a changed future/today edit must stage the FormData instead of calling doSubmit directly');
  assert.match(SOURCE, /function doSubmit\(formData: FormData\)/, 'the actual write must be extracted into a doSubmit(formData) callable from both the plain-save and confirmed-save paths');
});

test('ShiftCellEditor renders a ConfirmDialog gating the future/today change, showing the old -> new time and using t(...) copy', () => {
  assert.match(SOURCE, /<ConfirmDialog[\s\S]*?open=\{pendingChangeConfirm !== null\}/);
  assert.match(SOURCE, /t\('confirmChangeScheduledShiftTitle'\)/);
  assert.match(SOURCE, /t\('shiftAlreadyVisibleNotice'\)/);
  assert.match(SOURCE, /pendingChangeConfirm\.fromLabel/);
  assert.match(SOURCE, /pendingChangeConfirm\.toLabel/);
});

test('ShiftCellEditor: cancelling the change confirmation must not call doSubmit (Cancel never writes)', () => {
  const confirmBlock = SOURCE.slice(SOURCE.indexOf('<ConfirmDialog'), SOURCE.indexOf('</ConfirmDialog>'));
  const onCancelMatch = confirmBlock.match(/onCancel=\{([\s\S]*?)\}\s*\n\s*onConfirm=/);
  assert.ok(onCancelMatch, 'ConfirmDialog must have an onCancel handler');
  const onCancelBody = onCancelMatch?.[1] ?? '';
  assert.doesNotMatch(onCancelBody, /doSubmit/, 'onCancel must not call doSubmit');
});

test('ShiftCellEditor: a Save with no actual field change never shows the change-confirmation (only a real change does)', () => {
  assert.match(SOURCE, /const changed =\s*\n\s*Boolean\(existing\)/, 'change detection must compare submitted values against the existing assignment');
});

test('ShiftCellEditor shows a "correcting past schedule" notice when the cell\'s own date is before today, for both existing and empty cells', () => {
  assert.match(SOURCE, /const isPast = workDate < todayIso;/);
  assert.match(SOURCE, /isPast \? <div style=\{noticeStyle\}>\{t\('correctingPastScheduleNotice'\)\}<\/div> : null/);
});

test('ShiftCellEditor: Employee is read-only context for an existing assignment, with an explicit "Reassign employee" secondary action -- no always-editable dropdown', () => {
  assert.match(SOURCE, /reassignOpen/, 'reassign must be a toggled, deliberate state, not an always-visible select');
  assert.match(SOURCE, /t\('reassignEmployeeButton'\)/);
});

test('ShiftCellEditor renders any passed-in problemNotice (conflict/correction explanation) so a flagged shift explains itself when opened', () => {
  assert.match(SOURCE, /\{problemNotice \? <div style=\{alertDanger\}>\{problemNotice\}<\/div> : null\}/);
});
