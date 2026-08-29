import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupabaseSecretKey,
  SupabaseSecretKeyConfigError,
} from './supabase-secret-key.ts';

// Synthetic non-key placeholder strings only (deliberately NOT shaped like a
// real `sb_secret_*` value or a JWT, so secret scanners don't flag the test).
// These must never appear in an error message.
const SECRET_DEFAULT = 'FAKE-default-key-value-must-never-leak';
const SECRET_OTHER = 'FAKE-other-key-value-must-never-leak';
const LEGACY_JWT = 'FAKE-legacy-service-role-value-must-never-leak';

test('prefers the SUPABASE_SECRET_KEYS "default" entry', () => {
  const r = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_DEFAULT, other: SECRET_OTHER }),
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
  });
  assert.equal(r.key, SECRET_DEFAULT);
  assert.equal(r.source, 'secret_keys_default');
});

test('legacy SUPABASE_SERVICE_ROLE_KEY is used when SUPABASE_SECRET_KEYS is absent', () => {
  const r = resolveSupabaseSecretKey({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT });
  assert.equal(r.key, LEGACY_JWT);
  assert.equal(r.source, 'legacy_service_role');
});

test('legacy fallback also applies when SUPABASE_SECRET_KEYS is empty/whitespace', () => {
  const r = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: '   ',
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
  });
  assert.equal(r.source, 'legacy_service_role');
});

test('a SUPABASE_SECRET_KEYS object without a "default" falls back to legacy (defined behavior)', () => {
  const r = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ webhook: SECRET_OTHER }),
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
  });
  assert.equal(r.key, LEGACY_JWT);
  assert.equal(r.source, 'legacy_service_role');
});

test('an empty-string "default" is ignored and falls back to legacy', () => {
  const r = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: '' }),
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
  });
  assert.equal(r.source, 'legacy_service_role');
});

test('malformed JSON -> SupabaseSecretKeyConfigError, no secret in the message', () => {
  assert.throws(
    () =>
      resolveSupabaseSecretKey({
        SUPABASE_SECRET_KEYS: '{ not json',
        SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
      }),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /not valid JSON/);
      assert.ok(!(err as Error).message.includes(LEGACY_JWT));
      return true;
    },
  );
});

test('a JSON array (not object) -> SupabaseSecretKeyConfigError', () => {
  assert.throws(
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify([SECRET_DEFAULT]) }),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /must be a JSON object/);
      return true;
    },
  );
});

test('neither source present -> fail closed with a value-free error', () => {
  assert.throws(
    () => resolveSupabaseSecretKey({}),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /No privileged Supabase key/);
      return true;
    },
  );
});

test('the resolved key value never appears in any thrown error message', () => {
  // exhaustively: every error path, assert none echoes a provided value.
  const cases: Array<() => unknown> = [
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: '{bad', SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT }),
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify([SECRET_DEFAULT]) }),
    () => resolveSupabaseSecretKey({}),
  ];
  for (const run of cases) {
    try {
      run();
      assert.fail('expected a throw');
    } catch (err) {
      const msg = (err as Error).message;
      for (const secret of [SECRET_DEFAULT, SECRET_OTHER, LEGACY_JWT]) {
        assert.ok(!msg.includes(secret), `error message leaked a secret: ${msg}`);
      }
    }
  }
});
