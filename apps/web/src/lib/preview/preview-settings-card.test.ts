import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * FA-04 regression - the shift-type "Delete" action actually deactivates the
 * record (the model has no permanent-delete path for shift types); it must
 * be labeled honestly, gated behind an explicit confirmation, and paired
 * with a Deactivated view + Reactivate so a manager can recover it. Same
 * source-text convention as `authorize.test.ts` (no component-rendering
 * harness in this repo).
 */
const SOURCE = readFileSync(new URL('./preview-settings-card.tsx', import.meta.url), 'utf8');

test('imports the shared ConfirmDialog rather than a new/duplicate modal implementation', () => {
  assert.ok(/import \{ ConfirmDialog \} from '@\/components\/demo\/cafe\/ConfirmDialog'/.test(SOURCE));
});

test('the active-list action is labeled Deactivate, not Delete', () => {
  assert.ok(/\{t\('deactivateShiftTypeButton'\)\}/.test(SOURCE));
  assert.ok(!/\{t\('deleteButton'\)\}/.test(SOURCE), 'the shift-type row action must no longer render the dishonest "Delete" label');
});

test('the active-list Deactivate button only stages a confirmation - it never deactivates directly on click', () => {
  assert.ok(/onClick=\{\(\) => setConfirmDeactivateId\(st\.shiftTypeId\)\}/.test(SOURCE));
  assert.ok(!/onClick=\{\(\) => deactivateShiftType\(st\.shiftTypeId\)\}/.test(SOURCE));
});

test('deactivateShiftType (the actual mutation) is only wired to the ConfirmDialog onConfirm handler', () => {
  assert.ok(/onConfirm=\{\(\) => deactivateShiftType\(confirmDeactivateId\)\}/.test(SOURCE));
});

test('the confirmation dialog is dismissed only on a successful deactivation', () => {
  const body = SOURCE.slice(SOURCE.indexOf('function deactivateShiftType'), SOURCE.indexOf('function reactivateShiftType'));
  assert.ok(/if \(result\.status === 'success'\) \{\s*\/\/[\s\S]*?setConfirmDeactivateId\(null\);/.test(body));
});

test('reactivateShiftType calls previewSetShiftTypeActive with isActive: true against the existing record', () => {
  const body = SOURCE.slice(SOURCE.indexOf('function reactivateShiftType'));
  assert.ok(/previewSetShiftTypeActive\(\{ shiftTypeId, isActive: true \}\)/.test(body));
});

test('a Deactivated view lists inactive shift types with a Reactivate action', () => {
  assert.ok(/inactiveShiftTypes = shiftTypes\?\.filter\(\(shiftType\) => !shiftType\.isActive\)/.test(SOURCE));
  assert.ok(/onClick=\{\(\) => reactivateShiftType\(st\.shiftTypeId\)\}/.test(SOURCE));
  assert.ok(/\{t\('reactivate'\)\}/.test(SOURCE));
});

test('no permanent-delete action or schema-changing call is introduced for shift types', () => {
  assert.ok(!/permanentlyDelete/i.test(SOURCE));
  assert.ok(!/PermanentlyDeleteShiftType/.test(SOURCE));
});
