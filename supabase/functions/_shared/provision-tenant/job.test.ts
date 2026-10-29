import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProvisionDbError,
  parseProvisionBody,
  resolveOwnerAuthUser,
  runProvisionTenant,
  type AdminUser,
  type AuthAdmin,
  type ProvisionDeps,
  type RpcResult,
} from './job.ts';

const REQUEST_ID = 'b1340000-0000-4000-8000-0000000000a1';
const ACTOR_ID = 'b1340000-0000-4000-8000-000000000001';
const TENANT_ID = 'b1340000-0000-4000-8000-0000000000f1';
const OWNER_ID = 'b1340000-0000-4000-8000-000000000010';
const EMAIL = 'owner@example.com';

const INPUT = { businessName: 'Sample Cafe', tenantSlug: 'sample-cafe', locationName: '本店', ownerEmail: ' Owner@Example.com ' };

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

function fakeAuth(opts: { registered?: AdminUser[]; inviteError?: string; listError?: boolean } = {}) {
  const calls: { invite: { email: string; redirectTo: string; data?: Record<string, unknown> }[]; list: number } = { invite: [], list: 0 };
  const admin: AuthAdmin = {
    async inviteUserByEmail(email, options) {
      calls.invite.push({ email, redirectTo: options.redirectTo, data: options.data });
      if (opts.inviteError) return { data: null, error: { message: opts.inviteError } };
      if (opts.registered?.some((u) => u.email === email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
      return { data: { user: { id: OWNER_ID, email } }, error: null };
    },
    async listUsers() {
      calls.list += 1;
      if (opts.listError) return { data: null, error: { message: 'boom' } };
      return { data: { users: opts.registered ?? [] }, error: null };
    },
  };
  return { admin, calls };
}

function deps(rpcImpl: (fn: string, args: Record<string, unknown>) => RpcResult, auth = fakeAuth()) {
  const calls: Call[] = [];
  const logs: Record<string, unknown>[] = [];
  const d: ProvisionDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return rpcImpl(fn, args);
    },
    authAdmin: auth.admin,
    protectEmail: async (email) => ({ emailEncryptedBytea: '\\xabcdef', emailHash: `hash-of-${email.trim().toLowerCase().length}` }),
    ownerRedirectTo: 'https://app.example/auth/accept-invite?flow=tenant_invite',
    log: (e) => logs.push(e),
  };
  return { d, calls, logs, auth };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });
const fail = (code: string, message: string): RpcResult => ({ data: null, error: { code, message } });

function happyRpc(status = 'db_done') {
  return (fn: string): RpcResult => {
    if (fn === 'provision_tenant') return ok({ status, tenant_id: TENANT_ID, idempotent: status !== 'db_done' });
    if (fn === 'create_tenant_owner_invitation') return ok({ invitation_id: 'inv-1', expires_at: '2026-10-27T00:00:00Z', status: 'invite_sent' });
    if (fn === 'set_provisioning_status') return ok({ status: 'invite_failed', tenant_id: TENANT_ID });
    if (fn === 'mark_provisioning_failed') return ok({ status: 'failed_db', tenant_id: null });
    throw new Error(`unexpected rpc ${fn}`);
  };
}

const noPii = (value: unknown) => {
  const text = JSON.stringify(value).toLowerCase();
  assert.ok(!text.includes('owner@example.com'), `leaked email: ${text}`);
  assert.ok(!text.includes('sample cafe'), `leaked business name: ${text}`);
  assert.ok(!text.includes('本店'), `leaked location name: ${text}`);
};

test('parseProvisionBody: only request_id + input; an actor id in the body is refused', () => {
  assert.deepEqual(parseProvisionBody({ request_id: REQUEST_ID.toUpperCase(), input: INPUT }), { ok: true, requestId: REQUEST_ID, input: INPUT });
  assert.deepEqual(parseProvisionBody({ request_id: REQUEST_ID, input: INPUT, actor_id: ACTOR_ID }), { ok: false, error: 'unknown_field' });
  assert.deepEqual(parseProvisionBody({ request_id: REQUEST_ID, input: INPUT, p_actor_id: ACTOR_ID }), { ok: false, error: 'unknown_field' });
  assert.deepEqual(parseProvisionBody({ request_id: 'nope', input: INPUT }), { ok: false, error: 'invalid_request_id' });
  for (const b of [null, [], 'x']) assert.deepEqual(parseProvisionBody(b), { ok: false, error: 'invalid_body' });
});

