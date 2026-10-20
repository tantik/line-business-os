import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableStatus, mapProvisionResponse } from './provision-outcome.js';

const REQ = '11111111-2222-4333-8444-555555555555';
const TENANT = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';

test('success: invite sent to a new user vs an existing account', () => {
  const fresh = mapProvisionResponse(200, { status: 'invite_sent', tenant_id: TENANT, outcome: 'invited_new_user' }, REQ);
  assert.equal(fresh.kind, 'invited');
  assert.equal(fresh.tenantId, TENANT.toLowerCase());
  const existing = mapProvisionResponse(200, { status: 'invite_sent', tenant_id: TENANT, outcome: 'invited_existing_user_no_email' }, REQ);
  assert.equal(existing.kind, 'invited_existing');
});

test('replay of a finished request is already_done', () => {
  assert.equal(mapProvisionResponse(200, { status: 'ready', outcome: 'already_done' }, REQ).kind, 'already_done');
});

test('pre-write refusals: no retry flag except rate limit; mismatch needs a new request', () => {
  assert.equal(mapProvisionResponse(400, { error: 'invalid_input' }, REQ).kind, 'invalid_input');
  assert.equal(mapProvisionResponse(409, { error: 'slug_taken' }, REQ).kind, 'slug_taken');
  const mismatch = mapProvisionResponse(409, { error: 'request_slug_mismatch' }, REQ);
  assert.equal(mismatch.kind, 'request_mismatch');
  assert.equal(mismatch.needsNewRequest, true);
  const limited = mapProvisionResponse(429, { error: 'rate_limited' }, REQ);
  assert.equal(limited.retryable, true);
  assert.equal(mapProvisionResponse(403, { error: 'not_platform_staff' }, REQ).kind, 'not_staff');
});

test('DB failure and invite failure are retryable with the same request_id', () => {
  const db = mapProvisionResponse(500, { error: 'db_error', status: 'failed_db' }, REQ);
  assert.equal(db.kind, 'failed_db');
  assert.equal(db.retryable, true);
  assert.equal(db.needsNewRequest, false);
  const invite = mapProvisionResponse(502, { error: 'auth_invite_failed', status: 'invite_failed', tenant_id: TENANT }, REQ);
  assert.equal(invite.kind, 'invite_failed');
  assert.equal(invite.retryable, true);
});

test('owner invitation conflicts need an operator, not a blind retry', () => {
  const blocked = mapProvisionResponse(409, { error: 'owner_invitation_conflict', status: 'invite_failed', tenant_id: TENANT }, REQ);
  assert.equal(blocked.kind, 'invite_blocked');
  assert.equal(blocked.retryable, false);
});

test('network failure / not deployed -> unavailable (retryable)', () => {
  assert.equal(mapProvisionResponse(null, null, REQ).kind, 'unavailable');
  assert.equal(mapProvisionResponse(404, null, REQ).kind, 'unavailable');
});

test('free text never passes through: a non-code error string is dropped', () => {
  const out = mapProvisionResponse(500, { error: 'Owner taro@example.com failed', status: 'nope' }, REQ);
  assert.equal(out.errorCode, null);
  assert.equal(out.status, null);
  assert.equal(out.kind, 'error');
});

test('isRetryableStatus: only failed_db and invite_failed', () => {
  assert.equal(isRetryableStatus('failed_db'), true);
  assert.equal(isRetryableStatus('invite_failed'), true);
  for (const s of ['requested', 'db_done', 'invite_sent', 'ready', null]) assert.equal(isRetryableStatus(s), false);
});
