import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * FA-01 regression - `previewSignOut` must send the signed-out user back to
 * sign-in with the `returnTo` of the page they were actually on (Manager vs
 * Staff vs Recipes), not a hardcoded generic Staff path. Source-text checks
 * (same convention as `authorize.test.ts`) since this module is a
 * `'use server'` action that calls `next/navigation`'s `redirect()` (which
 * throws) and is not directly invocable under `node:test`.
 */
const SOURCE = readFileSync(new URL('./session-actions.ts', import.meta.url), 'utf8');

test('previewSignOut reads returnTo from the submitted form data', () => {
  assert.ok(/export async function previewSignOut\(formData: FormData\)/.test(SOURCE));
  assert.ok(/formData\.get\('returnTo'\)/.test(SOURCE));
});

test('previewSignOut validates the submitted returnTo through the shared allowlist before trusting it', () => {
  assert.ok(/sanitizePreviewReturnTo\(formData\.get\('returnTo'\)\?\.toString\(\)\)/.test(SOURCE));
});

test('previewSignOut falls back to the generic preview base path when returnTo is absent/invalid, never to the raw input', () => {
  assert.ok(/redirect\(buildPreviewSignInRedirect\(safeReturnTo \?\? PREVIEW_BASE_PATH\)\)/.test(SOURCE));
});
