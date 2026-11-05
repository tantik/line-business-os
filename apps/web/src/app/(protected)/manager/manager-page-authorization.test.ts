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
// DEBT-135: every Manager-only list read is one `api.manager_dashboard` RPC (loadManagerDashboard).
const DASHBOARD_READ = 'loadManagerDashboard(supabase, activeTenant.tenantId, location.locationId, {';
const PARTS_DECL = 'const managerParts: ManagerDashboardPart[] = [';

/** Index of a part name inside the `managerParts` list (or a later `managerParts.push(...)`), -1 if never requested. */
function partIndex(part: string): number {
  const declIndex = SOURCE.indexOf(PARTS_DECL);
  const readIndex = SOURCE.indexOf(DASHBOARD_READ);
  if (declIndex === -1 || readIndex === -1) return -1;
  const at = SOURCE.slice(declIndex, readIndex).indexOf(`'${part}'`);
  return at === -1 ? -1 : declIndex + at;
}

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
  const fetchIndex = SOURCE.indexOf(DASHBOARD_READ);
  const followUpIndex = SOURCE.indexOf('listAttendanceForManager(supabase, activeTenant.tenantId, { attendanceIds');

  assert.ok(gateIndex !== -1, 'the manager check must run and its result be held');
  assert.ok(denyIndex !== -1, 'a denied managerAccess must render UnauthorizedState');
  assert.ok(fetchIndex !== -1, 'the Manager-only dashboard read must still exist');
  assert.ok(partIndex('staff') !== -1, 'the Manager-only staff list must be one of its parts');
  assert.ok(
    gateIndex < denyIndex && denyIndex < fetchIndex && denyIndex < followUpIndex,
    'the permission check and its denial must both run strictly before any Manager-only Supabase read (the api.manager_dashboard read and the attendance follow-up), so no protected row ever reaches an unauthorized caller\'s RSC payload',
  );
  assert.ok(!SOURCE.includes('listWorkforceStaffForManager('), 'no separate staff read bypasses the batched read');
});

const ACTIVE_LOCATION_CALL = 'const activeLocation = await getActiveLocation(activeTenant.tenantId, activeTenant.locationId);';

test('the manager-access gate runs after location resolution (workforce.staff.manage is location-scoped)', () => {
  const locationIndex = SOURCE.indexOf(ACTIVE_LOCATION_CALL);
  const gateIndex = SOURCE.indexOf(ACCESS_CALL);
  assert.ok(locationIndex !== -1 && gateIndex !== -1 && locationIndex < gateIndex);
});

test('DEBT-139 L2: the page works on the ACTIVE store (getActiveLocation) and fails closed without one, never an arbitrary location', () => {
  const locationIndex = SOURCE.indexOf(ACTIVE_LOCATION_CALL);
  assert.ok(locationIndex !== -1, 'the store must come from getActiveLocation');
  const noLocationIndex = SOURCE.indexOf("if (activeLocation.status === 'no_location') {");
  assert.ok(noLocationIndex > locationIndex && noLocationIndex < SOURCE.indexOf(ACCESS_CALL), 'no active store -> blocked state before any read');
  assert.ok(
    !SOURCE.includes('tenantLocations.find((l) => l.isActive) ?? tenantLocations[0]') && !SOURCE.includes('pageContext.locations'),
    'the old lenient fallback (first active, else literally any location) must not reappear',
  );
  assert.ok(/locationOptions=\{toLocationSwitchOptions\(locationChoices\)\}/.test(SOURCE), 'the store switcher gets the choices');
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
  const exchangePartIndex = partIndex('shiftExchanges');
  assert.ok(exchangePartIndex !== -1, 'expected the shiftExchanges part (location-scoped, api.manager_dashboard) in the Manager page');
  assert.ok(
    gateIndex < denyIndex && denyIndex < exchangePartIndex && denyIndex < SOURCE.indexOf(DASHBOARD_READ),
    'no shift-exchange row (which can include another employee\'s reason text) may reach an unauthorized caller\'s RSC payload',
  );
  assert.ok(!SOURCE.includes('listShiftExchanges('), 'no separate shift-exchange read bypasses the batched read');
});
