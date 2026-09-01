import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLowPrivilegeSupabaseKey } from './env.public.js';

const PUBLISHABLE = 'sb_publishable_fake';

test('publishable present -> returns it', () => {
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: PUBLISHABLE }), PUBLISHABLE);
});

test('absent / empty / whitespace-only -> null (fail closed), no legacy fallback', () => {
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: undefined }), null);
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: '' }), null);
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: '   ' }), null);
  assert.equal(resolveLowPrivilegeSupabaseKey({ publishableKey: '\t\n' }), null);
});

test('surrounding whitespace on a real value is trimmed off', () => {
  assert.equal(
    resolveLowPrivilegeSupabaseKey({ publishableKey: `  ${PUBLISHABLE}\n` }),
    PUBLISHABLE,
  );
});
