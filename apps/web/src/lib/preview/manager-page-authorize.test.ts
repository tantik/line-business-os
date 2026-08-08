import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Performance Fix Phase 1 - source-text regression guards proving
 * `authorizePreviewManagerPage` returns the resolved manager context (not
 * just a boolean) so the Manager page can reuse it, while every failure
 * outcome still collapses to the same neutral `fail` it always did (Staff /
 * wrong tenant / disabled module / blocked location / missing permission are
 * all indistinguishable to the page, exactly as before).
 */
const SOURCE = readFileSync(new URL('./manager-page-authorize.ts', import.meta.url), 'utf8');

test('authorizePreviewManagerPage still gates on the workforce.staff.manage permission via resolvePreviewManagerContext', () => {
  assert.ok(
    /resolvePreviewManagerContext\('workforce\.staff\.manage'\)/.test(SOURCE),
    'authorizePreviewManagerPage must still call resolvePreviewManagerContext with the workforce.staff.manage permission',
  );
});

test('authorizePreviewManagerPage returns the resolved context on success instead of discarding it', () => {
  assert.ok(
    /return \{ status: 'ok', context: result\.context \}/.test(SOURCE),
    'authorizePreviewManagerPage must return the resolved PreviewManagerContext, not just a boolean',
  );
});

test('authorizePreviewManagerPage fails closed to a single neutral status for every non-ok outcome (Staff cannot get Manager context)', () => {
  assert.ok(
    /if \(result\.status !== 'ok'\) return \{ status: 'fail' \}/.test(SOURCE),
    'every non-ok resolvePreviewManagerContext outcome (including a Staff-only caller missing the manager permission) must collapse to the same fail result',
  );
});
