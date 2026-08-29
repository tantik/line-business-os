import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicEnv, parseServerEnv, serverEnv } from './env.js';

const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_ANON_KEY = 'anon-key-value-should-never-be-logged';
const FAKE_SECRET_KEY = 'FAKE-secret-key-value-must-never-be-logged';
const FAKE_LEGACY_KEY = 'legacy-service-role-value-should-never-be-logged';

/** A complete server env minus the privileged key — tests add one (or neither). */
const baseServerEnv = {
  SUPABASE_URL: VALID_URL,
  SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  PII_ENCRYPTION_KEY: 'a'.repeat(44),
  PII_HASH_PEPPER: 'pepper-value-at-least-16-chars',
  LINE_CHANNEL_SECRET: 'secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'token',
} as const;

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
    assert.ok(result.missing.includes('PII_ENCRYPTION_KEY'));
    assert.ok(result.missing.includes('DATABASE_URL'));
    // The privileged-key requirement is enforced by an object-level check that
    // runs only once the individual required fields parse — see the dedicated
    // 'neither privileged key present' test below.
  }
});

test('parseServerEnv: neither privileged key present -> a value-free config error', () => {
  const result = parseServerEnv(baseServerEnv);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('SUPABASE_SECRET_KEY'));
    assert.match(result.message, /Exactly one is required/);
  }
});

test('parseServerEnv: SUPABASE_SECRET_KEY is preferred', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePrivilegedKey, FAKE_SECRET_KEY);
    assert.equal(result.data.supabasePrivilegedKeySource, 'secret_key');
    assert.equal(result.data.API_PORT, 3001);
    assert.equal(result.data.NODE_ENV, 'development');
  }
});

test('parseServerEnv: legacy SUPABASE_SERVICE_ROLE_KEY is the fallback', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePrivilegedKey, FAKE_LEGACY_KEY);
    assert.equal(result.data.supabasePrivilegedKeySource, 'legacy_service_role');
  }
});

test('parseServerEnv: an empty-string SUPABASE_SECRET_KEY does not count', () => {
  // present-but-empty secret key + a valid legacy key -> legacy is used, no error
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePrivilegedKeySource, 'legacy_service_role');
  }
});

test('parseServerEnv never echoes a privileged key VALUE in its error message', () => {
  // Force a failure (bad URL) while both keys are present.
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_URL: 'not-a-url',
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(!result.message.includes(FAKE_SECRET_KEY));
    assert.ok(!result.message.includes(FAKE_LEGACY_KEY));
  }
});

test('serverEnv() boot error is value-free (reuses the parse message)', () => {
  const saved = process.env;
  try {
    process.env = {
      NODE_ENV: 'test',
      SUPABASE_URL: 'not-a-url',
      SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
    } as NodeJS.ProcessEnv;
    assert.throws(
      () => serverEnv(),
      (err: unknown) => {
        const msg = (err as Error).message;
        assert.match(msg, /Invalid server environment/);
        assert.ok(!msg.includes(FAKE_SECRET_KEY));
        return true;
      },
    );
  } finally {
    process.env = saved;
  }
});
