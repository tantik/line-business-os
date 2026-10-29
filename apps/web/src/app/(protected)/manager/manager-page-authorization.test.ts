import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards closing the Staff -> Manager dashboard
 * information-disclosure defect: the canonical `/manager`
 * page previously ran `requireTenantContext` + the workforce-module-enabled
 * check only, so any tenant member (Staff included) reached the Manager-only
 * data fetch and UI. `hasManagerAccess` (`workforce.staff.manage`, the same
 * permission the preview Manager page's `authorizePreviewManagerPage` already
 * gates on) must run, and must deny, before that fetch.
 */
const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

// DEBT-124: the gate is `workforce.staff.manage` at the resolved location,
// answered by the one batched `api.my_access` call (loadMyAccess).
const ACCESS_CALL = 'loadMyAccess(supabase, activeTenant.tenantId, location.locationId, {';
const GATE = 'const managerAccess = access.location(MANAGER_ACCESS_PERMISSION);';

test('WorkforceManagerPage checks workforce.staff.manage at the resolved tenant and location', () => {
  const callIndex = SOURCE.indexOf(ACCESS_CALL);
  assert.ok(callIndex !== -1, 'the Manager page must call loadMyAccess with the resolved tenant and location');
  const specEnd = SOURCE.indexOf('});', callIndex);
  assert.ok(
    /location: \[MANAGER_ACCESS_PERMISSION/.test(SOURCE.slice(callIndex, specEnd)),
    'workforce.staff.manage must be asked location-scoped',
  );
  assert.ok(SOURCE.indexOf(GATE) > callIndex, 'the gate must read the batched answer');
});

test('WorkforceManagerPage returns UnauthorizedState when the manager check denies, before the Manager-only data fetch', () => {
  const gateIndex = SOURCE.indexOf(GATE);
  const denyIndex = SOURCE.indexOf("if (!managerAccess) return <UnauthorizedState />;");
  const fetchIndex = SOURCE.indexOf('listWorkforceStaffForManager(supabase, activeTenant.tenantId)');

  assert.ok(gateIndex !== -1, 'the manager check must run and its result be held');
  assert.ok(denyIndex !== -1, 'a denied managerAccess must render UnauthorizedState');
  assert.ok(fetchIndex !== -1, 'the Manager-only staff fetch must still exist');
  assert.ok(
    gateIndex < denyIndex && denyIndex < fetchIndex,
    'the permission check and its denial must both run strictly before any Manager-only Supabase read (listWorkforceStaffForManager and its siblings), so no protected row ever reaches an unauthorized caller\'s RSC payload',
  );
});

test('the manager-access gate runs after location resolution (workforce.staff.manage is location-scoped)', () => {
  const locationIndex = SOURCE.indexOf('const activeTenantLocations = tenantLocations.filter');
  const gateIndex = SOURCE.indexOf(ACCESS_CALL);
  assert.ok(locationIndex !== -1 && gateIndex !== -1 && locationIndex < gateIndex);
});

test('LOC-1: location resolution fails closed on 0 or more than 1 active location, never silently substitutes an arbitrary one', () => {
  assert.ok(
    /const activeTenantLocations = tenantLocations\.filter\(\(l\) => l\.isActive\);/.test(SOURCE),
    'must compute the active-location set explicitly',
  );
  assert.ok(
    /const location = activeTenantLocations\.length === 1 \? activeTenantLocations\[0\] : undefined;/.test(SOURCE),
    'must resolve location only when exactly one active location exists, never falling back to tenantLocations[0] regardless of active status',
  );
  assert.ok(
    !SOURCE.includes('tenantLocations.find((l) => l.isActive) ?? tenantLocations[0]'),
    'the old lenient fallback (first active, else literally any location) must not reappear',
  );
});

test('4B-4b: the 管理者 action is offered only to the Owner, from the batched access answer (no extra round trip)', () => {
  assert.ok(/const canAppointAdmins = access\.isTenantOwner;/.test(SOURCE), 'the Owner flag must come from api.my_access');
  assert.ok(!SOURCE.includes('isTenantOwner(supabase'), 'no separate is_tenant_owner round trip');
  assert.ok(/canAppointAdmins=\{canAppointAdmins\}/.test(SOURCE), 'the Owner flag must be passed down as canAppointAdmins');
  const clientSource = readFileSync(new URL('./manage-staff-popup.tsx', import.meta.url), 'utf8');
  assert.ok(
    /\{canAppointAdmins && detailStaff\.staffId !== selfStaffId \? <AdminRoleSection /.test(clientSource),
    'the admin section must render only when canAppointAdmins, and never on the Owner\'s own row',
  );
});

test('the shift-exchange read (Cafe v2.1 Manager decision panel) also runs strictly after the managerAccess gate/denial, same as every other Manager-only read', () => {
  const gateIndex = SOURCE.indexOf(GATE);
  const denyIndex = SOURCE.indexOf("if (!managerAccess) return <UnauthorizedState />;");
  const exchangeFetchIndex = SOURCE.indexOf('listShiftExchanges(supabase, activeTenant.tenantId, location.locationId)');
  assert.ok(exchangeFetchIndex !== -1, 'expected a listShiftExchanges(supabase, activeTenant.tenantId, location.locationId) call in the Manager page');
  assert.ok(
    gateIndex < denyIndex && denyIndex < exchangeFetchIndex,
    'no shift-exchange row (which can include another employee\'s reason text) may reach an unauthorized caller\'s RSC payload',
  );
});
