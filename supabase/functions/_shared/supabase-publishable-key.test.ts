import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupabasePublishableKey,
  SupabasePublishableKeyConfigError,
  type SupabasePublishableKeySource,
} from './supabase-publishable-key.ts';

// Synthetic non-key placeholder strings only (deliberately NOT shaped like a
// real publishable key or a JWT, so secret scanners don't flag the test).
// These must never appear in an error message.
const PUBLISHABLE_DEFAULT = 'FAKE-publishable-default-value-must-never-leak';
const PUBLISHABLE_OTHER = 'FAKE-publishable-other-value-must-never-leak';
const LEGACY_ANON = 'FAKE-legacy-anon-value-must-never-leak';

test('prefers the SUPABASE_PUBLISHABLE_KEYS "default" entry', () => {
  const r = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_DEFAULT, other: PUBLISHABLE_OTHER }),
    SUPABASE_ANON_KEY: LEGACY_ANON,
  });
  assert.equal(r.key, PUBLISHABLE_DEFAULT);
  assert.equal(r.source, 'publishable_keys_default');
});

test('legacy SUPABASE_ANON_KEY is used when SUPABASE_PUBLISHABLE_KEYS is absent', () => {
  const r = resolveSupabasePublishableKey({ SUPABASE_ANON_KEY: LEGACY_ANON });
  assert.equal(r.key, LEGACY_ANON);
  assert.equal(r.source, 'legacy_anon');
});

test('legacy fallback also applies when SUPABASE_PUBLISHABLE_KEYS is empty/whitespace', () => {
  const r = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: '   ',
    SUPABASE_ANON_KEY: LEGACY_ANON,
  });
  assert.equal(r.source, 'legacy_anon');
});

test('a SUPABASE_PUBLISHABLE_KEYS object without a "default" falls back to legacy', () => {
  const r = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: PUBLISHABLE_OTHER }),
    SUPABASE_ANON_KEY: LEGACY_ANON,
  });
  assert.equal(r.key, LEGACY_ANON);
  assert.equal(r.source, 'legacy_anon');
});

test('an empty-string "default" is ignored and falls back to legacy', () => {
  const r = resolveSupabasePublishableKey({
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: '' }),
    SUPABASE_ANON_KEY: LEGACY_ANON,
  });
  assert.equal(r.source, 'legacy_anon');
});

test('malformed JSON -> SupabasePublishableKeyConfigError, no key in the message', () => {
  assert.throws(
    () =>
      resolveSupabasePublishableKey({
        SUPABASE_PUBLISHABLE_KEYS: '{ not json',
        SUPABASE_ANON_KEY: LEGACY_ANON,
      }),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /not valid JSON/);
      assert.ok(!(err as Error).message.includes(LEGACY_ANON));
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

test('neither source present -> fail closed with a value-free error', () => {
  assert.throws(
    () => resolveSupabasePublishableKey({}),
    (err: unknown) => {
      assert.ok(err instanceof SupabasePublishableKeyConfigError);
      assert.match((err as Error).message, /No Supabase publishable key/);
      return true;
    },
  );
});

test('invite-employee diagnostic: payload carries only the source enum, never a key', () => {
  // invite-employee/index.ts cannot be imported here (top-level Deno.serve +
  // Deno.env), so this locks the invariants the diagnostic depends on at the
  // resolver boundary: (a) resolved.source is ONLY ever the resolver enum,
  // across every success path; (b) a payload built from resolved.source alone
  // (the exact shape index.ts logs) carries no key value.
  const ALLOWED_SOURCES = new Set(['publishable_keys_default', 'legacy_anon']);
  const successCases: SupabasePublishableKeySource[] = [
    { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_DEFAULT, other: PUBLISHABLE_OTHER }), SUPABASE_ANON_KEY: LEGACY_ANON },
    { SUPABASE_ANON_KEY: LEGACY_ANON },
    { SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ web: PUBLISHABLE_OTHER }), SUPABASE_ANON_KEY: LEGACY_ANON },
  ];
  for (const source of successCases) {
    const resolved = resolveSupabasePublishableKey(source);
    assert.ok(ALLOWED_SOURCES.has(resolved.source), `unexpected source enum: ${resolved.source}`);
    const diagnostic = JSON.stringify({
      event: 'invite-employee.publishable_key_source',
      source: resolved.source,
    });
    const parsed = JSON.parse(diagnostic) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), ['event', 'source']);
    assert.equal(parsed.source, resolved.source);
    for (const key of [PUBLISHABLE_DEFAULT, PUBLISHABLE_OTHER, LEGACY_ANON]) {
      assert.ok(!diagnostic.includes(key), `diagnostic payload leaked a key: ${diagnostic}`);
    }
  }
});

test('the resolved key value never appears in any thrown error message', () => {
  const cases: Array<() => unknown> = [
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: '{bad', SUPABASE_ANON_KEY: LEGACY_ANON }),
    () => resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: JSON.stringify([PUBLISHABLE_DEFAULT]) }),
    () => resolveSupabasePublishableKey({}),
  ];
  for (const run of cases) {
    try {
      run();
      assert.fail('expected a throw');
    } catch (err) {
      const msg = (err as Error).message;
      for (const key of [PUBLISHABLE_DEFAULT, PUBLISHABLE_OTHER, LEGACY_ANON]) {
        assert.ok(!msg.includes(key), `error message leaked a key: ${msg}`);
      }
    }
  }
});
