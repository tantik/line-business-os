import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLowPrivilegeSupabaseKey } from './env.public.js';

const PUBLISHABLE = 'sb_publishable_fake';
const ANON = 'anon-fake';

test('publishable present -> publishable, source "publishable"', () => {
  assert.deepEqual(resolveLowPrivilegeSupabaseKey({ publishableKey: PUBLISHABLE, anonKey: undefined }), {
    key: PUBLISHABLE,
    source: 'publishable',
  });
});

test('only anon present -> anon, source "legacy_anon"', () => {
  assert.deepEqual(resolveLowPrivilegeSupabaseKey({ publishableKey: undefined, anonKey: ANON }), {
    key: ANON,
    source: 'legacy_anon',
  });
});

test('both present -> publishable wins', () => {
  assert.deepEqual(resolveLowPrivilegeSupabaseKey({ publishableKey: PUBLISHABLE, anonKey: ANON }), {
    key: PUBLISHABLE,
    source: 'publishable',
  });
});

test('neither present -> null (fail closed)', () => {
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: undefined, anonKey: undefined }), null);
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: '', anonKey: '' }), null);
});

test('whitespace-only values are treated as absent', () => {
  assert.deepEqual(resolveLowPrivilegeSupabaseKey({ publishableKey: '   ', anonKey: ANON }), {
    key: ANON,
    source: 'legacy_anon',
  });
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: '  ', anonKey: '\t\n' }), null);
});

test('surrounding whitespace on a real value is trimmed off', () => {
  assert.deepEqual(
    resolveLowPrivilegeSupabaseKey({ publishableKey: `  ${PUBLISHABLE}\n`, anonKey: undefined }),
    { key: PUBLISHABLE, source: 'publishable' },
  );
});