test('happy path: provision -> protect email -> invite -> owner invitation; actor = the verified caller', async () => {
  const { d, calls, logs, auth } = deps(happyRpc());
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 200);
  assert.deepEqual(out.body, {
    status: 'invite_sent', tenant_id: TENANT_ID, request_id: REQUEST_ID, invitation_id: 'inv-1',
    expires_at: '2026-10-27T00:00:00Z', outcome: 'invited_new_user', idempotent: false,
  });
  assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant', 'create_tenant_owner_invitation']);
  const prov = calls[0]!.args;
  assert.equal(prov.p_request_id, REQUEST_ID);
  assert.equal(prov.p_actor_id, ACTOR_ID);
  const payload = prov.p_payload as Record<string, unknown>;
  assert.equal(payload.slug, 'sample-cafe');
  assert.equal(payload.package_code, 'cafe');
  assert.doesNotMatch(JSON.stringify(payload), /example\.com|owner/i, 'payload carries no owner identity');
  const inv = calls[1]!.args;
  assert.deepEqual(
    [inv.p_request_id, inv.p_tenant_id, inv.p_target_user_id, inv.p_email_encrypted, inv.p_actor_id],
    [REQUEST_ID, TENANT_ID, OWNER_ID, '\\xabcdef', ACTOR_ID],
  );
  assert.deepEqual(auth.calls.invite, [
    { email: EMAIL, redirectTo: 'https://app.example/auth/accept-invite?flow=tenant_invite', data: { invite_kind: 'tenant_owner' } },
  ]);
  noPii(out.body);
  noPii(logs);
});

test('invalid input -> 400 before any RPC; errors never echo the email', async () => {
  const { d, calls } = deps(happyRpc());
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: { ...INPUT, ownerEmail: 'broken@', tenantSlug: 'admin' } });
  assert.equal(out.httpStatus, 400);
  assert.equal(out.body.error, 'invalid_input');
  assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify(out.body).includes('broken@'));
  const extra = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: { ...INPUT, payload: { slug: 'x' } } });
  assert.equal(extra.httpStatus, 400);
});

test('a non-UUID actor never reaches the DB', async () => {
  const { d, calls } = deps(happyRpc());
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: 'not-a-uuid', input: INPUT });
  assert.equal(out.httpStatus, 401);
  assert.equal(calls.length, 0);
});

test('DB failure after validation -> mark_provisioning_failed with the SAME request_id, slug and a machine code', async () => {
  const { d, calls, logs } = deps((fn) => (fn === 'provision_tenant' ? fail('23514', 'new row violates check constraint "x" -- Sample Cafe') : happyRpc()(fn)));
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 500);
  assert.deepEqual(out.body, { error: 'db_error', request_id: REQUEST_ID, status: 'failed_db' });
  assert.deepEqual(calls[1], {
    fn: 'mark_provisioning_failed',
    args: { p_request_id: REQUEST_ID, p_slug: 'sample-cafe', p_error_code: 'db_error', p_actor_id: ACTOR_ID },
  });
  noPii(out.body);
  noPii(logs);
});

test('refusals before any write (not staff, slug taken, mismatch, rate limit) record nothing', async () => {
  const cases: [RpcResult, string, number][] = [
    [fail('42501', 'actor_not_platform_staff'), 'not_platform_staff', 403],
    [fail('P0001', 'slug_taken'), 'slug_taken', 409],
    [fail('P0001', 'request_slug_mismatch'), 'request_slug_mismatch', 409],
    [fail('P0001', 'rate_limited'), 'rate_limited', 429],
  ];
  for (const [err, code, http] of cases) {
    const { d, calls } = deps((fn) => (fn === 'provision_tenant' ? err : happyRpc()(fn)));
    const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
    assert.equal(out.httpStatus, http, code);
    assert.equal(out.body.error, code);
    assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant'], `${code}: no failure record`);
  }
  assert.deepEqual(classifyProvisionDbError({ code: '22023', message: 'invalid_payload: plan.code unknown' }), { code: 'invalid_payload', httpStatus: 422, record: true });
});

