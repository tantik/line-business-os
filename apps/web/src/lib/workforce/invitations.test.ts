import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptWorkforceEmployeeInvitation,
  getWorkforceEmployeeInvitationById,
  inviteOrResendWorkforceEmployee,
  listMyPendingWorkforceInvitations,
  listWorkforceEmployeeInvitations,
  revokeWorkforceEmployeeInvitation,
} from './invitations.js';
import { recordingClient } from './test-helpers.js';

const TENANT_ID = 'tenant-a';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test-value';

test('listWorkforceEmployeeInvitations maps rows and derives isExpired', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const { client, calls } = recordingClient({
    data: [
      {
        invitation_id: 'inv-1', tenant_id: TENANT_ID, employee_id: 'e1', status: 'pending',
        created_at: '2026-01-01', updated_at: '2026-01-01', expires_at: future, accepted_at: null, revoked_at: null,
      },
      {
        invitation_id: 'inv-2', tenant_id: TENANT_ID, employee_id: 'e2', status: 'pending',
        created_at: '2026-01-01', updated_at: '2026-01-01', expires_at: past, accepted_at: null, revoked_at: null,
      },
    ],
    error: null,
  });

  const result = await listWorkforceEmployeeInvitations(client, TENANT_ID);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data[0]!.isExpired, false);
    assert.equal(result.data[1]!.isExpired, true);
  }
  assert.deepEqual(calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(calls[1], { method: 'from', args: ['workforce_employee_invitations'] });
});

test('listWorkforceEmployeeInvitations maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await listWorkforceEmployeeInvitations(client, TENANT_ID);
  assert.equal(result.status, 'unauthorized');
});

test('listMyPendingWorkforceInvitations filters out expired rows client-side', async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const { client } = recordingClient({
    data: [
      { invitation_id: 'inv-1', tenant_id: TENANT_ID, employee_id: 'e1', status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-01', expires_at: future, accepted_at: null, revoked_at: null },
      { invitation_id: 'inv-2', tenant_id: TENANT_ID, employee_id: 'e2', status: 'pending', created_at: '2026-01-01', updated_at: '2026-01-01', expires_at: past, accepted_at: null, revoked_at: null },
    ],
    error: null,
  });

  const result = await listMyPendingWorkforceInvitations(client);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data.map((i) => i.invitationId), ['inv-1']);
  }
});

/**
 * Regression guard (0069): this read must go through the
 * `my_pending_employee_invitations` RPC -- which unconditionally filters by
 * `core.current_user_id()` server-side -- and never back to a bare
 * `.from('workforce_employee_invitations').select(...).eq('status', ...)`
 * read, which relied entirely on RLS and leaked other identities' pending
 * invitations to any Manager caller (wf_employee_invitations_manager_read/
 * _self_read are OR'd, not AND'd).
 */
test('listMyPendingWorkforceInvitations calls api.my_pending_employee_invitations, not a bare status-filtered select', async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  await listMyPendingWorkforceInvitations(client);
  assert.deepEqual(calls[0], { method: 'schema', args: ['api'] });
  assert.deepEqual(calls[1], { method: 'rpc', args: ['my_pending_employee_invitations'] });
  assert.ok(!calls.some((c) => c.method === 'from'), 'must not read the table/view directly');
});

test('revokeWorkforceEmployeeInvitation updates status/revoked_at and narrows by invitation_id', async () => {
  const { client, calls } = recordingClient({ data: { invitation_id: 'inv-1' }, error: null });
  const result = await revokeWorkforceEmployeeInvitation(client, 'inv-1');
  assert.equal(result.status, 'success');
  const updateCall = calls.find((c) => c.method === 'update');
  assert.ok(updateCall);
  assert.equal((updateCall!.args[0] as { status: string }).status, 'revoked');
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'invitation_id' && c.args[1] === 'inv-1'));
});

test('revokeWorkforceEmployeeInvitation returns not_found when RLS/filter matches zero rows', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await revokeWorkforceEmployeeInvitation(client, 'inv-missing');
  assert.equal(result.status, 'not_found');
});

