import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicEnv, parseServerEnv } from './env.js';

const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_ANON_KEY = 'anon-key-value-should-never-be-logged';

test('parsePublicEnv accepts a valid public env', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.NEXT_PUBLIC_SUPABASE_URL, VALID_URL);
    assert.equal(result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY, FAKE_ANON_KEY);
  }
});

test('parsePublicEnv reports missing variables by name', () => {
  const result = parsePublicEnv({});
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_URL'));
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  }
});

test('parsePublicEnv rejects a non-URL supabase url', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_URL'));
  }
});

test('parsePublicEnv never leaks secret VALUES in its message', () => {
  // A present-but-invalid anon key (empty) plus an invalid url: the error
  // message must describe names/constraints, never echo the provided secret.
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(!result.message.includes(FAKE_ANON_KEY));
  }
});

test('parseServerEnv reports the full set of missing server vars without values', () => {
  const result = parseServerEnv({ NODE_ENV: 'test' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('SUPABASE_URL'));
    assert.ok(result.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
    assert.ok(result.missing.includes('PII_ENCRYPTION_KEY'));
  }
});

test('parseServerEnv accepts a complete server env and applies defaults', () => {
  const result = parseServerEnv({
    SUPABASE_URL: VALID_URL,
    SUPABASE_ANON_KEY: FAKE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    PII_ENCRYPTION_KEY: 'a'.repeat(44),
    PII_HASH_PEPPER: 'pepper-value-at-least-16-chars',
    LINE_CHANNEL_SECRET: 'secret',
    LINE_CHANNEL_ACCESS_TOKEN: 'token',
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.API_PORT, 3001);
    assert.equal(result.data.NODE_ENV, 'development');
  }
});
