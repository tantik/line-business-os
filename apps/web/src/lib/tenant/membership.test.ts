import { test } from 'node:test';
import assert from 'node:assert/strict';
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
