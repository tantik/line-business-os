import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards for `settings-section.tsx`'s "Automatic
 * schedule" block (manual auto-create restored 2026-09-03). This repo's test
 * runner has no DOM/React harness, same convention as
 * `manager-dashboard-client.test.ts`.
 */
const SOURCE = readFileSync(new URL('./settings-section.tsx', import.meta.url), 'utf8');

test('exposes the manual auto-create props the parent owns', () => {
  assert.match(SOURCE, /onAutoCreate: \(\) => void;/);
  assert.match(SOURCE, /autoCreatePending: boolean;/);
  assert.match(SOURCE, /autoCreateUnavailable: boolean;/);
  assert.match(SOURCE, /lastAutoCreateResult: \{[^}]*created: number/);
});

test('the "create schedule automatically" button calls onAutoCreate, reflects the pending state, and is disabled when the whole displayed week is already past (past shifts are immutable)', () => {
  assert.match(SOURCE, /onClick=\{onAutoCreate\}/);
  assert.match(SOURCE, /disabled=\{autoCreatePending \|\| autoCreateUnavailable\}/);
  assert.match(SOURCE, /autoCreatePending \? t\('automationManualCreateRunning'\) : t\('automationManualCreateButton'\)/);
  assert.match(SOURCE, /autoCreateUnavailable \?[\s\S]{0,120}autoCreateWeekFullyPastNote/);
});

test('scheduled monthly auto-create has a real ON/OFF toggle and an editable day-of-month that both autosave', () => {
  assert.match(SOURCE, /checked=\{autoCreateEnabled\}/);
  assert.match(SOURCE, /setAutoCreateEnabled\(event\.currentTarget\.checked\)/);
  assert.match(SOURCE, /t\('automationEnabledLabel'\)/);
  // the day-of-month input is enabled once automation is ON and autosaves on change
  const inputStart = SOURCE.indexOf("aria-label={t('automationCreateOnLabel')}");
  const inputChunk = SOURCE.slice(inputStart - 600, inputStart + 100);
  assert.match(inputChunk, /disabled=\{!autoCreateEnabled\}/);
  assert.match(inputChunk, /onChange=\{\(event\) => \{[\s\S]*scheduleAutosave\(\)/);
});

test('shows the last-automatically-created month only when the scheduled worker has run', () => {
  assert.match(SOURCE, /settings\?\.autoCreateLastGeneratedMonth \?[\s\S]{0,200}automationLastGeneratedLabel/);
});

test('autoCreateDayOfMonth and autoCreateEnabled are both passed through in the settings payload', () => {
  assert.match(SOURCE, /autoCreateDayOfMonth: toSave\.autoCreateDayOfMonth,/);
  assert.match(SOURCE, /autoCreateEnabled: toSave\.autoCreateEnabled,/);
  assert.match(SOURCE, /settings\?\.autoCreateDayOfMonth \?\? 20/);
  assert.match(SOURCE, /settings\?\.autoCreateEnabled \?\? false/);
});

test('does not reintroduce a client-supplied staffing-requirements default', () => {
  assert.doesNotMatch(SOURCE, /DEFAULT_STAFFING_REQUIREMENTS/);
  assert.doesNotMatch(SOURCE, /staffingRequirements/);
});
