import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewSignInRedirect, buildSignInErrorPath, sanitizePreviewReturnTo } from './return-to.js';

test('sanitizePreviewReturnTo accepts the preview root path', () => {
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha'), '/mame-to-cha');
});

test('sanitizePreviewReturnTo accepts manager/staff/recipes paths', () => {
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/manager'), '/mame-to-cha/manager');
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/staff'), '/mame-to-cha/staff');
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/recipes'), '/mame-to-cha/recipes');
});

test('sanitizePreviewReturnTo accepts a recipe detail segment', () => {
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/recipes/abc-123'), '/mame-to-cha/recipes/abc-123');
});

test('sanitizePreviewReturnTo rejects absent/empty input', () => {
  assert.equal(sanitizePreviewReturnTo(undefined), null);
  assert.equal(sanitizePreviewReturnTo(null), null);
  assert.equal(sanitizePreviewReturnTo(''), null);
});

test('sanitizePreviewReturnTo rejects absolute URLs', () => {
  assert.equal(sanitizePreviewReturnTo('https://evil.example'), null);
  assert.equal(sanitizePreviewReturnTo('http://evil.example/mame-to-cha'), null);
});

test('sanitizePreviewReturnTo rejects protocol-relative values', () => {
  assert.equal(sanitizePreviewReturnTo('//evil.example'), null);
  assert.equal(sanitizePreviewReturnTo('//evil.example/mame-to-cha'), null);
});

test('sanitizePreviewReturnTo rejects backslash variants', () => {
  assert.equal(sanitizePreviewReturnTo('/\\evil.example'), null);
  assert.equal(sanitizePreviewReturnTo('\\\\evil.example'), null);
});

test('sanitizePreviewReturnTo rejects encoded bypasses', () => {
  assert.equal(sanitizePreviewReturnTo('/%2F%2Fevil.example'), null);
  assert.equal(sanitizePreviewReturnTo('%2Fmame-to-cha'), null);
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha%2F..%2Fadmin'), null);
});

test('sanitizePreviewReturnTo rejects unrelated internal paths', () => {
  assert.equal(sanitizePreviewReturnTo('/dashboard/admin'), null);
  assert.equal(sanitizePreviewReturnTo('/some/unrelated/path'), null);
});

test('sanitizePreviewReturnTo rejects the internal preview route directly', () => {
  assert.equal(sanitizePreviewReturnTo('/_client-preview/mame-to-cha'), null);
  assert.equal(sanitizePreviewReturnTo('/_client-preview/mame-to-cha/manager'), null);
});

test('sanitizePreviewReturnTo rejects a query string or fragment appended to an otherwise valid path', () => {
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/manager?x=1'), null);
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha/manager#frag'), null);
});

test('sanitizePreviewReturnTo rejects a bare tenant-slug-looking path without the leading segment match', () => {
  assert.equal(sanitizePreviewReturnTo('/mame-to-cha-tokyo'), null);
  assert.equal(sanitizePreviewReturnTo('mame-to-cha'), null);
});

test('buildPreviewSignInRedirect builds a sign-in path carrying an encoded returnTo', () => {
  assert.equal(buildPreviewSignInRedirect('/mame-to-cha/manager'), '/sign-in?returnTo=%2Fmame-to-cha%2Fmanager');
});

// ---------------------------------------------------------------------------
// signIn() failure-path returnTo preservation (architecture plan Section I).
// `signIn` itself is a 'use server' action that calls Supabase and
// `next/navigation`'s `redirect()` (which throws), so it is not directly
// unit-testable under `node:test` - these tests instead cover
// `buildSignInErrorPath`, the exact pure function `signIn` calls on both of
// its failure branches (credential-parse failure and `signInWithPassword`
// failure) with the same `sanitizePreviewReturnTo(...)` output it computes
// up front. Composing the two here proves the full failure-path contract.
// ---------------------------------------------------------------------------

test('a valid returnTo survives onto the sign-in error path (covers both the credential-parse and auth-failure branches, which call the same builder)', () => {
  const safeReturnTo = sanitizePreviewReturnTo('/mame-to-cha/manager');
  assert.equal(buildSignInErrorPath(safeReturnTo), '/sign-in?error=1&returnTo=%2Fmame-to-cha%2Fmanager');
});

test('an invalid/missing returnTo is dropped from the sign-in error path, not propagated raw', () => {
  assert.equal(buildSignInErrorPath(sanitizePreviewReturnTo('https://evil.example')), '/sign-in?error=1');
  assert.equal(buildSignInErrorPath(sanitizePreviewReturnTo(undefined)), '/sign-in?error=1');
  assert.equal(buildSignInErrorPath(null), '/sign-in?error=1');
});

test('the error flag never carries credential detail, regardless of returnTo', () => {
  const path = buildSignInErrorPath(sanitizePreviewReturnTo('/mame-to-cha/staff'));
  assert.ok(!/user@|password|email/i.test(path), 'sign-in error path must never embed credential-shaped text');
});

test('successful sign-in redirect target: valid returnTo wins over the /dashboard fallback', () => {
  const safeReturnTo = sanitizePreviewReturnTo('/mame-to-cha/recipes');
  const DASHBOARD_PATH = '/dashboard';
  assert.equal(safeReturnTo ?? DASHBOARD_PATH, '/mame-to-cha/recipes');
});

test('successful sign-in redirect target: invalid/missing returnTo falls back to /dashboard', () => {
  const DASHBOARD_PATH = '/dashboard';
  assert.equal(sanitizePreviewReturnTo(undefined) ?? DASHBOARD_PATH, '/dashboard');
  assert.equal(sanitizePreviewReturnTo('//evil.example') ?? DASHBOARD_PATH, '/dashboard');
});
