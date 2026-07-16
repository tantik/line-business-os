import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2a - source-text regression guards for the manager
 * write security sequence (`resolvePreviewManagerContext`). This helper's own
 * dependencies (`resolvePreviewTenantContext`, `createClient`, `listTenantLocations`)
 * are not designed for dependency injection (same convention as
 * `preview/tenant.test.ts` for `resolvePreviewTenantContext` itself) - so
 * order-of-operations and safety properties are locked in as static-source
 * checks here, and exercised end to end only via the manifest-based build
 * verifier + manual/browser smoke (B2 plan Section 15).
 */
const SOURCE = readFileSync(new URL('./authorize.ts', import.meta.url), 'utf8');

test('resolvePreviewManagerContext resolves tenant context before checking module/location/permission', () => {
  const tenantIdx = SOURCE.indexOf('resolvePreviewTenantContext(');
  const moduleIdx = SOURCE.indexOf('resolvePreviewWorkforceModule(');
  const locationIdx = SOURCE.indexOf('resolveManagerLocation(');
  // `checkManagerPermission(` also matches this helper's own function
  // declaration (which necessarily precedes `resolvePreviewManagerContext` in
  // the file) - the property under test is about the CALL site inside
  // `resolvePreviewManagerContext`, so match the `await ...(` call form.
  const permissionIdx = SOURCE.indexOf('await checkManagerPermission(');
  assert.ok(tenantIdx >= 0 && moduleIdx >= 0 && locationIdx >= 0 && permissionIdx >= 0, 'expected all four resolution calls to be present');
  assert.ok(tenantIdx < moduleIdx, 'tenant resolution must run before the module check');
  assert.ok(moduleIdx < locationIdx, 'module check must run before location resolution');
  assert.ok(locationIdx < permissionIdx, 'location resolution must run before the permission pre-check (p_location_id must never be undefined)');
});

test('resolvePreviewManagerContext calls api.has_permission with the strict tenant id, the caller-supplied permission, and the resolved location id', () => {
  assert.ok(/schema\('api'\)\.rpc\('has_permission'/.test(SOURCE), 'must call the api.has_permission RPC facade');
  assert.ok(/p_tenant_id:\s*tenantId/.test(SOURCE), 'must pass the strict resolved tenantId as p_tenant_id');
  assert.ok(/p_permission:\s*permission/.test(SOURCE), 'must pass the caller-supplied permission key as p_permission');
  assert.ok(/p_location_id:\s*locationId/.test(SOURCE), 'must pass the resolved locationId as p_location_id (never null/undefined)');
});

test('checkManagerPermission fails closed to false on any RPC error or thrown exception, never true', () => {
  assert.ok(/if \(error\) return false/.test(SOURCE), 'an RPC error must fail closed to false');
  assert.ok(/catch \{\s*return false/.test(SOURCE), 'a thrown exception must fail closed to false');
  assert.ok(/return data === true/.test(SOURCE), 'only a literal true from the RPC is treated as permitted');
});

test('resolvePreviewManagerContext never reads the active-tenant cookie', () => {
  assert.ok(!/active-tenant-cookie/.test(SOURCE), 'authorize.ts must not import the active-tenant cookie module');
  assert.ok(!/getActiveTenantCookieValue|setActiveTenantCookie/.test(SOURCE), 'authorize.ts must not call any cookie read/write helper');
});

test('authorize.ts uses no service-role path (anon/RLS client only)', () => {
  assert.ok(!/service_role/i.test(SOURCE), 'authorize.ts must not reference service_role');
  assert.ok(!/createServiceClient/.test(SOURCE), 'authorize.ts must not import createServiceClient');
});

test('authorize.ts never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions|employee-line-links)/.test(SOURCE));
});

test('ManagerPermission is restricted to the three exact permission keys the B2a matrix requires', () => {
  assert.ok(/'workforce\.staff\.manage'\s*\|\s*'workforce\.shift\.write'\s*\|\s*'workforce\.request\.manage'/.test(SOURCE));
});

// ============================================================================
// Phase 1N-4C Slice B2b - resolvePreviewStaffContext
// ============================================================================

function fnBody(name: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `expected to find export async function ${name}(`);
  return SOURCE.slice(start);
}

test('resolvePreviewStaffContext resolves tenant context before checking module/profile/location', () => {
  const body = fnBody('resolvePreviewStaffContext');
  const tenantIdx = body.indexOf('resolvePreviewTenantContext(');
  const moduleIdx = body.indexOf('resolvePreviewWorkforceModule(');
  const profileIdx = body.indexOf('getMyWorkforceStaffProfile(');
  const locationIdx = body.indexOf('resolveStaffLocation(');
  assert.ok(tenantIdx >= 0 && moduleIdx >= 0 && profileIdx >= 0 && locationIdx >= 0, 'expected all four resolution calls to be present');
  assert.ok(tenantIdx < moduleIdx, 'tenant resolution must run before the module check');
  assert.ok(moduleIdx < profileIdx, 'module check must run before profile resolution');
  assert.ok(profileIdx < locationIdx, 'profile resolution must run before location resolution');
});

test('resolvePreviewStaffContext never calls the manager permission RPC (staff authorization is self-binding + RLS, not a permission pre-check)', () => {
  const body = fnBody('resolvePreviewStaffContext');
  assert.ok(!/checkManagerPermission\(/.test(body));
  assert.ok(!/has_permission/.test(body));
});

test('resolvePreviewStaffContext fails closed to no_profile when the caller has no employee binding', () => {
  const body = fnBody('resolvePreviewStaffContext');
  assert.ok(/if \(!profileResult\.data\)/.test(body));
  const idx = body.indexOf('if (!profileResult.data)');
  const snippet = body.slice(idx, idx + 120);
  assert.ok(/status: 'no_profile'/.test(snippet));
});

test('resolvePreviewStaffContext fails closed to no_profile (never falls back to another location) when resolveStaffLocation returns null', () => {
  const body = fnBody('resolvePreviewStaffContext');
  assert.ok(/if \(!location\)/.test(body));
  const idx = body.indexOf('if (!location)');
  const snippet = body.slice(idx, idx + 120);
  assert.ok(/status: 'no_profile'/.test(snippet));
});

test('resolvePreviewStaffContext derives employeeId from profile.staffId and locationId/timeZone from the resolved location, never from a client-supplied value', () => {
  const body = fnBody('resolvePreviewStaffContext');
  assert.ok(/employeeId:\s*profile\.staffId/.test(body));
  assert.ok(/locationId:\s*location\.locationId/.test(body));
  assert.ok(/timeZone:\s*location\.timezone/.test(body));
});

test('resolvePreviewStaffContext never reads the active-tenant cookie', () => {
  const body = fnBody('resolvePreviewStaffContext');
  assert.ok(!/getActiveTenantCookieValue|setActiveTenantCookie/.test(body));
});
