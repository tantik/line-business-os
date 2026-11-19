import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mapPlatformLocationResponse,
  parseCreatePlatformLocationForm,
  parseRenamePlatformLocationForm,
  parseSetPlatformLocationActiveForm,
  platformLocationRequestBody,
  PLATFORM_LOCATION_ERROR_CODES,
} from './platform-location.js';

const T = '11111111-1111-1111-1111-111111111111';
const L = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const REQ = '0f8fad5b-d9cb-469f-a165-70867728950e';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// --- input -------------------------------------------------------------------------

test('create form: tenant id, cabinet name rule (trim, 1-60), timezone default Asia/Tokyo', () => {
  assert.deepEqual(parseCreatePlatformLocationForm(form({ tenantId: T, name: '  駅前店　' })), {
    ok: true,
    value: { action: 'create', tenantId: T, name: '駅前店', timezone: 'Asia/Tokyo' },
  });
  assert.deepEqual(parseCreatePlatformLocationForm(form({ tenantId: T, name: 'X', timezone: 'UTC' })), {
    ok: true,
    value: { action: 'create', tenantId: T, name: 'X', timezone: 'UTC' },
  });
  assert.deepEqual(parseCreatePlatformLocationForm(form({ tenantId: 'nope', name: 'X' })), { ok: false, code: 'invalid_input' });
  assert.deepEqual(parseCreatePlatformLocationForm(form({ name: 'X' })), { ok: false, code: 'invalid_input' });
  for (const bad of ['', '   ', 'a'.repeat(61), '店\n舗']) {
    assert.deepEqual(parseCreatePlatformLocationForm(form({ tenantId: T, name: bad })), { ok: false, code: 'invalid_name' }, JSON.stringify(bad));
  }
  assert.deepEqual(parseCreatePlatformLocationForm(form({ tenantId: T, name: 'X', timezone: 'Mars/Olympus' })), { ok: false, code: 'invalid_timezone' });
});

test('rename form: location id + name', () => {
  assert.deepEqual(parseRenamePlatformLocationForm(form({ locationId: L, name: '本店' })), {
    ok: true,
    value: { action: 'rename', locationId: L.toLowerCase(), name: '本店' },
  });
  assert.deepEqual(parseRenamePlatformLocationForm(form({ locationId: 'x', name: '本店' })), { ok: false, code: 'invalid_input' });
  assert.deepEqual(parseRenamePlatformLocationForm(form({ locationId: L, name: '' })), { ok: false, code: 'invalid_name' });
});

test('set_active form: isActive must be exactly true / false (a missing flag never archives)', () => {
  assert.deepEqual(parseSetPlatformLocationActiveForm(form({ locationId: L, isActive: 'false' })), {
    ok: true,
    value: { action: 'set_active', locationId: L.toLowerCase(), isActive: false },
  });
  assert.equal(parseSetPlatformLocationActiveForm(form({ locationId: L, isActive: 'true' })).ok, true);
  const bads: Record<string, string>[] = [{ locationId: L }, { locationId: L, isActive: '0' }, { locationId: L, isActive: 'FALSE' }, { isActive: 'false' }];
  for (const bad of bads) {
    assert.deepEqual(parseSetPlatformLocationActiveForm(form(bad)), { ok: false, code: 'invalid_input' }, JSON.stringify(bad));
  }
});

test('request body: request_id + action + that action keys only, never an actor', () => {
  assert.deepEqual(platformLocationRequestBody(REQ, { action: 'create', tenantId: T, name: 'X', timezone: 'Asia/Tokyo' }), {
    request_id: REQ,
    action: 'create',
    tenant_id: T,
    name: 'X',
    timezone: 'Asia/Tokyo',
  });
  assert.deepEqual(platformLocationRequestBody(REQ, { action: 'rename', locationId: L, name: 'Y' }), { request_id: REQ, action: 'rename', location_id: L, name: 'Y' });
  assert.deepEqual(platformLocationRequestBody(REQ, { action: 'set_active', locationId: L, isActive: true }), {
    request_id: REQ,
    action: 'set_active',
    location_id: L,
    is_active: true,
  });
});

// --- response mapping ------------------------------------------------------------------

test('success: location id (lowercased), changed, is_active', () => {
  assert.deepEqual(mapPlatformLocationResponse(200, { request_id: REQ, action: 'create', location_id: L, tenant_id: T, changed: true }), {
    status: 'success',
    locationId: L.toLowerCase(),
    changed: true,
    isActive: null,
  });
  assert.deepEqual(mapPlatformLocationResponse(200, { location_id: L, changed: false, is_active: false }), {
    status: 'success',
    locationId: L.toLowerCase(),
    changed: false,
    isActive: false,
  });
  assert.deepEqual(mapPlatformLocationResponse(200, { changed: true }), { status: 'error', code: 'unexpected' }, 'no location id = not a success');
  assert.deepEqual(mapPlatformLocationResponse(200, null), { status: 'error', code: 'unexpected' });
});

