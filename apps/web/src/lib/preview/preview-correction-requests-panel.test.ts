import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder P1 regression (2026-08-13, Contract 3) - this panel's trigger
 * button/count previously only ever refreshed via `refreshRequests()` after
 * the *manager's own* decide action (`onDecided`) - a Staff-submitted
 * correction request never appeared here until a manual page reload, even
 * though the sibling `PreviewManagerToday` detail text (fed by a separate
 * poll, `preview-manager-live-today.tsx`) already updated live. This left
 * the same screen showing two different counts for the same underlying
 * data ("勤怠修正申請 (2)" next to a detail line already listing 3 items) -
 * exactly the kind of inconsistency a Founder eyeballing the UI would
 * flag. Fixed by polling the same, already-scoped
 * `previewGetCorrectionRequestsManagerData` refetch on a timer too, not by
 * introducing a new server action. Source-text guards (no
 * component-rendering harness in this repo).
 */
const SOURCE = readFileSync(new URL('./preview-correction-requests-panel.tsx', import.meta.url), 'utf8');

test('polls the existing scoped refetch on an interval, not only after the manager\'s own decide action', () => {
  assert.match(SOURCE, /setInterval\(poll, CORRECTION_REQUESTS_POLL_INTERVAL_MS\)/);
  assert.match(SOURCE, /clearInterval\(id\)/);
  const pollBody = SOURCE.slice(SOURCE.indexOf('const poll = async'), SOURCE.indexOf('const id = setInterval'));
  assert.match(pollBody, /previewGetCorrectionRequestsManagerData\(\)/);
  assert.match(pollBody, /setPendingRequests\(result\.data\.pending\)/);
  assert.match(pollBody, /setDecidedRequests\(result\.data\.decided\)/);
});

test('skips polling while the tab is hidden', () => {
  assert.match(SOURCE, /document\.visibilityState !== 'visible'/);
});

test('never calls router.refresh() to sync state', () => {
  assert.ok(!SOURCE.includes('router.refresh'));
});

test('the trigger button label still renders from the live pendingRequests state, not the initial prop', () => {
  const buttonBody = SOURCE.slice(SOURCE.indexOf('<button type="button" style={buttonSecondary}'), SOURCE.indexOf('</button>'));
  assert.match(buttonBody, /pendingRequests\.length/);
  assert.ok(!buttonBody.includes('initialPendingRequests'));
});
