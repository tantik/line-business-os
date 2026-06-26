import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listTenantMemberships } from './membership.js';

/**
 * Build a stub Supabase client whose query builder is thenable and resolves to
 * the given `{ data, error }`. Every chained method returns the same builder,
 * mirroring the PostgrestFilterBuilder shape used by `listTenantMemberships`.
 *
 * Phase 1E-3: the helper now reads the flat `api.my_tenant_memberships` view via
 * `.schema('api').from('my_tenant_memberships').select(...)` (no `.eq` filters;
 * the view is self-scoped server-side), so the stub only needs schema/from/select.
 */
function stubClient(result: { data: unknown; error: unknown }): SupabaseClient {
  const builder: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'select', 'eq']) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder as unknown as SupabaseClient;
}

/** A flat row as returned by the `api.my_tenant_memberships` view. */
const row = {
  tenant_id: 't1',
  tenant_slug: 'cafe',
  tenant_name: 'Demo Cafe',
  tenant_kind: 'demo',
  location_id: null,
  status: 'active',
};

test('listTenantMemberships maps flat api rows to typed memberships on success', async () => {
  const client = stubClient({ data: [row], error: null });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]!.tenantId, 't1');
    assert.equal(result.data[0]!.tenantSlug, 'cafe');
    assert.equal(result.data[0]!.tenantName, 'Demo Cafe');
    assert.equal(result.data[0]!.tenantKind, 'demo');
    assert.equal(result.data[0]!.locationId, null);
    assert.equal(result.data[0]!.status, 'active');
  }
});

test('listTenantMemberships maps the location scope from a flat api row', async () => {
  const client = stubClient({
    data: [{ ...row, location_id: 'loc-1' }],
    error: null,
  });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.equal(result.data[0]!.tenantId, 't1');
    assert.equal(result.data[0]!.locationId, 'loc-1');
  }
});

test('listTenantMemberships returns no_membership for an empty result', async () => {
  const client = stubClient({ data: [], error: null });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'no_membership');
});

test('listTenantMemberships returns memberships in deterministic (sorted) order', async () => {
  // Unordered rows as the Data API might return them; the helper must apply the
  // shared comparator (tenantName -> slug -> locationId(nulls last) -> tenantId).
  const client = stubClient({
    data: [
      { ...row, tenant_id: 't-c', tenant_name: 'Charlie', tenant_slug: 'c' },
      { ...row, tenant_id: 't-a', tenant_name: 'Alpha', tenant_slug: 'a' },
      { ...row, tenant_id: 't-b', tenant_name: 'Bravo', tenant_slug: 'b' },
    ],
    error: null,
  });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.deepEqual(
      result.data.map((m) => m.tenantId),
      ['t-a', 't-b', 't-c'],
    );
  }
});

test('listTenantMemberships maps a permission-denied error to unauthorized', async () => {
  const client = stubClient({
    data: null,
    error: { code: '42501', message: 'permission denied for table tenant_memberships' },
  });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'unauthorized');
});

test('listTenantMemberships maps an unknown error to unexpected_error', async () => {
  const client = stubClient({
    data: null,
    error: { code: 'XX000', message: 'boom' },
  });
  const result = await listTenantMemberships(client, 'user-1');
  assert.equal(result.status, 'unexpected_error');
  if (result.status === 'unexpected_error') assert.equal(result.message, 'boom');
});

// ---------------------------------------------------------------------------
// Phase 1F Stage 2A - offline Data API facade contract regression guard.
//
// These tests lock in HOW the helper talks to Supabase (not just what it
// returns) so a future refactor cannot silently drift off the safe app-facing
// `api` facade back onto raw `core`, add tenant/user `.eq()` filters, or change
// the projected column set. Fully offline: a recording stub captures the query
// builder calls; no network, no Cloud, no secrets, no service_role.
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * Like `stubClient`, but records every query-builder method call (method name +
 * arguments) so tests can assert the exact facade contract the helper uses.
 */
function recordingClient(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  // `order` is included so the contract test can prove the helper sorts in JS
  // (via the shared comparator) and never pushes ordering into the DB query.
  for (const method of ['schema', 'from', 'select', 'eq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { client: builder as unknown as SupabaseClient, calls };
}

const EXPECTED_SELECT = 'tenant_id, tenant_slug, tenant_name, tenant_kind, location_id, status';

test('listTenantMemberships reads through the api facade view with the exact projection', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantMemberships(client, 'user-1');

  const schemaCall = calls.find((c) => c.method === 'schema');
  assert.ok(schemaCall, 'expected a .schema() call');
  assert.deepEqual(schemaCall!.args, ['api'], ".schema() must target the 'api' facade");

  const fromCall = calls.find((c) => c.method === 'from');
  assert.ok(fromCall, 'expected a .from() call');
  assert.deepEqual(
    fromCall!.args,
    ['my_tenant_memberships'],
    ".from() must target the 'my_tenant_memberships' view",
  );

  const selectCall = calls.find((c) => c.method === 'select');
  assert.ok(selectCall, 'expected a .select() call');
  assert.deepEqual(
    selectCall!.args,
    [EXPECTED_SELECT],
    '.select() must project exactly the api.my_tenant_memberships columns',
  );
});

test('listTenantMemberships never touches raw core, never filters, never widens', async () => {
  const { client, calls } = recordingClient({ data: [row], error: null });
  await listTenantMemberships(client, 'user-1');

  // Must NOT reach raw `core` via the schema selector.
  const schemaTargets = calls.filter((c) => c.method === 'schema').flatMap((c) => c.args);
  assert.ok(!schemaTargets.includes('core'), "must never call .schema('core')");

  // Must NOT read the underlying core tables directly.
  const fromTargets = calls.filter((c) => c.method === 'from').flatMap((c) => c.args);
  assert.ok(
    !fromTargets.includes('tenant_memberships'),
    "must never call .from('tenant_memberships') (raw core table)",
  );
  assert.ok(!fromTargets.includes('tenants'), "must never call .from('tenants') (raw core table)");

  // The facade view is self-scoped server-side; the helper must add no client
  // tenant/user filters (which would imply trusting a client-supplied id).
  assert.ok(
    !calls.some((c) => c.method === 'eq'),
    'must not add any .eq() tenant/user filter; the view is self-scoped',
  );

  // Ordering is applied in JS via the shared comparator, never pushed into the
  // DB query (which would widen the query-builder contract).
  assert.ok(
    !calls.some((c) => c.method === 'order'),
    'must not add any .order() to the DB query; sorting is done in JS',
  );

  // Exactly one schema/from/select hop - no extra query surface.
  assert.equal(calls.filter((c) => c.method === 'schema').length, 1);
  assert.equal(calls.filter((c) => c.method === 'from').length, 1);
  assert.equal(calls.filter((c) => c.method === 'select').length, 1);
});

test('listTenantMemberships uses no service-role path (anon/RLS client only)', () => {
  // Guard against a future regression that imports the server-only service-role
  // client into this framework-agnostic helper. The browser bundle + this
  // helper must use the anon key + RLS only; service_role is server-only.
  const source = readFileSync(new URL('./membership.ts', import.meta.url), 'utf8');
  assert.ok(!/service_role/i.test(source), 'membership.ts must not reference service_role');
  assert.ok(
    !/createServiceClient/.test(source),
    'membership.ts must not import createServiceClient',
  );
  assert.ok(!/\.schema\(\s*['"]core['"]\s*\)/.test(source), "membership.ts must not select schema('core')");
});
