import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectPreviewMembership } from './tenant-select.js';
import type { TenantMembership } from '@/lib/tenant/types';

function membership(overrides: Partial<TenantMembership> = {}): TenantMembership {
  return {
    tenantId: 't-1',
    tenantSlug: 'mame-to-cha',
    tenantName: 'Mame To Cha',
    tenantKind: 'client',
    locationId: null,
    status: 'active',
    ...overrides,
  };
}

test('selectPreviewMembership finds the mame-to-cha membership among several', () => {
  const memberships = [
    membership({ tenantId: 'other', tenantSlug: 'some-other-tenant' }),
    membership({ tenantId: 't-1' }),
  ];
  const result = selectPreviewMembership(memberships);
  assert.ok(result);
  assert.equal(result!.tenantId, 't-1');
});

test('selectPreviewMembership fails closed when there is no membership at all', () => {
  assert.equal(selectPreviewMembership([]), null);
});

test('selectPreviewMembership fails closed for a foreign-tenant-only membership set', () => {
  const memberships = [membership({ tenantId: 'other', tenantSlug: 'mame-to-cha-tokyo' })];
  assert.equal(selectPreviewMembership(memberships), null);
});

test('selectPreviewMembership ignores a non-active mame-to-cha membership', () => {
  const memberships = [membership({ status: 'invited' })];
  assert.equal(selectPreviewMembership(memberships), null);
});

test('selectPreviewMembership never matches the seeded sales-demo tenant mame-to-cha-tokyo', () => {
  const memberships = [membership({ tenantSlug: 'mame-to-cha-tokyo' })];
  assert.equal(selectPreviewMembership(memberships), null);
});

// ---------------------------------------------------------------------------
// Source-text regression guards for the impure orchestration
// (`resolvePreviewTenantContext`). This helper calls into `requireTenantContext`
// / `createClient`, which are not designed for dependency injection (same as
// the rest of `lib/tenant/context.ts` - see `select.test.ts` for the fully
// unit-tested pure strict/lenient selection logic these guards rely on).
// These regex guards lock in the two safety properties the architecture plan
// requires: the cookie is never read, and the tenant id is always passed
// explicitly (the strict path).
// ---------------------------------------------------------------------------

test('resolvePreviewTenantContext never imports the active-tenant cookie module or reads/sets the cookie', () => {
  const source = readFileSync(new URL('./tenant.ts', import.meta.url), 'utf8');
  assert.ok(!/active-tenant-cookie/.test(source), 'tenant.ts must not import the active-tenant cookie module');
  assert.ok(!/getActiveTenantCookieValue|setActiveTenantCookie/.test(source), 'tenant.ts must not call any cookie read/write helper');
});

test('resolvePreviewTenantContext calls requireTenantContext with an explicit tenantId (strict path)', () => {
  const source = readFileSync(new URL('./tenant.ts', import.meta.url), 'utf8');
  assert.ok(
    /requireTenantContext\(\{\s*tenantId:/.test(source),
    'resolvePreviewTenantContext must call requireTenantContext({ tenantId: ... }), never the bare lenient form',
  );
});

test('tenant.ts uses no service-role path (anon/RLS client only)', () => {
  const source = readFileSync(new URL('./tenant.ts', import.meta.url), 'utf8');
  assert.ok(!/service_role/i.test(source), 'tenant.ts must not reference service_role');
  assert.ok(!/createServiceClient/.test(source), 'tenant.ts must not import createServiceClient');
});

// ---------------------------------------------------------------------------
// Performance Fix Phase 1 - resolvePreviewTenantContext must resolve
// getUser()/listTenantMemberships() exactly once, then pass that same result
// through to requireTenantContext -> getActiveTenantContext instead of
// letting it re-issue both reads a second time for the same request.
// ---------------------------------------------------------------------------

test('resolvePreviewTenantContext calls getUserFromClient and listTenantMemberships exactly once each (no duplicate resolution within this function)', () => {
  const source = readFileSync(new URL('./tenant.ts', import.meta.url), 'utf8');
  const getUserCalls = source.match(/getUserFromClient\(/g) ?? [];
  const membershipCalls = source.match(/listTenantMemberships\(/g) ?? [];
  assert.equal(getUserCalls.length, 1, 'tenant.ts must call getUserFromClient exactly once');
  assert.equal(membershipCalls.length, 1, 'tenant.ts must call listTenantMemberships exactly once');
});

test('resolvePreviewTenantContext passes the already-resolved user and memberships through to requireTenantContext, so getActiveTenantContext does not re-fetch them', () => {
  const source = readFileSync(new URL('./tenant.ts', import.meta.url), 'utf8');
  assert.ok(
    /requireTenantContext\(\{\s*\n?\s*tenantId:\s*membership\.tenantId,\s*\n?\s*user,\s*\n?\s*memberships:\s*memberships\.data,\s*\n?\s*\}\)/.test(
      source,
    ),
    'resolvePreviewTenantContext must call requireTenantContext with { tenantId, user, memberships } - not just tenantId',
  );
});