test('Auth invite failure -> set_provisioning_status(invite_failed) with the same request_id; no invitation row', async () => {
  const auth = fakeAuth({ inviteError: 'SMTP down for owner@example.com' });
  const { d, calls, logs } = deps(happyRpc(), auth);
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 502);
  assert.deepEqual(out.body, { error: 'auth_invite_failed', status: 'invite_failed', tenant_id: TENANT_ID, request_id: REQUEST_ID });
  assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant', 'set_provisioning_status']);
  assert.deepEqual(calls[1]!.args, { p_request_id: REQUEST_ID, p_status: 'invite_failed', p_error_code: 'auth_invite_failed', p_actor_id: ACTOR_ID });
  noPii(out.body);
  noPii(logs);
});

test('retry of an invite_failed request (same request_id) re-runs only the invite', async () => {
  const { d, calls } = deps(happyRpc('invite_failed'));
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 200);
  assert.equal(out.body.status, 'invite_sent');
  assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant', 'create_tenant_owner_invitation']);
  assert.equal(calls[0]!.args.p_request_id, REQUEST_ID);
});

test('replay of an invite_sent / ready request is a no-op (no email, no invitation write)', async () => {
  for (const status of ['invite_sent', 'ready']) {
    const auth = fakeAuth();
    const { d, calls } = deps(happyRpc(status), auth);
    const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
    assert.equal(out.httpStatus, 200);
    assert.deepEqual(out.body, { status, tenant_id: TENANT_ID, request_id: REQUEST_ID, outcome: 'already_done', idempotent: true });
    assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant']);
    assert.equal(auth.calls.invite.length, 0);
  }
});

test('already-registered Owner: found via listUsers, no new email, invitation still created', async () => {
  const auth = fakeAuth({ registered: [{ id: 'someone-else', email: 'x@example.com' }, { id: OWNER_ID, email: EMAIL }] });
  const { d, calls } = deps(happyRpc(), auth);
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 200);
  assert.equal(out.body.outcome, 'invited_existing_user_no_email');
  assert.equal(auth.calls.list, 1);
  assert.equal(calls.find((c) => c.fn === 'create_tenant_owner_invitation')!.args.p_target_user_id, OWNER_ID);
});

test('protect-email failure stops before the Auth call (no email without a row)', async () => {
  const auth = fakeAuth();
  const { d, calls } = deps(happyRpc(), auth);
  d.protectEmail = async () => {
    throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes');
  };
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 500);
  assert.equal(out.body.error, 'pii_protect_failed');
  assert.equal(auth.calls.invite.length, 0);
  assert.deepEqual(calls.map((c) => c.fn), ['provision_tenant', 'set_provisioning_status']);
});

test('invitation write conflict -> invite_failed with a machine code', async () => {
  const { d, calls } = deps((fn) => (fn === 'create_tenant_owner_invitation' ? fail('P0001', 'owner_invitation_conflict') : happyRpc()(fn)));
  const out = await runProvisionTenant(d, { requestId: REQUEST_ID, actorId: ACTOR_ID, input: INPUT });
  assert.equal(out.httpStatus, 409);
  assert.equal(out.body.error, 'owner_invitation_conflict');
  assert.equal(calls.at(-1)!.args.p_error_code, 'owner_invitation_conflict');
});

test('listUsers failure / user not found -> machine codes', async () => {
  await assert.rejects(() => resolveOwnerAuthUser(fakeAuth({ registered: [{ id: OWNER_ID, email: EMAIL }], listError: true }).admin, EMAIL, 'x'), /auth_list_failed/);
  const ghost = fakeAuth({ inviteError: 'User already registered' });
  await assert.rejects(() => resolveOwnerAuthUser(ghost.admin, EMAIL, 'x'), /auth_existing_user_not_found/);
});