test('acceptWorkforceEmployeeInvitation calls api.accept_employee_invitation and maps the result', async () => {
  const { client, calls } = recordingClient({ data: { out_tenant_id: 't1', out_employee_id: 'e1' }, error: null });
  const result = await acceptWorkforceEmployeeInvitation(client, 'inv-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(result.data, { tenantId: 't1', employeeId: 'e1' });
  }
  assert.deepEqual(calls[1], { method: 'rpc', args: ['accept_employee_invitation', { p_invitation_id: 'inv-1' }] });
});

test('acceptWorkforceEmployeeInvitation returns not_found for a zero-row RPC result', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await acceptWorkforceEmployeeInvitation(client, 'inv-missing');
  assert.equal(result.status, 'not_found');
});

test('getWorkforceEmployeeInvitationById narrows by invitation_id and maps a found row', async () => {
  const { client, calls } = recordingClient({
    data: {
      invitation_id: 'inv-1', tenant_id: TENANT_ID, employee_id: 'e1', status: 'pending',
      created_at: '2026-01-01', updated_at: '2026-01-01', expires_at: '2099-01-01', accepted_at: null, revoked_at: null,
    },
    error: null,
  });
  const result = await getWorkforceEmployeeInvitationById(client, 'inv-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.ok(result.data);
    assert.equal(result.data!.status, 'pending');
    assert.equal(result.data!.isExpired, false);
  }
  assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'invitation_id' && c.args[1] === 'inv-1'));
});

test('getWorkforceEmployeeInvitationById returns null (not an error) when RLS/filter matches zero rows -- covers both "no such invitation" and "not this caller\'s"', async () => {
  const { client } = recordingClient({ data: null, error: null });
  const result = await getWorkforceEmployeeInvitationById(client, 'inv-not-mine');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data, null);
  }
});

test('getWorkforceEmployeeInvitationById maps a permission-denied error to unauthorized', async () => {
  const { client } = recordingClient({ data: null, error: { code: '42501', message: 'permission denied' } });
  const result = await getWorkforceEmployeeInvitationById(client, 'inv-1');
  assert.equal(result.status, 'unauthorized');
});

test('inviteOrResendWorkforceEmployee forwards the caller access token and maps a successful outcome', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ outcome: 'invited_new_user', invitationId: 'inv-1', expiresAt: '2026-01-08' }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await inviteOrResendWorkforceEmployee('caller-access-token', TENANT_ID, 'e1');
    assert.equal(result.status, 'success');
    if (result.status === 'success') {
      assert.equal(result.data.outcome, 'invited_new_user');
    }
    assert.equal(capturedUrl, 'https://example.supabase.co/functions/v1/invite-employee');
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer caller-access-token');
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { tenantId: TENANT_ID, employeeId: 'e1' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inviteOrResendWorkforceEmployee maps not_authorized to unauthorized without leaking Edge Function internals', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'not_authorized' }), { status: 403 })) as typeof fetch;
  try {
    const result = await inviteOrResendWorkforceEmployee('token', TENANT_ID, 'e1');
    assert.equal(result.status, 'unauthorized');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inviteOrResendWorkforceEmployee maps employee_already_bound to duplicate', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'employee_already_bound' }), { status: 409 })) as typeof fetch;
  try {
    const result = await inviteOrResendWorkforceEmployee('token', TENANT_ID, 'e1');
    assert.equal(result.status, 'duplicate');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inviteOrResendWorkforceEmployee(action: "recover") forwards action in the request body and maps recovery_email_sent', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ outcome: 'recovery_email_sent', invitationId: 'inv-1', expiresAt: '2026-01-08' }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await inviteOrResendWorkforceEmployee('token', TENANT_ID, 'e1', 'recover');
    assert.equal(result.status, 'success');
    if (result.status === 'success') {
      assert.equal(result.data.outcome, 'recovery_email_sent');
    }
    assert.deepEqual(JSON.parse(capturedInit?.body as string), { tenantId: TENANT_ID, employeeId: 'e1', action: 'recover' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inviteOrResendWorkforceEmployee maps employee_not_yet_invited to a clear unexpected_error message, not a generic one', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'employee_not_yet_invited' }), { status: 409 })) as typeof fetch;
  try {
    const result = await inviteOrResendWorkforceEmployee('token', TENANT_ID, 'e1', 'recover');
    assert.equal(result.status, 'unexpected_error');
    if (result.status === 'unexpected_error') {
      assert.match(result.message, /never been invited/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
