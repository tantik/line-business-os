import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Weekly Schedule redesign source-text regression guards for
 * `manager-dashboard-client.tsx`'s schedule-grid cell renderer and day
 * header. This repo's test runner has no DOM/React harness, so these are
 * source-text checks, same convention as `shift-cell-editor.test.ts`.
 */
const SOURCE = readFileSync(new URL('./manager-dashboard-client.tsx', import.meta.url), 'utf8');

function cellFnSource(): string {
  return SOURCE.slice(SOURCE.indexOf('function renderScheduleCellContent'), SOURCE.indexOf('function handleSetActive'));
}

test('renderScheduleCellContent never renders a shift type\'s raw `code` as the cell label (regression guard for the CUSTOM_<timestamp> leak)', () => {
  assert.doesNotMatch(SOURCE, /shiftType\?\.code/, 'cell label must not fall back to shiftType.code directly');
  assert.match(SOURCE, /shiftTypeDisplayLabel\(shiftType\)/, 'cell label must resolve through shiftTypeDisplayLabel');
});

test('a filled schedule cell is a single clickable button, no Draft/Published branching on click', () => {
  assert.doesNotMatch(SOURCE, /publishedReadOnly/, 'the removed read-only dead end must not be reintroduced');
  const cellFn = cellFnSource();
  assert.match(cellFn, /onClick=\{\(\) => setEditingCell\(\{ staffId: s\.staffId, date \}\)\}/g);
  assert.doesNotMatch(cellFn, /entry\.assignment\.published/, 'a filled cell must not branch on published status at all -- that concept is gone from Manager UX');
});

test('the empty-cell and filled-cell affordances are both a single <button>, not a stacked badge/button block', () => {
  const cellFn = cellFnSource();
  const buttonCount = (cellFn.match(/<button/g) ?? []).length;
  assert.equal(buttonCount, 2, 'expected exactly one <button> for the empty-cell branch and one for the filled-cell branch');
});

test('schedule cell buttons carry a full descriptive aria-label built from t(...) keys, not a hardcoded string', () => {
  const cellFn = cellFnSource();
  assert.match(cellFn, /t\('assignCellAriaLabelPrefix'\)/);
  assert.match(cellFn, /t\('editCellAriaLabelPrefix'\)/);
});

// Founder Review Round 2 (2026-08-22), section 1/13: no status dot, no
// Draft/Published badge anywhere in the cell -- shift type (color + name)
// is the cell's only identity.
test('the filled cell never renders a Draft/Published status dot or badge', () => {
  assert.doesNotMatch(SOURCE, /cellStatusDotStyle/, 'the removed status dot must not be reintroduced');
  const cellFn = cellFnSource();
  assert.doesNotMatch(cellFn, /statusPublished|statusDraft/i);
});

// Section 6: future/today empty cell shows "+" (an ordinary open slot);
// past empty cell shows "-" by default (a deliberate historical correction,
// not an ordinary open slot) -- both open the same editor.
test('empty-cell affordance is "+" for future/today and "—" for a past date', () => {
  const cellFn = cellFnSource();
  assert.match(cellFn, /const isPast = date < todayIso;/);
  assert.match(cellFn, /\{isPast \? '—' : '\+'\}/);
  assert.match(cellFn, /t\('correctPastScheduleAriaLabelPrefix'\)/);
});

// Section 14: a filled cell shows shift name AND time together, not name
// alone relying on the legend to explain the hours.
test('a filled cell shows shift name and time together ("label · HH:MM-HH:MM"), not name alone', () => {
  const cellFn = cellFnSource();
  assert.match(cellFn, /const cellText = shiftType \? `\$\{label\} · \$\{timeRange\}` : label;/);
});

// Section 20: the Shift Types legend renders below the grid (after the
// table/card views), not above it.
test('the shift-type legend renders after the schedule grid, not before it', () => {
  const gridStart = SOURCE.indexOf('id="weekly-schedule"');
  const legendStart = SOURCE.indexOf('weekLegendTypes.map((st) =>');
  assert.ok(gridStart > 0 && legendStart > 0, 'expected both the grid and the legend to be present in the file');
  assert.ok(legendStart > gridStart, 'the legend must render after (below) the grid, not before it');
});

// Section 19: the day-header "!" carries the actual required/scheduled/
// missing numbers via `computeDailyStaffingCoverage`, not an unexplained
// boolean marker.
test('the day-header shortage marker uses computeDailyStaffingCoverage with real numbers, not a boolean-only check', () => {
  assert.match(SOURCE, /computeDailyStaffingCoverage/);
  assert.match(SOURCE, /dailyStaffingShortageExplanation\[lang\]\(coverage\.required, coverage\.scheduled, coverage\.missing\)/);
});

