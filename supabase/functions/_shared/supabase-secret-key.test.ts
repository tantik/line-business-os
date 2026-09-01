import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupabaseSecretKey,
  SupabaseSecretKeyConfigError,
  type SupabaseSecretKeySource,
} from './supabase-secret-key.ts';

// Synthetic non-key placeholder strings only (deliberately NOT shaped like a
// real `sb_secret_*` value or a JWT, so secret scanners don't flag the test).
// These must never appear in an error message.
const SECRET_DEFAULT = 'FAKE-default-key-value-must-never-leak';
const SECRET_OTHER = 'FAKE-other-key-value-must-never-leak';
const LEGACY_JWT = 'FAKE-legacy-service-role-value-must-never-leak';

test('resolves the SUPABASE_SECRET_KEYS "default" entry', () => {
  const r = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_DEFAULT, other: SECRET_OTHER }),
  });
  assert.equal(r.key, SECRET_DEFAULT);
  assert.equal(r.source, 'secret_keys_default');
});

test('no legacy SUPABASE_SERVICE_ROLE_KEY fallback: absent SUPABASE_SECRET_KEYS -> fail closed', () => {
  // A legacy key in the source map is simply ignored — the resolver never reads it.
  assert.throws(
    () =>
      resolveSupabaseSecretKey({
        SUPABASE_SERVICE_ROLE_KEY: LEGACY_JWT,
      } as unknown as SupabaseSecretKeySource),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /No privileged Supabase key/);
      assert.ok(!(err as Error).message.includes(LEGACY_JWT));
      return true;
    },
  );
});

test('empty / whitespace-only SUPABASE_SECRET_KEYS -> fail closed', () => {
  for (const v of ['', '   ']) {
    assert.throws(
      () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: v }),
      (err: unknown) => err instanceof SupabaseSecretKeyConfigError,
    );
  }
});

test('a SUPABASE_SECRET_KEYS object without a "default" -> fail closed', () => {
  assert.throws(
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify({ webhook: SECRET_OTHER }) }),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /missing a non-empty "default"/);
      return true;
    },
  );
});

test('an empty-string "default" -> fail closed', () => {
  assert.throws(
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: '' }) }),
    (err: unknown) => err instanceof SupabaseSecretKeyConfigError,
  );
});

test('malformed JSON -> SupabaseSecretKeyConfigError, no secret in the message', () => {
  assert.throws(
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: '{ not json' }),
    (err: unknown) => {
      assert.ok(err instanceof SupabaseSecretKeyConfigError);
      assert.match((err as Error).message, /not valid JSON/);
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

test('invite-employee diagnostic: payload carries only the source enum, never a key', () => {
  // invite-employee/index.ts cannot be imported here (top-level Deno.serve +
  // Deno.env), so this locks the invariants the diagnostic depends on at the
  // resolver boundary: resolved.source is ONLY ever the resolver enum, and a
  // payload built from resolved.source alone (the exact shape index.ts logs)
  // carries no key value.
  const resolved = resolveSupabaseSecretKey({
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_DEFAULT, other: SECRET_OTHER }),
  });
  assert.equal(resolved.source, 'secret_keys_default');
  const diagnostic = JSON.stringify({
    event: 'invite-employee.privileged_key_source',
    source: resolved.source,
  });
  const parsed = JSON.parse(diagnostic) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['event', 'source']);
  for (const secret of [SECRET_DEFAULT, SECRET_OTHER]) {
    assert.ok(!diagnostic.includes(secret), `diagnostic payload leaked a secret: ${diagnostic}`);
  }
});

test('the resolved key value never appears in any thrown error message', () => {
  const cases: Array<() => unknown> = [
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: '{bad' }),
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify([SECRET_DEFAULT]) }),
    () => resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: JSON.stringify({ webhook: SECRET_OTHER }) }),
    () => resolveSupabaseSecretKey({}),
  ];
  for (const run of cases) {
    try {
      run();
    } catch (err) {
      const msg = (err as Error).message;
      for (const secret of [SECRET_DEFAULT, SECRET_OTHER, LEGACY_JWT]) {
        assert.ok(!msg.includes(secret), `error message leaked a secret: ${msg}`);
      }
    }
  }
});
