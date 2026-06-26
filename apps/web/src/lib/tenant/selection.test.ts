import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSelectedTenantId, TENANT_SELECT_FIELD } from './selection.js';

const LOWER_UUID = '0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const UPPER_UUID = LOWER_UUID.toUpperCase();

/** Minimal FormData stub exposing only the `get` the parser relies on. */
function formWith(value: unknown): FormData {
  return {
    get: (name: string) => (name === TENANT_SELECT_FIELD ? value : null),
  } as unknown as FormData;
}

test('TENANT_SELECT_FIELD has the expected name', () => {
  assert.equal(TENANT_SELECT_FIELD, 'tenantId');
});

test('parseSelectedTenantId: missing field -> null', () => {
  assert.equal(parseSelectedTenantId(formWith(null)), null);
});

test('parseSelectedTenantId: non-string (File-like) value -> null', () => {
  assert.equal(parseSelectedTenantId(formWith({ name: 'file.txt' })), null);
});

test('parseSelectedTenantId: empty string -> null', () => {
  assert.equal(parseSelectedTenantId(formWith('')), null);
});

test('parseSelectedTenantId: whitespace string -> null', () => {
  assert.equal(parseSelectedTenantId(formWith('   ')), null);
});

test('parseSelectedTenantId: malformed value -> null', () => {
  assert.equal(parseSelectedTenantId(formWith('not-a-uuid')), null);
  assert.equal(parseSelectedTenantId(formWith('12345')), null);
});

test('parseSelectedTenantId: over-length value -> null', () => {
  const overLength = `${LOWER_UUID}${' '.repeat(64)}`;
  assert.equal(parseSelectedTenantId(formWith(overLength)), null);
});

test('parseSelectedTenantId: valid lowercase UUID -> same', () => {
  assert.equal(parseSelectedTenantId(formWith(LOWER_UUID)), LOWER_UUID);
});

test('parseSelectedTenantId: valid uppercase UUID -> lowercase', () => {
  assert.equal(parseSelectedTenantId(formWith(UPPER_UUID)), LOWER_UUID);
});

test('parseSelectedTenantId: valid whitespace-padded UUID -> trimmed lowercase', () => {
  assert.equal(parseSelectedTenantId(formWith(`  ${UPPER_UUID}  `)), LOWER_UUID);
});

// ---------------------------------------------------------------------------
// Source guard: the tenant Server Action must never reach for service_role.
// The app path is anon key + RLS only; service_role is server-only (api/worker).
// ---------------------------------------------------------------------------

test('tenant actions.ts uses no service-role path (anon/RLS only)', () => {
  const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');
  assert.ok(!/service_role/i.test(source), 'actions.ts must not reference service_role');
  assert.ok(!/SUPABASE_SERVICE_ROLE/.test(source), 'actions.ts must not read SUPABASE_SERVICE_ROLE');
  assert.ok(
    !/createServiceClient/.test(source),
    'actions.ts must not import createServiceClient',
  );
});
