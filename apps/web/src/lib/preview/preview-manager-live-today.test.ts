import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder P1 regression (2026-08-13, Contract 3) - Manager had no mechanism
 * at all to see a Staff-originated change (e.g. a submitted correction
 * request) without a manual page reload. `PreviewManagerLiveToday` closes
 * this gap with a targeted poll of `previewGetManagerTodaySignals`, never a
 * full page/`router.refresh()`. Source-text guards (no component-rendering
 * harness in this repo, same convention as `preview-manager-roster-section.test.ts`).
 */
const SOURCE = readFileSync(new URL('./preview-manager-live-today.tsx', import.meta.url), 'utf8');

test('PreviewManagerLiveToday polls previewGetManagerTodaySignals on an interval, not just once', () => {
  assert.match(SOURCE, /import \{ previewGetManagerTodaySignals \} from '\.\/actions\/today-signals-actions'/);
  assert.match(SOURCE, /setInterval\(poll, TODAY_SIGNALS_POLL_INTERVAL_MS\)/);
  assert.match(SOURCE, /clearInterval\(id\)/);
});

test('PreviewManagerLiveToday never calls router.refresh() to sync state', () => {
  assert.ok(!SOURCE.includes('router.refresh'), 'must rely on the scoped poll, not a full page refresh');
});

test('PreviewManagerLiveToday skips polling while the tab is hidden (never a background-tab request storm)', () => {
  assert.match(SOURCE, /document\.visibilityState !== 'visible'/);
});

test('PreviewManagerLiveToday feeds live state into PreviewManagerToday, not the raw initial props', () => {
  const body = SOURCE.slice(SOURCE.indexOf('return ('), SOURCE.indexOf(');\n}'));
  assert.match(body, /pendingCorrections=\{pendingCorrections\}/);
  assert.match(body, /pendingExchanges=\{pendingExchanges\}/);
  assert.match(body, /correctionSummaries=\{correctionSummaries\}/);
});
