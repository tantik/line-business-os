import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `accept-invite/route.ts`'s `createClient()` is not designed for
 * dependency injection (same convention as `preview/actions/authorize.test.ts`
 * for `resolvePreviewManagerContext`) -- so its call sequencing and safety
 * properties are locked in here as source-text regression guards, per
 * docs/ai/STAFF_ONBOARDING_INVITE_CALLBACK_DEFECT_IMPLEMENTATION_PLAN_2026-08-15.md
 * (Stage 1). Exercised end to end only via manual/Preview smoke once the
 * Stage 2 email-template change lands (tracked separately, NOT applied by
 * this change).
 */
const SOURCE = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');

// The module-level JSDoc above `GET` documents the very call names/strings
// this file's tests need to locate in the CODE (verifyOtp, token_hash,
// api.accept_employee_invitation, redirect targets, etc.), so every
// ordering/absence assertion below scans only the executable body -- from
// the `GET` function's opening brace onward -- never the file's own doc
// comment, to avoid the comment's prose matching before/instead of the
// real code.
const BODY = SOURCE.slice(SOURCE.indexOf('export async function GET'));

test('GET requires invitation_id before attempting any verification', () => {
  const invitationCheckIdx = BODY.indexOf('if (!invitationId)');
  const verifyOtpIdx = BODY.indexOf('supabase.auth.verifyOtp(');
  const exchangeIdx = BODY.indexOf('supabase.auth.exchangeCodeForSession(');
  assert.ok(invitationCheckIdx >= 0, 'must guard on missing invitation_id');
  assert.ok(invitationCheckIdx < verifyOtpIdx, 'invitation_id check must precede verifyOtp');
  assert.ok(invitationCheckIdx < exchangeIdx, 'invitation_id check must precede exchangeCodeForSession');
});

test('GET verifies a token_hash callback via supabase.auth.verifyOtp with an allow-listed type, never a raw access/refresh token', () => {
  assert.ok(/supabase\.auth\.verifyOtp\(\{\s*token_hash:\s*tokenHash,\s*type:/.test(BODY), 'must call verifyOtp with token_hash + type');
  assert.ok(/ALLOWED_TOKEN_HASH_TYPES/.test(BODY), 'must restrict type to an explicit allow-list');
  assert.ok(!/\baccess_token\b/.test(BODY), 'must never read/handle a raw access_token');
  assert.ok(!/\brefresh_token\b/.test(BODY), 'must never read/handle a raw refresh_token');
  assert.ok(!/setSession\(/.test(BODY), 'must never call client-side setSession() -- Option A only, per the approved plan');
});

test('GET keeps the PKCE ?code= exchange as a backward-compatible fallback', () => {
  assert.ok(/supabase\.auth\.exchangeCodeForSession\(code\)/.test(BODY), 'must keep the existing code-exchange path');
});

test('GET rejects an unrecognized token_hash `type` before calling verifyOtp', () => {
  const typeGuardIdx = BODY.indexOf('!ALLOWED_TOKEN_HASH_TYPES.has(type)');
  const verifyOtpIdx = BODY.indexOf('supabase.auth.verifyOtp(');
  assert.ok(typeGuardIdx >= 0 && typeGuardIdx < verifyOtpIdx, 'type allow-list check must precede verifyOtp call');
});

test('GET pre-validates the invitation is still pending (and belongs to the caller) after verification, before redirecting to password setup', () => {
  const verifyOtpIdx = BODY.indexOf('supabase.auth.verifyOtp(');
  const invitationCheckIdx = BODY.indexOf('getWorkforceEmployeeInvitationById(');
  const setPasswordRedirectIdx = BODY.indexOf('/auth/accept-invite/set-password');
  assert.ok(verifyOtpIdx >= 0 && invitationCheckIdx >= 0 && setPasswordRedirectIdx >= 0);
  assert.ok(verifyOtpIdx < invitationCheckIdx, 'session must be established before the invitation-state check');
  assert.ok(invitationCheckIdx < setPasswordRedirectIdx, 'invitation-state check must precede the password-setup redirect');
  assert.ok(/invitation\.status !== 'pending'/.test(BODY), 'must require pending status');
  assert.ok(/invitation\.isExpired/.test(BODY), "must require the invitation's own expiry window not be exceeded");
});

test('GET signs out again if verification succeeds but the invitation is not valid for this caller -- never leaves a confirmed-but-unonboarded session behind', () => {
  const invitationCheckIdx = BODY.indexOf('!invitation || invitation.status');
  const signOutIdx = BODY.indexOf('supabase.auth.signOut()');
  assert.ok(invitationCheckIdx >= 0 && signOutIdx >= 0);
  assert.ok(invitationCheckIdx < signOutIdx, 'signOut must be inside the invalid-invitation branch');
});

test('GET never calls acceptWorkforceEmployeeInvitation or the accept_employee_invitation RPC -- verification alone must never accept an invitation', () => {
  assert.ok(!/acceptWorkforceEmployeeInvitation\(/.test(BODY), 'no accept call in the executable code');
  assert.ok(!/\.rpc\(\s*'accept_employee_invitation'/.test(BODY), 'no direct RPC call in the executable code');
});

test('GET never redirects to /dashboard or any other authenticated page -- only /sign-in (error) or the password-setup screen', () => {
  assert.ok(/const SIGN_IN_ERROR_URL = '\/sign-in\?error=1';/.test(SOURCE), 'expected the sign-in error target to be a literal, checkable constant');
  // Scans the whole file (not just BODY) because the actual NextResponse.redirect(...)
  // call sites live in the errorRedirect() helper, defined above `GET` --
  // safe here since, unlike the ordering assertions above, no prose in this
  // file's doc comment contains the literal substring "NextResponse.redirect(".
  const redirectCalls = [...SOURCE.matchAll(/NextResponse\.redirect\(([^)]+)\)/g)].map((m) => m[1] ?? '');
  assert.ok(redirectCalls.length > 0, 'expected at least one redirect call to check');
  for (const call of redirectCalls) {
    assert.ok(!call.includes('/dashboard'), `redirect call must not target /dashboard: ${call}`);
  }
  assert.ok(redirectCalls.some((c) => c.includes('SIGN_IN_ERROR_URL')), 'expected an error redirect using the sign-in error constant');
  assert.ok(redirectCalls.some((c) => c.includes('/auth/accept-invite/set-password')), 'expected the success redirect to password setup');
});

test('ALLOWED_TOKEN_HASH_TYPES admits exactly `invite` and `recovery` -- Defect C\'s Manager-triggered recovery action is the only producer of a `recovery` token here, and this callback still independently re-validates the invitation before granting anything', () => {
  const setLiteralMatch = SOURCE.match(/ALLOWED_TOKEN_HASH_TYPES: ReadonlySet<string> = new Set\(\[([^\]]*)\]\)/);
  assert.ok(setLiteralMatch, 'expected to find the ALLOWED_TOKEN_HASH_TYPES literal');
  const members = setLiteralMatch![1]!.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(members, ['invite', 'recovery']);
});

test('route.ts references no service_role path', () => {
  assert.ok(!/service_role/i.test(SOURCE));
  assert.ok(!/createServiceClient/.test(SOURCE));
});
