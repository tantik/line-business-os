import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicEnv, parseServerEnv, serverEnv } from './env.js';

const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_ANON_KEY = 'anon-key-value-should-never-be-logged';
const FAKE_PUBLISHABLE_KEY = 'sb_publishable_FAKE-value-should-never-be-logged';
const FAKE_SECRET_KEY = 'FAKE-secret-key-value-must-never-be-logged';
const FAKE_LEGACY_SERVICE_ROLE = 'legacy-service-role-value-should-never-be-logged';

/** A complete server env minus the two Supabase API keys — tests add them. */
const baseServerEnv = {
  SUPABASE_URL: VALID_URL,
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  PII_ENCRYPTION_KEY: 'a'.repeat(44),
  PII_HASH_PEPPER: 'pepper-value-at-least-16-chars',
  LINE_CHANNEL_SECRET: 'secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'token',
} as const;

// --- Public (browser) env ------------------------------------------------

test('parsePublicEnv: publishable-only path works', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.NEXT_PUBLIC_SUPABASE_URL, VALID_URL);
    assert.equal(result.data.supabasePublishableKey, FAKE_PUBLISHABLE_KEY);
  }
});

test('parsePublicEnv: surrounding whitespace on the publishable key is trimmed', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${FAKE_PUBLISHABLE_KEY}\n`,
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.supabasePublishableKey, FAKE_PUBLISHABLE_KEY);
});

test('parsePublicEnv: missing publishable key -> fail closed, named', () => {
  const result = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: VALID_URL });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
  }
});

test('parsePublicEnv: whitespace-only publishable key -> fail closed', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ',
  });
  assert.equal(result.success, false);
});

test('parsePublicEnv: legacy NEXT_PUBLIC_SUPABASE_ANON_KEY alone does NOT satisfy public config', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: VALID_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE_ANON_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
  }
});

test('parsePublicEnv: rejects a non-URL supabase url', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('NEXT_PUBLIC_SUPABASE_URL'));
});

test('parsePublicEnv never leaks a key VALUE in its message', () => {
  const result = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(!result.message.includes(FAKE_PUBLISHABLE_KEY));
});

// --- Server env: privileged + low-privilege keys ------------------------

test('parseServerEnv: publishable + secret path works; privileged key is never the user key', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.supabaseUserKey, FAKE_PUBLISHABLE_KEY);
    assert.equal(result.data.supabasePrivilegedKey, FAKE_SECRET_KEY);
    assert.notEqual(result.data.supabaseUserKey, result.data.supabasePrivilegedKey);
    assert.equal(result.data.API_PORT, 3001);
    assert.equal(result.data.NODE_ENV, 'development');
  }
});

test('parseServerEnv: missing SUPABASE_SECRET_KEY -> fail closed, named', () => {
  const result = parseServerEnv({ ...baseServerEnv, SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('SUPABASE_SECRET_KEY'));
});

test('parseServerEnv: missing SUPABASE_PUBLISHABLE_KEY -> fail closed, named', () => {
  const result = parseServerEnv({ ...baseServerEnv, SUPABASE_SECRET_KEY: FAKE_SECRET_KEY });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('SUPABASE_PUBLISHABLE_KEY'));
});

test('parseServerEnv: legacy SUPABASE_SERVICE_ROLE_KEY alone does NOT satisfy privileged config', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_SERVICE_ROLE,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('SUPABASE_SECRET_KEY'));
});

test('parseServerEnv: legacy SUPABASE_ANON_KEY alone does NOT satisfy low-privilege config', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_ANON_KEY: FAKE_ANON_KEY,
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('SUPABASE_PUBLISHABLE_KEY'));
});

test('parseServerEnv: an empty-string SUPABASE_SECRET_KEY does not count (no legacy fallback)', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: FAKE_LEGACY_SERVICE_ROLE,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.missing.includes('SUPABASE_SECRET_KEY'));
});

test('parseServerEnv reports the full set of missing core vars without values', () => {
  const result = parseServerEnv({ NODE_ENV: 'test' });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.missing.includes('SUPABASE_URL'));
    assert.ok(result.missing.includes('SUPABASE_PUBLISHABLE_KEY'));
    assert.ok(result.missing.includes('SUPABASE_SECRET_KEY'));
    assert.ok(result.missing.includes('PII_ENCRYPTION_KEY'));
    assert.ok(result.missing.includes('DATABASE_URL'));
  }
});

test('parseServerEnv never echoes a key VALUE in its error message', () => {
  const result = parseServerEnv({
    ...baseServerEnv,
    SUPABASE_URL: 'not-a-url',
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(!result.message.includes(FAKE_SECRET_KEY));
    assert.ok(!result.message.includes(FAKE_PUBLISHABLE_KEY));
  }
});

test('serverEnv() boot error is value-free (reuses the parse message)', () => {
  const saved = process.env;
  try {
    process.env = {
      NODE_ENV: 'test',
      SUPABASE_URL: 'not-a-url',
      SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
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
