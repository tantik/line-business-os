import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserFromClient } from './user.js';

function clientWithGetUser(response: unknown): SupabaseClient {
  return {
    auth: {
      getUser: async () => response,
    },
  } as unknown as SupabaseClient;
}

test('getUserFromClient returns the user on success', async () => {
  const user = { id: 'user-1', email: undefined };
  const client = clientWithGetUser({ data: { user }, error: null });
  const result = await getUserFromClient(client);
  assert.equal(result?.id, 'user-1');
});

test('getUserFromClient returns null when there is no user', async () => {
  const client = clientWithGetUser({ data: { user: null }, error: null });
  const result = await getUserFromClient(client);
  assert.equal(result, null);
});

test('getUserFromClient returns null on an auth error', async () => {
  const client = clientWithGetUser({
    data: { user: null },
    error: { name: 'AuthError', message: 'invalid token' },
  });
  const result = await getUserFromClient(client);
  assert.equal(result, null);
});
