import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLocationDbError,
  parseLocationBody,
  runPlatformLocation,
  type LocationCommand,
  type LocationDeps,
  type RpcResult,
} from './job.ts';

const REQUEST_ID = 'b1570000-0000-4000-8000-0000000000a1';
const ACTOR_ID = 'b1570000-0000-4000-8000-000000000001';
const TENANT_ID = 'b1570000-0000-4000-8000-0000000000f1';
const LOCATION_ID = 'b1570000-0000-4000-8000-0000000000c1';

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

function deps(rpcImpl: (fn: string, args: Record<string, unknown>) => RpcResult) {
  const calls: Call[] = [];
  const logs: Record<string, unknown>[] = [];
  const d: LocationDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return rpcImpl(fn, args);
    },
    log: (e) => logs.push(e),
  };
  return { d, calls, logs };
}

function run(d: LocationDeps, command: LocationCommand, actorId = ACTOR_ID) {
  return runPlatformLocation(d, { requestId: REQUEST_ID, actorId, command });
}

// --- body parsing -------------------------------------------------------------------------

test('parse: create with and without timezone (default Asia/Tokyo), ids lowercased', () => {
  const a = parseLocationBody({ request_id: REQUEST_ID.toUpperCase(), action: 'create', tenant_id: TENANT_ID.toUpperCase(), name: '駅前店' });
  assert.deepEqual(a, { ok: true, requestId: REQUEST_ID, command: { action: 'create', tenantId: TENANT_ID, name: '駅前店', timezone: 'Asia/Tokyo' } });
  const b = parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: 'X', timezone: ' UTC ' });
  assert.equal(b.ok && b.command.action === 'create' && b.command.timezone, 'UTC');
  const c = parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: 'X', timezone: '' });
  assert.equal(c.ok && c.command.action === 'create' && c.command.timezone, 'Asia/Tokyo');
});

test('parse: rename and set_active', () => {
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'rename', location_id: LOCATION_ID, name: '本店' }), {
    ok: true,
    requestId: REQUEST_ID,
    command: { action: 'rename', locationId: LOCATION_ID, name: '本店' },
  });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'set_active', location_id: LOCATION_ID, is_active: false }), {
    ok: true,
    requestId: REQUEST_ID,
    command: { action: 'set_active', locationId: LOCATION_ID, isActive: false },
  });
});

test('parse: an actor id, a source location or a key of another action is refused (unknown_field)', () => {
  for (const extra of [{ actor_id: ACTOR_ID }, { p_actor_id: ACTOR_ID }, { source_location_id: LOCATION_ID }, { location_id: LOCATION_ID }, { is_active: true }]) {
    assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: 'X', ...extra }), { ok: false, error: 'unknown_field' });
  }
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'rename', location_id: LOCATION_ID, name: 'X', tenant_id: TENANT_ID }), { ok: false, error: 'unknown_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'set_active', location_id: LOCATION_ID, is_active: true, name: 'X' }), { ok: false, error: 'unknown_field' });
});

test('parse: shape errors', () => {
  assert.deepEqual(parseLocationBody(null), { ok: false, error: 'invalid_body' });
  assert.deepEqual(parseLocationBody([]), { ok: false, error: 'invalid_body' });
  assert.deepEqual(parseLocationBody({ action: 'create' }), { ok: false, error: 'invalid_request_id' });
  assert.deepEqual(parseLocationBody({ request_id: 'nope', action: 'create' }), { ok: false, error: 'invalid_request_id' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'delete' }), { ok: false, error: 'invalid_action' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID }), { ok: false, error: 'invalid_action' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: 'x', name: 'X' }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: '' }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: 'x'.repeat(401) }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'create', tenant_id: TENANT_ID, name: 'X', timezone: 9 }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'rename', location_id: LOCATION_ID, name: 5 }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'set_active', location_id: LOCATION_ID, is_active: 'false' }), { ok: false, error: 'invalid_field' });
  assert.deepEqual(parseLocationBody({ request_id: REQUEST_ID, action: 'set_active', location_id: LOCATION_ID }), { ok: false, error: 'invalid_field' });
});

// --- DB error mapping ---------------------------------------------------------------------