test('every function error code maps to a UI code', () => {
  const cases: [number, string, string][] = [
    [409, 'location_limit_reached', 'limit_reached'],
    [409, 'location_name_taken', 'name_taken'],
    [409, 'last_active_location', 'last_active_location'],
    [409, 'location_has_active_staff', 'has_active_staff'],
    [409, 'tenant_not_active', 'tenant_not_active'],
    [404, 'location_not_found', 'location_not_found'],
    [422, 'invalid_location_name', 'invalid_name'],
    [422, 'invalid_timezone', 'invalid_timezone'],
    [422, 'invalid_argument', 'invalid_input'],
    [400, 'unknown_field', 'invalid_input'],
    [400, 'invalid_field', 'invalid_input'],
    [400, 'invalid_action', 'invalid_input'],
    [400, 'invalid_request_id', 'invalid_input'],
    [400, 'invalid_body', 'invalid_input'],
    [400, 'invalid_json_body', 'invalid_input'],
    [403, 'not_platform_staff', 'not_staff'],
    [401, 'not_authenticated', 'session_expired'],
    [401, 'missing_bearer_token', 'session_expired'],
    [500, 'missing_configuration', 'unavailable'],
    [500, 'permission_check_failed', 'unavailable'],
    [500, 'db_error', 'unexpected'],
    [500, 'unexpected_result', 'unexpected'],
  ];
  for (const [status, error, code] of cases) {
    assert.deepEqual(mapPlatformLocationResponse(status, { error, request_id: REQ }), { status: 'error', code }, `${status} ${error}`);
  }
});

test('no / unknown body: the HTTP status decides; network failure = unavailable', () => {
  assert.deepEqual(mapPlatformLocationResponse(null, null), { status: 'error', code: 'unavailable' });
  assert.deepEqual(mapPlatformLocationResponse(404, null), { status: 'error', code: 'unavailable' }, 'function not deployed');
  assert.deepEqual(mapPlatformLocationResponse(503, 'Service Unavailable'), { status: 'error', code: 'unavailable' });
  assert.deepEqual(mapPlatformLocationResponse(401, null), { status: 'error', code: 'session_expired' });
  assert.deepEqual(mapPlatformLocationResponse(403, { error: 'something new' }), { status: 'error', code: 'not_staff' });
  assert.deepEqual(mapPlatformLocationResponse(500, { error: 'Raw DB text: duplicate key' }), { status: 'error', code: 'unexpected' });
  assert.deepEqual(mapPlatformLocationResponse(418, {}), { status: 'error', code: 'unexpected' });
});

test('every mapped result code is a declared code', () => {
  const declared = new Set<string>(PLATFORM_LOCATION_ERROR_CODES);
  for (const status of [400, 401, 403, 404, 409, 422, 500, 502]) {
    for (const error of ['location_limit_reached', 'location_name_taken', 'unknown', undefined]) {
      const r = mapPlatformLocationResponse(status, error ? { error } : {});
      assert.ok(r.status === 'error' && declared.has(r.code));
    }
  }
});

// --- action / client shape (source guards: 'use server' / 'server-only' modules are not importable here) ---

test('actions: validate, then the platform-staff gate (fail closed), then the caller token, then the function', () => {
  const src = read('./platform-location-actions.ts');
  assert.ok(src.startsWith("'use server';"));
  const runBody = src.slice(src.indexOf('async function run('));
  const gate = runBody.indexOf("if (!(await isPlatformStaff(supabase))) return { status: 'error', code: 'not_staff' };");
  const session = runBody.indexOf('supabase.auth.getSession()');
  const call = runBody.indexOf('callPlatformLocation(sessionData.session.access_token');
  assert.ok(gate > 0 && session > gate && call > session, 'staff gate -> session -> function');
  assert.ok(/if \(result\.status === 'success'\) revalidatePath\('\/admin\/tenants'\);/.test(runBody), 'revalidate on success only');
  for (const fn of ['createPlatformLocation', 'renamePlatformLocation', 'setPlatformLocationActive']) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const parse = body.indexOf('parse');
    const run = body.indexOf('return run(');
    assert.ok(parse > 0 && run > parse, `${fn}: input parsed before anything else`);
  }
});

test('no privileged key on the console store path; the client forwards the caller token only', () => {
  for (const rel of ['./platform-location-actions.ts', './platform-location-client.ts', './platform-location.ts', './tenant-locations.ts', '../../app/(protected)/admin/tenants/tenant-stores.tsx']) {
    const src = read(rel);
    assert.ok(!/service_role|SERVICE_ROLE|createServiceClient|SECRET_KEY/i.test(src), `${rel} must not reference a privileged key`);
  }
  const client = read('./platform-location-client.ts');
  assert.ok(client.startsWith("import 'server-only';"));
  assert.ok(client.includes('Authorization: `Bearer ${accessToken}`'));
  assert.ok(client.includes('/functions/v1/platform-location'));
  assert.ok(client.includes('JSON.stringify(platformLocationRequestBody(requestId, command))'));
  assert.ok(!/actor/i.test(read('./platform-location.ts').slice(read('./platform-location.ts').indexOf('export function platformLocationRequestBody'))), 'never an actor field');
});
