import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');
const fn = (name: string) => {
  const start = SOURCE.indexOf(`export async function ${name}`);
  const rest = SOURCE.slice(start);
  return rest.slice(0, rest.search(/\r?\n\}\r?\n/) + 3);
};

test('changePassword re-checks the current password for the signed-in user before updateUser', () => {
  const body = fn('changePassword');
  const userIdx = body.indexOf('supabase.auth.getUser()');
  const reauthIdx = body.indexOf('supabase.auth.signInWithPassword({ email, password: current })');
  const wrongIdx = body.indexOf("if (reauthError) return { status: 'wrong_current' };");
  const updateIdx = body.indexOf('supabase.auth.updateUser({ password: next })');
  assert.ok(userIdx >= 0 && reauthIdx > userIdx && wrongIdx > reauthIdx && updateIdx > wrongIdx);
  assert.ok(body.indexOf("signOut({ scope: 'others' })") > updateIdx, 'other sessions signed out after the change');
  assert.ok(!/error\.message/.test(body), 'never echoes Auth error text');
});

test('signOutOtherSessions keeps this browser signed in (scope others)', () => {
  assert.ok(/signOut\(\{ scope: 'others' \}\)/.test(fn('signOutOtherSessions')));
});
