import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideTenantInviteCallback,
  mapAcceptTenantInvitationError,
  partitionBannerInvitations,
  pickAcceptableInvitation,
  type PendingTenantInvitation,
} from './tenant-invite-decision.js';

function inv(id: string, createdAt: string, isExpired = false): PendingTenantInvitation {
  return { invitationId: id, tenantId: `t-${id}`, tenantName: `Cafe ${id}`, roleKey: 'tenant_owner', expiresAt: '2026-10-27T00:00:00Z', isExpired, createdAt };
}

test('pickAcceptableInvitation: oldest open one, never an expired one', () => {
  assert.equal(pickAcceptableInvitation([]), null);
  assert.equal(pickAcceptableInvitation([inv('a', '2026-10-01', true)]), null);
  assert.equal(pickAcceptableInvitation([inv('b', '2026-10-03'), inv('a', '2026-10-02'), inv('c', '2026-10-01', true)])?.invitationId, 'a');
});

test('callback: open invitation -> set password with its id', () => {
  assert.deepEqual(decideTenantInviteCallback({ status: 'success', data: [inv('a', '2026-10-01')] }), { kind: 'set_password', invitationId: 'a' });
});

test('callback: only expired -> owner_expired; none -> owner_none', () => {
  assert.deepEqual(decideTenantInviteCallback({ status: 'success', data: [inv('a', '2026-10-01', true)] }), { kind: 'invalid', reason: 'owner_expired' });
  assert.deepEqual(decideTenantInviteCallback({ status: 'success', data: [] }), { kind: 'invalid', reason: 'owner_none' });
});

test('callback: a read error keeps the session (the token is already used) and re-reads later', () => {
  assert.deepEqual(decideTenantInviteCallback({ status: 'error' }), { kind: 'set_password', invitationId: null });
});

test('accept error mapping never returns raw text', () => {
  assert.equal(mapAcceptTenantInvitationError({ code: 'P0001', message: 'invitation_not_acceptable' }), 'not_acceptable');
  assert.equal(mapAcceptTenantInvitationError({ code: '28000', message: 'x' }), 'unauthorized');
  assert.equal(mapAcceptTenantInvitationError({ code: '42501' }), 'unauthorized');
  assert.equal(mapAcceptTenantInvitationError({ code: 'XX000', message: 'boom' }), 'error');
});

test('banner partition: open sorted oldest first, expired only counted', () => {
  const out = partitionBannerInvitations([inv('b', '2026-10-03'), inv('x', '2026-09-01', true), inv('a', '2026-10-02')]);
  assert.deepEqual(out.open.map((r) => r.invitationId), ['a', 'b']);
  assert.equal(out.expiredCount, 1);
});
