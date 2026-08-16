import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUuidParam } from './uuid.js';

test('parseUuidParam: missing value -> null', () => {
  assert.equal(parseUuidParam(undefined), null);
  assert.equal(parseUuidParam(null), null);
});

test('parseUuidParam: empty/whitespace-only -> null', () => {
  assert.equal(parseUuidParam(''), null);
  assert.equal(parseUuidParam('   '), null);
});

test('parseUuidParam: over-length value -> null', () => {
  assert.equal(parseUuidParam('a'.repeat(65)), null);
});

test('parseUuidParam: malformed value -> null', () => {
  assert.equal(parseUuidParam('not-a-uuid'), null);
  assert.equal(parseUuidParam('11111111-1111-1111-1111-11111111111'), null); // one char short
  assert.equal(parseUuidParam("'; drop table core.tenants; --"), null);
});

test('parseUuidParam: valid lowercase UUID -> same value', () => {
  assert.equal(
    parseUuidParam('a1111111-1111-1111-1111-111111111111'),
    'a1111111-1111-1111-1111-111111111111',
  );
});

test('parseUuidParam: valid uppercase UUID -> normalized to lowercase', () => {
  assert.equal(
    parseUuidParam('A1111111-1111-1111-1111-111111111111'),
    'a1111111-1111-1111-1111-111111111111',
  );
});

test('parseUuidParam: valid UUID with surrounding whitespace -> trimmed', () => {
  assert.equal(
    parseUuidParam('  a1111111-1111-1111-1111-111111111111  '),
    'a1111111-1111-1111-1111-111111111111',
  );
});
