import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Weekly Schedule redesign (2026-08-22): source-text regression guards for
 * `manager-dashboard-client.tsx`'s schedule-grid cell renderer. This repo's
 * test runner has no DOM/React harness, so these are source-text checks,
 * same convention as `shift-cell-editor.test.ts`.
 */
const SOURCE = readFileSync(new URL('./manager-dashboard-client.tsx', import.meta.url), 'utf8');

test('renderScheduleCellContent never renders a shift type\'s raw `code` as the cell label (regression guard for the CUSTOM_<timestamp> leak)', () => {
  assert.doesNotMatch(SOURCE, /shiftType\?\.code/, 'cell label must not fall back to shiftType.code directly');
  assert.match(SOURCE, /shiftTypeDisplayLabel\(shiftType\)/, 'cell label must resolve through shiftTypeDisplayLabel');
});

test('the Submitted shift preferences table also resolves through shiftTypeDisplayLabel, not a raw `.code` fallback', () => {
  assert.doesNotMatch(
    SOURCE,
    /shiftTypeById\.get\(r\.shiftTypeId[^)]*\)\?\.code/,
    'the preference-row shift chip must not fall back to a raw .code value',
  );
});

test('a filled schedule cell is a single clickable button regardless of published status (no more "Published -- read-only" dead end)', () => {
  assert.doesNotMatch(SOURCE, /publishedReadOnly/, 'the removed read-only dead end must not be reintroduced');
  // The cell button's onClick must not be conditioned on `published` --
  // Published shifts open the same editor as Draft ones (the controlled-edit
  // confirmation lives in shift-cell-editor.tsx, not a click-time gate here).
  const cellFn = SOURCE.slice(SOURCE.indexOf('function renderScheduleCellContent'), SOURCE.indexOf('function handleSetActive'));
  assert.match(cellFn, /onClick=\{\(\) => setEditingCell\(\{ staffId: s\.staffId, date \}\)\}/g);
  assert.doesNotMatch(cellFn, /entry\.assignment\.published \? \(/, 'a filled cell must not branch its editability on published status');
});

test('the empty-cell and filled-cell affordances are both a single <button>, not a stacked badge/button block', () => {
  const cellFn = SOURCE.slice(SOURCE.indexOf('function renderScheduleCellContent'), SOURCE.indexOf('function handleSetActive'));
  const buttonCount = (cellFn.match(/<button/g) ?? []).length;
  assert.equal(buttonCount, 2, 'expected exactly one <button> for the empty-cell branch and one for the filled-cell branch');
});

test('schedule cell buttons carry a full descriptive aria-label built from t(...) keys, not a hardcoded string', () => {
  const cellFn = SOURCE.slice(SOURCE.indexOf('function renderScheduleCellContent'), SOURCE.indexOf('function handleSetActive'));
  assert.match(cellFn, /t\('assignCellAriaLabelPrefix'\)/);
  assert.match(cellFn, /t\('editCellAriaLabelPrefix'\)/);
  assert.match(cellFn, /t\('statusPublishedAriaLabel'\)/);
  assert.match(cellFn, /t\('statusDraftAriaLabel'\)/);
});
