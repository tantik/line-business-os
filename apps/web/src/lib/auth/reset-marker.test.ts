import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResetMarker, verifyResetMarker } from './reset-marker';

const SECRET = 'test-secret-at-least-16-chars';
const NOW = 1_800_000_000;
const ok = { userId: 'user-a', sessionId: 'sess-1', now: NOW };

test('a marker minted by the callback verifies for the same user + session before expiry', () => {
  const m = createResetMarker(SECRET, 'user-a', 'sess-1', NOW + 900);
  assert.equal(verifyResetMarker(SECRET, m, ok), true);
});

test('the old forgeable form (bare user id) and any unsigned value are rejected', () => {
  assert.equal(verifyResetMarker(SECRET, 'user-a', ok), false);
  assert.equal(verifyResetMarker(SECRET, `v1.user-a.sess-1.${NOW + 900}.AAAA`, ok), false);
});

test('a stolen LINE session (different session id) cannot reuse or rebind a marker', () => {
  const m = createResetMarker(SECRET, 'user-a', 'sess-1', NOW + 900);
  assert.equal(verifyResetMarker(SECRET, m, { ...ok, sessionId: 'sess-liff' }), false);
  const rebound = m.replace('.sess-1.', '.sess-liff.');
  assert.equal(verifyResetMarker(SECRET, rebound, { ...ok, sessionId: 'sess-liff' }), false);
});

test('another user, an expired marker, or another secret are rejected', () => {
  const m = createResetMarker(SECRET, 'user-a', 'sess-1', NOW + 900);
  assert.equal(verifyResetMarker(SECRET, m, { ...ok, userId: 'user-b' }), false);
  assert.equal(verifyResetMarker(SECRET, m, { ...ok, now: NOW + 901 }), false);
  assert.equal(verifyResetMarker('another-secret-0123456789', m, ok), false);
  const extended = m.replace(`.${NOW + 900}.`, `.${NOW + 99999}.`);
  assert.equal(verifyResetMarker(SECRET, extended, { ...ok, now: NOW + 1000 }), false);
});
