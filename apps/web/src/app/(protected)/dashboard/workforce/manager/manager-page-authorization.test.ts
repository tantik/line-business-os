import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards closing the Staff -> Manager dashboard
 * information-disclosure defect: the canonical `/dashboard/workforce/manager`
 * page previously ran `requireTenantContext` + the workforce-module-enabled
 * check only, so any tenant member (Staff included) reached the Manager-only
 * data fetch and UI. `hasManagerAccess` (`workforce.staff.manage`, the same
 * permission the preview Manager page's `authorizePreviewManagerPage` already
 * gates on) must run, and must deny, before that fetch.
 */
const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('WorkforceManagerPage calls hasManagerAccess with the resolved tenant and location', () => {
  assert.ok(
    /hasManagerAccess\(supabase, activeTenant\.tenantId, location\.locationId\)/.test(SOURCE),
    'the Manager page must call hasManagerAccess(supabase, activeTenant.tenantId, location.locationId)',
  );
});

test('WorkforceManagerPage returns UnauthorizedState when hasManagerAccess denies, before the Manager-only data fetch', () => {
  const gateIndex = SOURCE.indexOf('const managerAccess = await hasManagerAccess(');
  const denyIndex = SOURCE.indexOf("if (!managerAccess) return <UnauthorizedState />;");
  const fetchIndex = SOURCE.indexOf('listWorkforceStaffForManager(supabase, activeTenant.tenantId)');

  assert.ok(gateIndex !== -1, 'hasManagerAccess must be called and its result held');
  assert.ok(denyIndex !== -1, 'a denied managerAccess must render UnauthorizedState');
  assert.ok(fetchIndex !== -1, 'the Manager-only staff fetch must still exist');
  assert.ok(
    gateIndex < denyIndex && denyIndex < fetchIndex,
    'the permission check and its denial must both run strictly before any Manager-only Supabase read (listWorkforceStaffForManager and its siblings), so no protected row ever reaches an unauthorized caller\'s RSC payload',
  );
});

test('the manager-access gate runs after location resolution (workforce.staff.manage is location-scoped)', () => {
  const locationIndex = SOURCE.indexOf('const location = tenantLocations.find');
  const gateIndex = SOURCE.indexOf('hasManagerAccess(supabase, activeTenant.tenantId, location.locationId)');
  assert.ok(locationIndex !== -1 && gateIndex !== -1 && locationIndex < gateIndex);
});

test('the shift-exchange read (Cafe v2.1 Manager decision panel) also runs strictly after the managerAccess gate/denial, same as every other Manager-only read', () => {
  const gateIndex = SOURCE.indexOf('const managerAccess = await hasManagerAccess(');
  const denyIndex = SOURCE.indexOf("if (!managerAccess) return <UnauthorizedState />;");
  const exchangeFetchIndex = SOURCE.indexOf('listShiftExchanges(supabase, activeTenant.tenantId, location.locationId)');
  assert.ok(exchangeFetchIndex !== -1, 'expected a listShiftExchanges(supabase, activeTenant.tenantId, location.locationId) call in the Manager page');
  assert.ok(
    gateIndex < denyIndex && denyIndex < exchangeFetchIndex,
    'no shift-exchange row (which can include another employee\'s reason text) may reach an unauthorized caller\'s RSC payload',
  );
});
