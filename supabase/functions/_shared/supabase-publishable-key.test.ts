import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupabasePublishableKey,
  SupabasePublishableKeyConfigError,
  type SupabasePublishableKeySource,
} from './supabase-publishable-key.ts';

// Synthetic non-key placeholder strings only (deliberately NOT shaped like a
// real publishable key or a JWT, so secret scanners don't flag the test).
const PUBLISHABLE_DEFAULT = 'FAKE-publishable-default-value-must-never-leak';
const PUBLISHABLE_OTHER = 'FAKE-publishable-other-value-must-never-leak';
const LEGACY_ANON = 'FAKE-legacy-anon-value-must-never-leak';

test('resolves the SUPABASE_PUBLISHABLE_KEYS "default" entry', () => {
  const r = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_DEFAULT, other: PUBLISHABLE_OTHER }),
  });
  assert.equal(r.key, PUBLISHABLE_DEFAULT);
  assert.equal(r.source, 'publishable_keys_default');
});

test('no legacy SUPABASE_ANON_KEY fallback: absent SUPABASE_PUBLISHABLE_KEYS -> fail closed', () => {
  assert.throws(
    () =>
      resolveSupabasePublishableKey({
        SUPABASE_ANON_KEY: LEGACY_ANON,
      } as unknown as SupabasePublishableKeySource),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /No Supabase publishable key/);
      assert.ok(!(err as Error).message.includes(LEGACY_ANON));
      return true;
    },
  );
});

test('empty / whitespace-only SUPABASE_PUBLISHABLE_KEYS -> fail closed', () => {
  for (const v of ['', '   ']) {
    assert.throws(
      () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: v }),
      (err: unknown) => err instanceof SupabasePublishableKeyConfigError,
    );
  }
});

test('a SUPABASE_PUBLISHABLE_KEYS object without a "default" -> fail closed', () => {
  assert.throws(
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: PUBLISHABLE_OTHER }) }),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /missing a non-empty "default"/);
      return true;
    },
  );
});

test('an empty-string "default" -> fail closed', () => {
  assert.throws(
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: '' }) }),
    (err: unknown) => err instanceof SupabasePublishableKeyConfigError,
  );
});

test('malformed JSON -> SupabasePublishableKeyConfigError, no key in the message', () => {
  assert.throws(
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: '{ not json' }),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /not valid JSON/);
      return true;
    },
  );
});

test('a JSON array (not object) -> SupabasePublishableKeyConfigError', () => {
  assert.throws(
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify([PUBLISHABLE_DEFAULT]) }),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /must be a JSON object/);
      return true;
    },
  );
});

test('invite-employee diagnostic: payload carries only the source enum, never a key', () => {
  const resolved = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_DEFAULT, other: PUBLISHABLE_OTHER }),
  });
  assert.equal(resolved.source, 'publishable_keys_default');
  const diagnostic = JSON.stringify({
    event: 'invite-employee.publishable_key_source',
    source: resolved.source,
  });
  const parsed = JSON.parse(diagnostic) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ['event', 'source']);
  for (const key of [PUBLISHABLE_DEFAULT, PUBLISHABLE_OTHER]) {
    assert.ok(!diagnostic.includes(key), `diagnostic payload leaked a key: ${diagnostic}`);
  }
});

test('the resolved key value never appears in any thrown error message', () => {
  const cases: Array<() => unknown> = [
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: '{bad' }),
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify([PUBLISHABLE_DEFAULT]) }),
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: PUBLISHABLE_OTHER }) }),
    () => resolveSupabasePublishableKey({}),
  ];
  for (const run of cases) {
    try {
      run();
    } catch (err) {
      const msg = (err as Error).message;
      for (const key of [PUBLISHABLE_DEFAULT, PUBLISHABLE_OTHER, LEGACY_ANON]) {
        assert.ok(!msg.includes(key), `error message leaked a key: ${msg}`);
      }
    }
  }
});