// Section 23: Publish schedule / Run auto-create no longer live as buttons
// in the Weekly Schedule card's own header -- they moved into Settings.
test('Weekly Schedule card no longer renders its own Publish schedule / Auto-create buttons', () => {
  const scheduleSectionStart = SOURCE.indexOf('id="weekly-schedule"');
  const scheduleSectionEnd = SOURCE.indexOf('</section>', scheduleSectionStart);
  const scheduleSection = SOURCE.slice(scheduleSectionStart, scheduleSectionEnd);
  assert.doesNotMatch(scheduleSection, /onClick=\{handlePublish\}/);
  assert.doesNotMatch(scheduleSection, /onClick=\{handleAutoDistribute\}/);
});

// -- Manual "auto-create schedule" workflow (restored 2026-09-03) ------------

test('auto-create calls runAutoDistribution with ONLY { locationId, periodStart, periodEnd } for the viewed week -- no client staffingRequirements / overwriteExisting', () => {
  const start = SOURCE.indexOf('function handleAutoCreate(');
  assert.ok(start >= 0, 'expected a handleAutoCreate handler');
  const body = SOURCE.slice(start, SOURCE.indexOf('function handleUndoAutoCreate('));
  assert.match(body, /runAutoDistribution\(\{\s*locationId,\s*periodStart: activePeriodStart,\s*periodEnd: activePeriodEnd,\s*\}\)/);
  assert.doesNotMatch(body, /staffingRequirements/);
  assert.doesNotMatch(body, /overwriteExisting/);
});

test('a confirm dialog names the REAL (past-date-clamped) target period before auto-create runs, and warns when part of the displayed week is already past', () => {
  assert.match(SOURCE, /open=\{autoCreateConfirmOpen\}/);
  const dialog = SOURCE.slice(SOURCE.indexOf('open={autoCreateConfirmOpen}'));
  assert.match(
    dialog.slice(0, 1600),
    /scheduleHeadingValue\[lang\]\(\s*activePeriodStart < todayIso \? todayIso : activePeriodStart,\s*activePeriodEnd,\s*\)/,
  );
  assert.match(dialog.slice(0, 1600), /autoCreatePastDaysExcludedNote/);
  assert.match(dialog.slice(0, 1600),/t\('autoCreateConfirmBody'\)/);
  assert.match(dialog.slice(0, 1600),/onConfirm=\{\(\) => \{\s*setAutoCreateConfirmOpen\(false\);\s*handleAutoCreate\(\);/);
});

test('the result view offers an Undo wired to undoAutoDistribution with the created assignment ids', () => {
  const start = SOURCE.indexOf('function handleUndoAutoCreate(');
  const body = SOURCE.slice(start, SOURCE.indexOf('function handleDecideCorrection('));
  assert.match(body, /undoAutoDistribution\(\{ assignmentIds \}\)/);
  assert.match(SOURCE, /onClick=\{\(\) => handleUndoAutoCreate\(autoCreateResult\.createdAssignmentIds\)\}/);
});

test('a server invalid_config outcome is surfaced with its own JA-safe copy, not a generic error', () => {
  assert.match(SOURCE, /result\.status === 'invalid_config'/);
  assert.match(SOURCE, /autoCreateConfigErrorMessage\[lang\]\(result\.reason\)/);
});

test('no client-supplied staffing-requirements default is reintroduced anywhere on the page', () => {
  assert.doesNotMatch(SOURCE, /DEFAULT_STAFFING_REQUIREMENTS/);
  assert.doesNotMatch(SOURCE, /staffingRequirements/);
});

// `undoAutoDistribution` and the pre-run proposal-replace both null
// `employee_id` (no DELETE grant). Those assignee-less rows must not be
// counted by the schedule grid's staffing-coverage / legend derivations --
// otherwise an orphaned row could mask a real shortage "!" marker.
test('the schedule view drops assignee-less (employee_id null) rows at the single source', () => {
  const memoStart = SOURCE.indexOf('const localAssignments = useMemo(');
  assert.ok(memoStart >= 0);
  const memoBody = SOURCE.slice(memoStart, SOURCE.indexOf('[scheduleWindowAssignments, dates, timeZone],'));
  assert.match(memoBody, /\.filter\(\(a\) => a\.employeeId !== null\)/);
});
