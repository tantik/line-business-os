import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMyLocationRows, resolveActiveLocation, type MyLocation } from './active-location.js';
import {
  candidateLocationFor,
  formatActiveLocationCookieValue,
  parseActiveLocationCookieValue,
  buildActiveLocationCookieOptions,
} from './active-location-cookie.js';
import { safeWorkspaceReturnPath } from './location-return-path.js';

const T = '11111111-1111-1111-1111-111111111111';
const T2 = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function loc(locationId: string, locationName: string, access: MyLocation['access'], isActive = true): MyLocation {
  return { tenantId: T, locationId, locationName, timezone: 'Asia/Tokyo', isActive, access };
}

test('mapMyLocationRows maps rows and drops an unknown access value', () => {
  const rows = [
    { tenant_id: T, location_id: A, location_name: '本店', timezone: 'Asia/Tokyo', is_active: true, access: 'all' },
    { tenant_id: T, location_id: B, location_name: '駅前店', timezone: 'Asia/Tokyo', is_active: true, access: 'owner' },
  ];
  assert.deepEqual(mapMyLocationRows(rows), [loc(A, '本店', 'all')]);
});

test('no active location -> no_location (archived ones are never the working store)', () => {
  assert.deepEqual(resolveActiveLocation([]), { ok: false, reason: 'no_location' });
  assert.deepEqual(resolveActiveLocation([loc(A, 'Old', 'all', false)]), { ok: false, reason: 'no_location' });
});

test('a single store is chosen without any hint', () => {
  const r = resolveActiveLocation([loc(A, 'Main', 'staff')]);
  assert.equal(r.ok && r.location.locationId, A);
  assert.equal(r.ok && r.choices.length, 1);
});

test('STRICT requested: a choice wins; anything else is unauthorized, never a fallback', () => {
  const list = [loc(A, 'A store', 'all'), loc(B, 'B store', 'all'), loc(C, 'C closed', 'all', false)];
  const r = resolveActiveLocation(list, { requestedLocationId: B, candidateLocationId: A });
  assert.equal(r.ok && r.location.locationId, B);
  assert.deepEqual(resolveActiveLocation(list, { requestedLocationId: C }), { ok: false, reason: 'unauthorized' });
  assert.deepEqual(resolveActiveLocation(list, { requestedLocationId: '99999999-9999-9999-9999-999999999999' }), {
    ok: false,
    reason: 'unauthorized',
  });
  assert.deepEqual(resolveActiveLocation([], { requestedLocationId: A }), { ok: false, reason: 'unauthorized' });
});

test('LENIENT candidate (cookie): honoured when valid, ignored when stale', () => {
  const list = [loc(A, 'A store', 'all'), loc(B, 'B store', 'all')];
  const r1 = resolveActiveLocation(list, { candidateLocationId: B });
  assert.equal(r1.ok && r1.location.locationId, B);
  const r2 = resolveActiveLocation(list, { candidateLocationId: C });
  assert.equal(r2.ok && r2.location.locationId, A);
});

test('default: membership default location first, else strongest access, then name', () => {
  const list = [loc(A, 'Aoyama', 'staff'), loc(B, 'Bunkyo', 'manage'), loc(C, 'Chuo', 'manage')];
  const byDefault = resolveActiveLocation(list, { defaultLocationId: A });
  assert.equal(byDefault.ok && byDefault.location.locationId, A);
  const byAccess = resolveActiveLocation(list);
  assert.equal(byAccess.ok && byAccess.location.locationId, B, 'manage beats staff; Bunkyo < Chuo by name');
  assert.deepEqual(
    byAccess.ok && byAccess.choices.map((l) => l.locationName),
    ['Aoyama', 'Bunkyo', 'Chuo'],
    'choices are by name, active only',
  );
});

test('resolveActiveLocation does not mutate its input', () => {
  const list = [loc(B, 'B', 'all'), loc(A, 'A', 'all')];
  const before = JSON.stringify(list);
  resolveActiveLocation(list);
  assert.equal(JSON.stringify(list), before);
});

test('cookie value: per tenant, canonical UUIDs only, lowercase', () => {
  const value = formatActiveLocationCookieValue(T, A.toUpperCase());
  assert.equal(value, `${T}:${A}`);
  assert.deepEqual(parseActiveLocationCookieValue(` ${value} `), { tenantId: T, locationId: A });
  assert.equal(candidateLocationFor(value, T), A);
  assert.equal(candidateLocationFor(value, T2), null, 'other tenant -> no hint');
  for (const bad of [undefined, null, '', A, `${T}:`, `${T}:${A}:x`, `${T};${A}`, 'x'.repeat(500), `${T}:not-a-uuid`]) {
    assert.equal(parseActiveLocationCookieValue(bad as string | null | undefined), null, String(bad).slice(0, 30));
  }
});

test('cookie flags: httpOnly, lax, secure in production, path /, one year', () => {
  assert.deepEqual(buildActiveLocationCookieOptions(true), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 31536000,
  });
  assert.equal(buildActiveLocationCookieOptions(false).secure, false);
});

test('safeWorkspaceReturnPath keeps workspace paths only (no open redirect, no query)', () => {
  assert.equal(safeWorkspaceReturnPath('/manager'), '/manager');
  assert.equal(safeWorkspaceReturnPath('/manager?popup=inventory'), '/manager');
  assert.equal(safeWorkspaceReturnPath('/dashboard/workforce'), '/dashboard/workforce');
  for (const bad of ['//evil.example', 'https://evil.example/manager', '/manager/../admin', '/admin', '', null, 42, '/Manager', '/manager//x']) {
    assert.equal(safeWorkspaceReturnPath(bad), '/dashboard', String(bad));
  }
});
