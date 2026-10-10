import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source guards for the invite-employee Edge Function (Deno, not runnable
 * under node:test). 2026-10-10: every resend and every "recover" emailed a
 * link with a fresh random invitation_id while `upsert_employee_invitation`
 * (0065) kept the already-pending row's id, so the link pointed at a
 * non-existent invitation and /auth/accept-invite failed.
 */
const SOURCE = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('the emailed link reuses the pending invitation id when one exists', () => {
  const read = SOURCE.indexOf(".from('workforce_employee_invitations')");
  const redirect = SOURCE.indexOf('const redirectTo =');
  assert.ok(read > 0 && redirect > read, 'pending invitation must be read before redirectTo is built');
  assert.match(SOURCE, /\.eq\('status', 'pending'\)/);
  assert.match(SOURCE, /invitation_id \?\? crypto\.randomUUID\(\)/);
});

test('the link is never sent before the invitation id is known (no unconditional random id)', () => {
  assert.doesNotMatch(SOURCE, /const invitationId = crypto\.randomUUID\(\);/);
});

test('success is never reported when the upserted row id differs from the id in the link', () => {
  assert.match(SOURCE, /out_invitation_id !== invitationId/);
  assert.match(SOURCE, /invitation_changed_concurrently/);
});
