import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMyAccess } from './my-access';
import { getVerifiedUserId } from './user';

function rpcClient(result: { data?: unknown; error?: unknown } | (() => never), calls: unknown[] = []): SupabaseClient {
  return {
    schema: (schema: string) => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ schema, fn, args });
        if (typeof result === 'function') return result();
        return { data: result.data ?? null, error: result.error ?? null };
      },
    }),
  } as unknown as SupabaseClient;
}

test('loadMyAccess sends one api.my_access call with every list', async () => {
  const calls: unknown[] = [];
  await loadMyAccess(rpcClient({ data: {} }, calls), 't1', 'l1', { location: ['a'], tenant: ['b'], anyLocation: ['c'] });
  assert.deepEqual(calls, [
    {
      schema: 'api',
      fn: 'my_access',
      args: { p_tenant_id: 't1', p_location_id: 'l1', p_location_permissions: ['a'], p_tenant_permissions: ['b'], p_any_location_permissions: ['c'] },
    },
  ]);
});

test('loadMyAccess reads only literal true, per group', async () => {
  const access = await loadMyAccess(
    rpcClient({ data: { location: { a: true, x: 'true' }, tenant: { b: false }, anyLocation: { c: true }, isTenantOwner: true } }),
    't1',
    'l1',
    { location: ['a', 'x'], tenant: ['b'], anyLocation: ['c'] },
  );
  assert.equal(access.location('a'), true);
  assert.equal(access.location('x'), false, 'a non-boolean is not a grant');
  assert.equal(access.tenant('b'), false);
  assert.equal(access.anyLocation('c'), true);
  assert.equal(access.location('c'), false, 'groups are not mixed');
  assert.equal(access.location('toString'), false, 'prototype keys are never grants');
  assert.equal(access.isTenantOwner, true);
});

test('loadMyAccess fails closed on an RPC error, a bad shape, or a throw', async () => {
  for (const client of [
    rpcClient({ error: { message: 'boom' }, data: { location: { a: true }, isTenantOwner: true } }),
    rpcClient({ data: 'yes' }),
    rpcClient(() => {
      throw new Error('network');
    }),
  ]) {
    const access = await loadMyAccess(client, 't1', 'l1', { location: ['a'] });
    assert.equal(access.location('a'), false);
    assert.equal(access.isTenantOwner, false);
  }
});

function claimsClient(result: { data?: unknown; error?: unknown } | (() => never)): SupabaseClient {
  return {
    auth: {
      getClaims: async () => (typeof result === 'function' ? result() : { data: result.data ?? null, error: result.error ?? null }),
    },
  } as unknown as SupabaseClient;
}

test('getVerifiedUserId returns the verified sub, else null', async () => {
  assert.equal(await getVerifiedUserId(claimsClient({ data: { claims: { sub: 'u1' } } })), 'u1');
  assert.equal(await getVerifiedUserId(claimsClient({ data: { claims: { sub: 'u1' } }, error: { message: 'bad sig' } })), null);
  assert.equal(await getVerifiedUserId(claimsClient({ data: { claims: {} } })), null);
  assert.equal(await getVerifiedUserId(claimsClient({ data: null })), null);
  assert.equal(
    await getVerifiedUserId(
      claimsClient(() => {
        throw new Error('jwks fetch failed');
      }),
    ),
    null,
  );
});
