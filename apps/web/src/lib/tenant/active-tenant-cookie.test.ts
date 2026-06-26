import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_TENANT_COOKIE,
  buildActiveTenantCookieOptions,
  parseActiveTenantCookieValue,
} from './active-tenant-cookie.js';

const LOWER_UUID = '0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const UPPER_UUID = LOWER_UUID.toUpperCase();

test('ACTIVE_TENANT_COOKIE has the expected name', () => {
  assert.equal(ACTIVE_TENANT_COOKIE, 'lbo_active_tenant_id');
});

test('parseActiveTenantCookieValue: undefined -> null', () => {
  assert.equal(parseActiveTenantCookieValue(undefined), null);
});

test('parseActiveTenantCookieValue: null -> null', () => {
  assert.equal(parseActiveTenantCookieValue(null), null);
});

test('parseActiveTenantCookieValue: empty string -> null', () => {
  assert.equal(parseActiveTenantCookieValue(''), null);
});

test('parseActiveTenantCookieValue: whitespace -> null', () => {
  assert.equal(parseActiveTenantCookieValue('   '), null);
});

test('parseActiveTenantCookieValue: garbage -> null', () => {
  assert.equal(parseActiveTenantCookieValue('not-a-uuid'), null);
  assert.equal(parseActiveTenantCookieValue('12345'), null);
});

test('parseActiveTenantCookieValue: over-length value -> null', () => {
  // Padded well beyond MAX_RAW_LENGTH so even a valid UUID inside is rejected.
  const overLength = `${LOWER_UUID}${' '.repeat(64)}`;
  assert.equal(parseActiveTenantCookieValue(overLength), null);
});

test('parseActiveTenantCookieValue: valid lowercase UUID -> same UUID', () => {
  assert.equal(parseActiveTenantCookieValue(LOWER_UUID), LOWER_UUID);
});

test('parseActiveTenantCookieValue: valid uppercase UUID -> lowercase UUID', () => {
  assert.equal(parseActiveTenantCookieValue(UPPER_UUID), LOWER_UUID);
});

test('parseActiveTenantCookieValue: valid UUID with surrounding spaces -> trimmed lowercase', () => {
  assert.equal(parseActiveTenantCookieValue(`  ${UPPER_UUID}  `), LOWER_UUID);
});

// ---------------------------------------------------------------------------
// Phase 1G Stage 3 - cookie write options factory (pure, security flags).
// ---------------------------------------------------------------------------

test('buildActiveTenantCookieOptions: httpOnly, sameSite lax, path / always set', () => {
  for (const isProd of [true, false]) {
    const options = buildActiveTenantCookieOptions(isProd);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/');
  }
});

test('buildActiveTenantCookieOptions: secure is true in production', () => {
  assert.equal(buildActiveTenantCookieOptions(true).secure, true);
});

test('buildActiveTenantCookieOptions: secure is false outside production', () => {
  assert.equal(buildActiveTenantCookieOptions(false).secure, false);
});
