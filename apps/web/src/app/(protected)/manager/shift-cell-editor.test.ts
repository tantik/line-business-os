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

/**
 * Weekly Schedule redesign (2026-08-22): editing an already-published shift
 * is allowed (published assignments are no longer hidden from the editor by
 * the caller), but the actual write is gated behind an explicit
 * confirmation instead of firing on plain Save -- these are source-text
 * regression guards for that "controlled edit" flow.
 */
test('ShiftCellEditor stages (does not immediately submit) a Save on an already-published shift', () => {
  assert.match(SOURCE, /existing\?\.assignment\.published\)\s*\{\s*[\s\S]*?setPendingPublishedSave\(formData\)/, 'a published shift\'s Save must stage the FormData instead of calling doSubmit directly');
  assert.match(SOURCE, /function doSubmit\(formData: FormData\)/, 'the actual write must be extracted into a doSubmit(formData) callable from both the plain-save and confirmed-save paths');
});

test('ShiftCellEditor renders a ConfirmDialog gating the published-shift save, using t(...) copy', () => {
  assert.match(SOURCE, /<ConfirmDialog[\s\S]*?open=\{pendingPublishedSave !== null\}/);
  assert.match(SOURCE, /t\('confirmPublishedEditTitle'\)/);
  assert.match(SOURCE, /t\('confirmPublishedEditBody'\)/);
});

test('ShiftCellEditor: cancelling the published-edit confirmation must not call doSubmit (Cancel never writes)', () => {
  const confirmBlock = SOURCE.slice(SOURCE.indexOf('<ConfirmDialog'), SOURCE.indexOf('</ConfirmDialog>'));
  const onCancelMatch = confirmBlock.match(/onCancel=\{([\s\S]*?)\}\s*\n\s*onConfirm=/);
  assert.ok(onCancelMatch, 'ConfirmDialog must have an onCancel handler');
  const onCancelBody = onCancelMatch?.[1] ?? '';
  assert.doesNotMatch(onCancelBody, /doSubmit/, 'onCancel must not call doSubmit');
});

test('ShiftCellEditor preserves the published flag unchanged when submitting an edit to a published shift (status does not flip to Draft as a UI side effect)', () => {
  assert.match(SOURCE, /if \(existing\.assignment\.published\) formData\.set\('published', 'true'\)/);
});

test('ShiftCellEditor shows a visible notice while editing an already-published shift', () => {
  assert.match(SOURCE, /existing\?\.assignment\.published[\s\S]{0,400}t\('editingPublishedShiftNotice'\)/);
});
