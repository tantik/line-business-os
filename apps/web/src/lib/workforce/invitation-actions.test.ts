import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `invitation-actions.ts`'s Server Actions call `createClient()` directly
 * (not designed for dependency injection, same convention as
 * `accept-invite/route.test.ts` and `preview/actions/authorize.test.ts`) --
 * so `setPasswordAndAcceptInvitation`'s ordering/safety properties are
 * locked in here as source-text regression guards. Added alongside the
 * accept-invite callback fix (docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md,
 * Stage 1) to cover the boundary this fix relies on: the callback route
 * only ever pre-checks invitation state read-only; this action is the one
 * and only place that actually sets a password and accepts.
 */
const SOURCE = readFileSync(new URL('./invitation-actions.ts', import.meta.url), 'utf8');

// Isolate just setPasswordAndAcceptInvitation's own function body (from its
// `export async function` line to EOF, since it's the last export in the
// file) so assertions about it can't accidentally match the OTHER
// function's preceding doc comment or code.
const SET_PASSWORD_FN = SOURCE.slice(SOURCE.indexOf('export async function setPasswordAndAcceptInvitation'));

test('setPasswordAndAcceptInvitation validates password length before touching Supabase at all', () => {
  const lengthCheckIdx = SET_PASSWORD_FN.indexOf('password.length < MIN_PASSWORD_LENGTH');
  const createClientIdx = SET_PASSWORD_FN.indexOf('createClient()');
  assert.ok(lengthCheckIdx >= 0 && createClientIdx >= 0);
  assert.ok(lengthCheckIdx < createClientIdx, 'password-length validation must precede any Supabase client use');
});

test('setPasswordAndAcceptInvitation requires an existing session before updateUser -- never sets a password for an unauthenticated caller', () => {
  const sessionCheckIdx = SET_PASSWORD_FN.indexOf('if (sessionErr || !sessionData.session)');
  const updateUserIdx = SET_PASSWORD_FN.indexOf('supabase.auth.updateUser(');
  assert.ok(sessionCheckIdx >= 0 && updateUserIdx >= 0);
  assert.ok(sessionCheckIdx < updateUserIdx, 'session check must precede updateUser');
});

test('setPasswordAndAcceptInvitation sets the password before accepting the invitation -- password-first by design', () => {
  const updateUserIdx = SET_PASSWORD_FN.indexOf('supabase.auth.updateUser(');
  const acceptIdx = SET_PASSWORD_FN.indexOf('acceptWorkforceEmployeeInvitation(supabase, invitationId)');
  assert.ok(updateUserIdx >= 0 && acceptIdx >= 0);
  assert.ok(updateUserIdx < acceptIdx, 'password must be set before invitation acceptance is attempted');
});

test('setPasswordAndAcceptInvitation only calls acceptWorkforceEmployeeInvitation once, and only after a successful updateUser (no updateErr short-circuit bypassed)', () => {
  const updateErrGuardIdx = SET_PASSWORD_FN.indexOf('if (updateErr)');
  const acceptIdx = SET_PASSWORD_FN.indexOf('acceptWorkforceEmployeeInvitation(supabase, invitationId)');
  const occurrences = SET_PASSWORD_FN.split('acceptWorkforceEmployeeInvitation(supabase, invitationId)').length - 1;
  assert.equal(occurrences, 1, 'expected exactly one accept call in setPasswordAndAcceptInvitation');
  assert.ok(updateErrGuardIdx >= 0 && updateErrGuardIdx < acceptIdx, 'updateErr guard must precede the accept call');
});

test('acceptEmployeeInvitation (the existing-user banner path) never sets a password -- distinct from the new-user flow', () => {
  const acceptFnStart = SOURCE.indexOf('export async function acceptEmployeeInvitation');
  const acceptFnEnd = SOURCE.indexOf('const MIN_PASSWORD_LENGTH');
  assert.ok(acceptFnStart >= 0 && acceptFnEnd > acceptFnStart, 'expected acceptEmployeeInvitation to end before the MIN_PASSWORD_LENGTH constant');
  const acceptFnBody = SOURCE.slice(acceptFnStart, acceptFnEnd);
  assert.ok(!/updateUser/.test(acceptFnBody), 'acceptEmployeeInvitation must not touch password/updateUser');
});
