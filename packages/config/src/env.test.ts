import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicEnv, parseServerEnv, serverEnv } from './env.js';

const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_ANON_KEY = 'anon-key-value-should-never-be-logged';
const FAKE_PUBLISHABLE_KEY = 'sb_publishable_FAKE-value-should-never-be-logged';
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
    // The low-privilege "at least one of publishable/anon" check is an
    // object-level refinement that only runs once the required fields parse —
    // see the dedicated 'neither low-privilege key -> fail closed' test.
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
    assert.match(result.message, /At least one is required/);
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

// --- Low-privilege key: web (NEXT_PUBLIC_*) precedence --------------------

const validPublicBase = { NEXT_PUBLIC_SUPABASE_URL: VALID_URL } as const;

test('parsePublicEnv: publishable present -> publishable selected', () => {
  const result = parsePublicEnv({
    ...validPublicBase,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePublishableKey, FAKE_PUBLISHABLE_KEY);
    assert.equal(result.data.supabasePublishableKeySource, 'publishable');
  }
});

test('parsePublicEnv: publishable absent + legacy anon present -> legacy fallback', () => {
  const result = parsePublicEnv({
    ...validPublicBase,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePublishableKey, FAKE_ANON_KEY);
    assert.equal(result.data.supabasePublishableKeySource, 'legacy_anon');
  }
});

test('parsePublicEnv: both present -> publishable wins', () => {
  const result = parsePublicEnv({
    ...validPublicBase,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePublishableKey, FAKE_PUBLISHABLE_KEY);
    assert.equal(result.data.supabasePublishableKeySource, 'publishable');
  }
});

test('parsePublicEnv: neither low-privilege key -> fail closed, named', () => {
  const result = parsePublicEnv(validPublicBase);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
    assert.match(result.message, /At least one is required/);
  }
});

test('parsePublicEnv: whitespace-only publishable is absent -> legacy fallback', () => {
  const result = parsePublicEnv({
    ...validPublicBase,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabasePublishableKeySource, 'legacy_anon');
  }
});

test('parsePublicEnv: error message never echoes a low-privilege key VALUE', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(!result.message.includes(FAKE_PUBLISHABLE_KEY));
  }
});

// --- Low-privilege key: server (bare names) precedence -------------------

const baseServerEnvNoLowPriv = {
  SUPABASE_URL: VALID_URL,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  PII_ENCRYPTION_KEY: 'a'.repeat(44),
  PII_HASH_PEPPER: 'pepper-value-at-least-16-chars',
  LINE_CHANNEL_SECRET: 'secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'token',
  SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
} as const;

test('parseServerEnv: SUPABASE_PUBLISHABLE_KEY is preferred for the user key', () => {
  const result = parseServerEnv({
    ...baseServerEnvNoLowPriv,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabaseUserKey, FAKE_PUBLISHABLE_KEY);
    assert.equal(result.data.supabaseUserKeySource, 'publishable');
    // Privileged key is never the user key.
    assert.notEqual(result.data.supabaseUserKey, result.data.supabasePrivilegedKey);
  }
});

test('parseServerEnv: legacy SUPABASE_ANON_KEY is the user-key fallback', () => {
  const result = parseServerEnv({
    ...baseServerEnvNoLowPriv,
    SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabaseUserKey, FAKE_ANON_KEY);
    assert.equal(result.data.supabaseUserKeySource, 'legacy_anon');
  }
});

test('parseServerEnv: neither low-privilege key present -> a value-free config error', () => {
  const result = parseServerEnv(baseServerEnvNoLowPriv);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('SUPABASE_PUBLISHABLE_KEY'));
    assert.match(result.message, /At least one is required/);
  }
});

test('parseServerEnv: the privileged secret key is never selected as the user key', () => {
  const result = parseServerEnv({
    ...baseServerEnvNoLowPriv,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.notEqual(result.data.supabaseUserKey, FAKE_SECRET_KEY);
    assert.notEqual(result.data.supabaseUserKey, result.data.supabasePrivilegedKey);
    assert.equal(result.data.supabasePrivilegedKey, FAKE_SECRET_KEY);
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
