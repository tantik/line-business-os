import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readPublicSupabaseEnv, requirePublicSupabaseEnv } from './env.js';

const URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL';
const PUBLISHABLE_KEY = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const ANON_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const VALID_URL = 'http://127.0.0.1:54321';
const FAKE_PUBLISHABLE = 'sb_publishable_fake-value-should-never-be-logged';
const FAKE_ANON = 'fake-anon-key-should-never-be-logged';

beforeEach(() => {
  delete process.env[URL_KEY];
  delete process.env[PUBLISHABLE_KEY];
  delete process.env[ANON_KEY];
});

test('publishable key present -> publishable selected', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[PUBLISHABLE_KEY] = FAKE_PUBLISHABLE;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.url, VALID_URL);
    assert.equal(result.config.key, FAKE_PUBLISHABLE);
    assert.equal(result.config.keySource, 'publishable');
  }
});

test('publishable absent + legacy anon present -> legacy fallback', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[ANON_KEY] = FAKE_ANON;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.key, FAKE_ANON);
    assert.equal(result.config.keySource, 'legacy_anon');
  }
});

test('both present -> publishable wins', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[PUBLISHABLE_KEY] = FAKE_PUBLISHABLE;
  process.env[ANON_KEY] = FAKE_ANON;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.key, FAKE_PUBLISHABLE);
    assert.equal(result.config.keySource, 'publishable');
  }
});

test('neither key present -> fail closed, reported by name', () => {
  process.env[URL_KEY] = VALID_URL;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missing.includes(PUBLISHABLE_KEY));
  }
});

test('whitespace-only publishable key is treated as absent -> legacy fallback', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[PUBLISHABLE_KEY] = '   ';
  process.env[ANON_KEY] = FAKE_ANON;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.key, FAKE_ANON);
    assert.equal(result.config.keySource, 'legacy_anon');
  }
});

test('whitespace-only for both keys -> fail closed', () => {
  process.env[URL_KEY] = VALID_URL;
  process.env[PUBLISHABLE_KEY] = '  ';
  process.env[ANON_KEY] = '\t';
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, false);
});

test('readPublicSupabaseEnv reports missing url by name', () => {
  process.env[PUBLISHABLE_KEY] = FAKE_PUBLISHABLE;
  const result = readPublicSupabaseEnv();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.missing.includes(URL_KEY));
  }
});

test('requirePublicSupabaseEnv throws a name-only error, never a key value', () => {
  process.env[ANON_KEY] = FAKE_ANON;
  assert.throws(
    () => requirePublicSupabaseEnv(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes(URL_KEY));
      assert.ok(!err.message.includes(FAKE_ANON));
      assert.ok(!err.message.includes(FAKE_PUBLISHABLE));
      return true;
    },
  );
});
