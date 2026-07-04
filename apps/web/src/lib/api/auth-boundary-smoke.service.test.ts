import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateAuthBoundarySmoke,
  AUTH_BOUNDARY_SMOKE_PERMISSION,
  type AuthBoundarySmokeDeps,
} from './auth-boundary-smoke.service.js';

const VALID_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const VALID_LOCATION_ID = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'test-access-token';

interface RecordedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

function stubDeps(overrides: Partial<AuthBoundarySmokeDeps> = {}): {
  deps: AuthBoundarySmokeDeps;
  calls: RecordedFetchCall[];
} {
  const calls: RecordedFetchCall[] = [];
  const deps: AuthBoundarySmokeDeps = {
    getAccessToken: async () => TOKEN,
    apiBaseUrl: 'http://localhost:3001',
    fetchImpl: (async (url: string, init?: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }) as typeof fetch,
    ...overrides,
  };
  return { deps, calls };
}

test('missing API internal URL maps to config_missing', async () => {
  const { deps } = stubDeps({ apiBaseUrl: undefined });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'config_missing' });
});

test('invalid API internal URL maps to config_missing without calling fetch', async () => {
  for (const badBaseUrl of ['not-a-url', 'localhost:3001', '://missing-scheme', '   ']) {
    const { deps, calls } = stubDeps({ apiBaseUrl: badBaseUrl });
    const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
    assert.deepEqual(result, { status: 'config_missing' }, `expected config_missing for "${badBaseUrl}"`);
    assert.equal(calls.length, 0, `must not call fetch for invalid base URL "${badBaseUrl}"`);
  }
});

test('missing session/access token maps to unauthenticated', async () => {
  const { deps, calls } = stubDeps({ getAccessToken: async () => null });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'unauthenticated' });
  assert.equal(calls.length, 0, 'must not call fetch when there is no access token');
});

test('missing tenant_id maps to bad_request without calling fetch', async () => {
  const { deps, calls } = stubDeps();
  const result = await evaluateAuthBoundarySmoke({ tenantId: '' }, deps);
  assert.deepEqual(result, { status: 'bad_request' });
  assert.equal(calls.length, 0);
});

test('invalid tenant_id shape maps to bad_request without calling fetch', async () => {
  const { deps, calls } = stubDeps();
  const result = await evaluateAuthBoundarySmoke({ tenantId: 'not-a-uuid' }, deps);
  assert.deepEqual(result, { status: 'bad_request' });
  assert.equal(calls.length, 0);
});

test('invalid location_id shape maps to bad_request without calling fetch', async () => {
  const { deps, calls } = stubDeps();
  const result = await evaluateAuthBoundarySmoke(
    { tenantId: VALID_TENANT_ID, locationId: 'not-a-uuid' },
    deps,
  );
  assert.deepEqual(result, { status: 'bad_request' });
  assert.equal(calls.length, 0);
});

test('successful 200 fetch maps to ok with the checked permission and known ids', async () => {
  const { deps } = stubDeps();
  const result = await evaluateAuthBoundarySmoke(
    { tenantId: VALID_TENANT_ID, locationId: VALID_LOCATION_ID },
    deps,
  );
  assert.deepEqual(result, {
    status: 'ok',
    permission: AUTH_BOUNDARY_SMOKE_PERMISSION,
    tenantId: VALID_TENANT_ID,
    locationId: VALID_LOCATION_ID,
  });
});

test('ok result omits location id when none was supplied', async () => {
  const { deps } = stubDeps();
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, {
    status: 'ok',
    permission: AUTH_BOUNDARY_SMOKE_PERMISSION,
    tenantId: VALID_TENANT_ID,
    locationId: null,
  });
});

test('401 response maps to unauthenticated', async () => {
  const { deps } = stubDeps({
    fetchImpl: (async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })) as typeof fetch,
  });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'unauthenticated' });
});

test('400 response maps to bad_request', async () => {
  const { deps } = stubDeps({
    fetchImpl: (async () => new Response(JSON.stringify({ error: 'bad_request' }), { status: 400 })) as typeof fetch,
  });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'bad_request' });
});

test('403 response maps to forbidden', async () => {
  const { deps } = stubDeps({
    fetchImpl: (async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })) as typeof fetch,
  });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'forbidden' });
});

test('500 response maps to unexpected_error', async () => {
  const { deps } = stubDeps({
    fetchImpl: (async () => new Response(JSON.stringify({ error: 'unexpected_error' }), { status: 500 })) as typeof fetch,
  });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'unexpected_error' });
});

test('a thrown fetch (network failure) maps to unexpected_error', async () => {
  const { deps } = stubDeps({
    fetchImpl: (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch,
  });
  const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.deepEqual(result, { status: 'unexpected_error' });
});

test('Authorization header carries the bearer token on the outgoing fetch', async () => {
  const { deps, calls } = stubDeps();
  await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
  assert.equal(calls.length, 1);
  const headers = calls[0]!.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
});

test('the outgoing request targets /auth-boundary/test with tenant_id and location_id query params', async () => {
  const { deps, calls } = stubDeps();
  await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID, locationId: VALID_LOCATION_ID }, deps);
  const url = new URL(calls[0]!.url);
  assert.equal(url.pathname, '/auth-boundary/test');
  assert.equal(url.searchParams.get('tenant_id'), VALID_TENANT_ID);
  assert.equal(url.searchParams.get('location_id'), VALID_LOCATION_ID);
});

test('no access token ever appears in any returned result', async () => {
  for (const overrides of [
    {},
    { fetchImpl: (async () => new Response('{}', { status: 401 })) as typeof fetch },
    { fetchImpl: (async () => new Response('{}', { status: 403 })) as typeof fetch },
    { fetchImpl: (async () => new Response('{}', { status: 500 })) as typeof fetch },
  ]) {
    const { deps } = stubDeps(overrides);
    const result = await evaluateAuthBoundarySmoke({ tenantId: VALID_TENANT_ID }, deps);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  }
});

test('the server-only wrapper never reads a NEXT_PUBLIC_ var and is guarded by server-only', () => {
  const source = readFileSync(new URL('./auth-boundary-smoke.ts', import.meta.url), 'utf8');
  assert.ok(!/process\.env\.NEXT_PUBLIC/.test(source));
  assert.ok(source.includes("import 'server-only'"));
  assert.ok(source.includes('process.env.LINE_OS_API_INTERNAL_URL'));
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
});

test('the pure core never reads process.env or references service_role', () => {
  const source = readFileSync(new URL('./auth-boundary-smoke.service.ts', import.meta.url), 'utf8');
  assert.ok(!/process\.env/.test(source));
  assert.ok(!new RegExp('service' + '_role', 'i').test(source));
  assert.ok(!new RegExp('create' + 'ServiceClient').test(source));
});
