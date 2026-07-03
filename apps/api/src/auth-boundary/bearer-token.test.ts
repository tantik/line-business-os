import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBearerToken } from './bearer-token.js';

test('parseBearerToken: missing header -> null', () => {
  assert.equal(parseBearerToken(undefined), null);
  assert.equal(parseBearerToken(null), null);
  assert.equal(parseBearerToken(''), null);
});

test('parseBearerToken: malformed header (no Bearer prefix) -> null', () => {
  assert.equal(parseBearerToken('token-without-scheme'), null);
  assert.equal(parseBearerToken('Basic dXNlcjpwYXNz'), null);
  assert.equal(parseBearerToken('bearer lowercase-scheme'), null); // scheme is case-sensitive
});

test('parseBearerToken: Bearer with no token -> null', () => {
  assert.equal(parseBearerToken('Bearer '), null);
  assert.equal(parseBearerToken('Bearer    '), null);
});

test('parseBearerToken: well-formed header -> extracted token', () => {
  assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
});

test('parseBearerToken: trims surrounding whitespace around the token', () => {
  assert.equal(parseBearerToken('Bearer   abc.def.ghi  '), 'abc.def.ghi');
});
