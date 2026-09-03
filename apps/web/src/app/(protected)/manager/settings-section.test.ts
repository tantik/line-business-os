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
  assert.match(SOURCE, /lastAutoCreateResult: \{[^}]*created: number/);
});

test('the "create schedule automatically" button calls onAutoCreate and reflects the pending state', () => {
  assert.match(SOURCE, /onClick=\{onAutoCreate\}/);
  assert.match(SOURCE, /disabled=\{autoCreatePending\}/);
  assert.match(SOURCE, /autoCreatePending \? t\('automationManualCreateRunning'\) : t\('automationManualCreateButton'\)/);
});

test('the day-of-month input is disabled and carries a coming-soon affordance, and no longer autosaves on change', () => {
  const block = SOURCE.slice(SOURCE.indexOf("t('automationCreateOnLabel')"));
  assert.match(block, /disabled\s*\n\s*readOnly/);
  assert.match(SOURCE, /t\('automationComingSoonNote'\)/);
  // the day-of-month <input> must not wire an onChange autosave anymore
  const inputStart = SOURCE.indexOf("aria-label={t('automationCreateOnLabel')}");
  const inputChunk = SOURCE.slice(inputStart - 400, inputStart + 100);
  assert.doesNotMatch(inputChunk, /onChange=\{\(event\) => \{[\s\S]*scheduleAutosave\(\)/);
});

test('the stored autoCreateDayOfMonth value is still passed through unchanged in the settings payload', () => {
  assert.match(SOURCE, /autoCreateDayOfMonth: toSave\.autoCreateDayOfMonth,/);
  assert.match(SOURCE, /settings\?\.autoCreateDayOfMonth \?\? 20/);
});

test('does not reintroduce a client-supplied staffing-requirements default', () => {
  assert.doesNotMatch(SOURCE, /DEFAULT_STAFFING_REQUIREMENTS/);
  assert.doesNotMatch(SOURCE, /staffingRequirements/);
});
