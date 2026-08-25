import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Staff Shift Schedule v2 (2026-08-25 Founder ТЗ), accessibility item: a
 * clickable schedule cell must remain keyboard-operable, not only mouse-
 * clickable. Same source-text convention as this repo's other `ShiftTable`
 * regression guards (`shift-table-shortage-indicator.test.ts`) -- no DOM/
 * React rendering harness exists here.
 */
const SOURCE = readFileSync(new URL('./ShiftTable.tsx', import.meta.url), 'utf8');

test('a clickable schedule cell carries role="button" and tabIndex={0} only when actually clickable', () => {
  assert.match(SOURCE, /role=\{clickable \? 'button' : undefined\}/, 'role must be conditional on clickable, never unconditionally "button"');
  assert.match(SOURCE, /tabIndex=\{clickable \? 0 : undefined\}/, 'tabIndex must be conditional on clickable, never unconditionally focusable');
});

test('a clickable schedule cell responds to Enter/Space via onKeyDown, invoking the same onCellClick as a mouse click', () => {
  assert.match(SOURCE, /onKeyDown=\{/, 'must attach a keydown handler on the cell');
  assert.match(SOURCE, /event\.key === 'Enter' \|\| event\.key === ' '/, 'must handle both Enter and Space, the two standard activation keys for a role="button" element');
  assert.match(SOURCE, /onCellClick\?\.\(staff\.id, date\)/, 'the keyboard handler must invoke the same onCellClick callback the mouse click uses');
});

test('the non-clickable cell branch is not made keyboard-focusable (no dead tab stop)', () => {
  const cellSection = SOURCE.slice(SOURCE.indexOf('function isCellClickable'), SOURCE.indexOf('</table>'));
  assert.match(cellSection, /tabIndex=\{clickable \? 0 : undefined\}/);
});
