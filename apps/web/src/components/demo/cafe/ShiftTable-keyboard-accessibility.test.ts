import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Staff Shift Schedule v2 (2026-08-25 Founder ТЗ), accessibility item: a
 * clickable Staff schedule cell must remain keyboard-operable, not only
 * mouse-clickable -- via a real nested <button>, not `role="button"` on the
 * <td> itself (overriding a table cell's implicit gridcell role would break
 * screen-reader table navigation for every clickable cell; fixed in
 * independent review, 2026-08-25).
 *
 * Scoped to `mode === 'staff'` only: `isCellClickable` returns true
 * unconditionally for `mode === 'manager'` (every cell in that grid), so
 * making every Manager cell a tab stop would insert hundreds of new tab
 * stops into an unrelated screen's tab order -- out of this Staff-only
 * mission's scope (independent review, 2026-08-25). Manager's clickable
 * cells must keep their pre-existing mouse-only behavior.
 *
 * Same source-text convention as this repo's other `ShiftTable` regression
 * guards (`shift-table-shortage-indicator.test.ts`) -- no DOM/React
 * rendering harness exists here.
 */
const SOURCE = readFileSync(new URL('./ShiftTable.tsx', import.meta.url), 'utf8');

test('a clickable schedule cell renders a real nested <button> only in staff mode, never role="button" on the <td>', () => {
  assert.match(SOURCE, /\{clickable && mode === 'staff' \? \(/, 'the button branch must require both clickable and staff mode');
  assert.match(SOURCE, /<button\s+type="button"\s+onClick=\{\(\) => onCellClick\?\.\(staff\.id, date\)\}/, 'staff-mode clickable cells must render a real <button> invoking onCellClick');
  assert.doesNotMatch(SOURCE, /role=\{clickable \? 'button' : undefined\}/, 'must not override the <td>\'s implicit gridcell role with role="button"');
});

test('Manager mode keeps mouse-only clicking on clickable cells -- no new tab stops added to its grid', () => {
  const cellSection = SOURCE.slice(SOURCE.indexOf('function isCellClickable'), SOURCE.indexOf('</table>'));
  assert.match(
    cellSection,
    /<div\s+onClick=\{clickable \? \(\) => onCellClick\?\.\(staff\.id, date\) : undefined\}/,
    'the non-staff-button branch (covers Manager mode) must still support mouse onClick without becoming a tab stop',
  );
});

test('the nested button responds to Enter/Space natively (no onKeyDown needed for a real <button>)', () => {
  assert.doesNotMatch(SOURCE, /onKeyDown=\{/, 'a real <button> already handles Enter/Space activation natively -- no manual onKeyDown polyfill should remain');
});