test('classify: every 0151 refusal maps to a stable code and status', () => {
  const cases: [{ code?: string; message?: string }, string, number][] = [
    [{ code: '42501', message: 'actor_not_platform_staff' }, 'not_platform_staff', 403],
    [{ code: 'P0001', message: 'location_limit_reached' }, 'location_limit_reached', 409],
    [{ code: 'P0001', message: 'location_name_taken' }, 'location_name_taken', 409],
    [{ code: 'P0001', message: 'last_active_location' }, 'last_active_location', 409],
    [{ code: 'P0001', message: 'location_has_active_staff' }, 'location_has_active_staff', 409],
    [{ code: 'P0001', message: 'tenant_not_active' }, 'tenant_not_active', 409],
    [{ code: 'P0001', message: 'location_not_found' }, 'location_not_found', 404],
    [{ code: 'P0001', message: 'invalid_location_name' }, 'invalid_location_name', 422],
    [{ code: 'P0001', message: 'invalid_timezone' }, 'invalid_timezone', 422],
    [{ code: '22004', message: 'invalid_argument: tenant_id, name, timezone and actor are required' }, 'invalid_argument', 422],
    [{ code: 'XX000', message: 'something internal' }, 'db_error', 500],
    [{}, 'db_error', 500],
  ];
  for (const [error, code, httpStatus] of cases) assert.deepEqual(classifyLocationDbError(error), { code, httpStatus }, JSON.stringify(error));
});

// --- orchestration ------------------------------------------------------------------------

test('create: calls api.platform_create_location with the verified actor and a NULL source', async () => {
  const { d, calls, logs } = deps(() => ({ data: { location_id: LOCATION_ID, tenant_id: TENANT_ID, counts: {} }, error: null }));
  const out = await run(d, { action: 'create', tenantId: TENANT_ID, name: '駅前店', timezone: 'Asia/Tokyo' });
  assert.equal(out.httpStatus, 200);
  assert.deepEqual(out.body, { request_id: REQUEST_ID, action: 'create', location_id: LOCATION_ID, tenant_id: TENANT_ID, changed: true });
  assert.deepEqual(calls, [
    {
      fn: 'platform_create_location',
      args: { p_tenant_id: TENANT_ID, p_name: '駅前店', p_timezone: 'Asia/Tokyo', p_source_location_id: null, p_actor_id: ACTOR_ID },
    },
  ]);
  assert.ok(!JSON.stringify(logs).includes('駅前店'), 'the store name is never logged');
});

test('rename and set_active pass the DB answer through (changed / is_active)', async () => {
  const r = deps(() => ({ data: { location_id: LOCATION_ID, changed: false }, error: null }));
  const renamed = await run(r.d, { action: 'rename', locationId: LOCATION_ID, name: '本店' });
  assert.deepEqual(renamed, { httpStatus: 200, body: { request_id: REQUEST_ID, action: 'rename', location_id: LOCATION_ID, changed: false } });
  assert.deepEqual(r.calls[0], { fn: 'platform_rename_location', args: { p_location_id: LOCATION_ID, p_name: '本店', p_actor_id: ACTOR_ID } });

  const s = deps(() => ({ data: { location_id: LOCATION_ID, is_active: false, changed: true }, error: null }));
  const archived = await run(s.d, { action: 'set_active', locationId: LOCATION_ID, isActive: false });
  assert.deepEqual(archived, {
    httpStatus: 200,
    body: { request_id: REQUEST_ID, action: 'set_active', location_id: LOCATION_ID, is_active: false, changed: true },
  });
  assert.deepEqual(s.calls[0], { fn: 'platform_set_location_active', args: { p_location_id: LOCATION_ID, p_is_active: false, p_actor_id: ACTOR_ID } });
});

test('a DB refusal returns only the machine code -- never the raw message', async () => {
  const { d, logs } = deps(() => ({ data: null, error: { code: 'P0001', message: 'location_has_active_staff (internal detail)' } }));
  const out = await run(d, { action: 'set_active', locationId: LOCATION_ID, isActive: false });
  assert.deepEqual(out, { httpStatus: 409, body: { error: 'location_has_active_staff', request_id: REQUEST_ID, action: 'set_active' } });
  assert.ok(!JSON.stringify(out).includes('internal detail'));
  assert.ok(!JSON.stringify(logs).includes('internal detail'));
});

test('an unreadable DB result is a 500 unexpected_result', async () => {
  const { d } = deps(() => ({ data: null, error: null }));
  const out = await run(d, { action: 'rename', locationId: LOCATION_ID, name: 'X' });
  assert.deepEqual(out, { httpStatus: 500, body: { error: 'unexpected_result', request_id: REQUEST_ID, action: 'rename' } });
});

test('an invalid actor id never reaches the DB (401)', async () => {
  const { d, calls } = deps(() => ({ data: null, error: null }));
  const out = await run(d, { action: 'rename', locationId: LOCATION_ID, name: 'X' }, 'not-a-uuid');
  assert.equal(out.httpStatus, 401);
  assert.equal(calls.length, 0);
});
