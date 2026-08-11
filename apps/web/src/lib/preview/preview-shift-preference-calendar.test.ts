import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder QA F08 regression - after tapping Submit, the shift-preference
 * form only swapped the button's own text (easy to miss, especially across
 * the ~3s of sequential per-day submit requests) with no other visible
 * pending indication. Every other module's Server Action pending state
 * renders through the platform-standard `PendingOverlay` (see that
 * component's own doc comment); this form must too. Source-text convention
 * matching `preview-settings-card.test.ts` (no component-rendering harness
 * in this repo).
 */
const SOURCE = readFileSync(new URL('./preview-shift-preference-calendar.tsx', import.meta.url), 'utf8');

test('imports and renders the platform-standard PendingOverlay', () => {
  assert.match(SOURCE, /import \{ PendingOverlay \} from '@\/components\/ui\/loading'/);
  assert.match(SOURCE, /<PendingOverlay visible=\{pending\} message=\{t\('submitting'\)\} \/>/);
});

test('the pending overlay is anchored to a position: relative container (PendingOverlay fills its nearest positioned ancestor)', () => {
  const overlayIndex = SOURCE.indexOf('<PendingOverlay');
  const before = SOURCE.slice(0, overlayIndex);
  const lastOpenDiv = before.lastIndexOf('<div');
  assert.ok(lastOpenDiv !== -1 && before.slice(lastOpenDiv).includes("position: 'relative'"), 'PendingOverlay must be inside a position: relative wrapper');
});

test('Submit and Cancel are both disabled while a submission is pending (duplicate-submit prevention)', () => {
  assert.match(SOURCE, /disabled=\{pending\} onClick=\{onClose\}/);
  assert.match(SOURCE, /disabled=\{pending\} onClick=\{submit\}/);
});
