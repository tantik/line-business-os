import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readPublicSupabaseEnv, requirePublicSupabaseEnv } from './env.js';

const URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL';
const ANON_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_ANON = 'fake-anon-key';

beforeEach(() => {
  delete process.env[URL_KEY];
  delete process.env[ANON_KEY];
});

test('readPublicSupabaseEnv returns ok with config when both vars are set', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[ANON_KEY] = FAKE_ANON;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.url, VALID_URL);
    assert.equal(result.config.anonKey, FAKE_ANON);
  }
});

test('readPublicSupabaseEnv reports missing vars by name', () => {
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missing.includes(URL_KEY));
    assert.ok(result.missing.includes(ANON_KEY));
  }
});

test('requirePublicSupabaseEnv throws a name-only error when misconfigured', () => {
  process.env[ANON_KEY] = FAKE_ANON;
  assert.throws(
    () => requirePublicSupabaseEnv(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes(URL_KEY));
      // Must not leak the anon key value into the error message.
      assert.ok(!err.message.includes(FAKE_ANON));
      return true;
    },
  );
});
