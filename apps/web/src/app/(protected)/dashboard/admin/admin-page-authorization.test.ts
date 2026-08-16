import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards closing Defect A (Cafe v2.1 Product/UX
 * Reconciliation Audit §8/§12): the canonical `/dashboard/admin` page
 * previously ran `requireTenantContext()` only, so any tenant member
 * (Staff included) reached the admin shell. `hasTenantAdminAccess`
 * (`core.member.invite`, the same permission `api.my_tenant_admin_members`
 * already gates on in SQL) must run, and must deny, before that read.
 */
const PAGE_SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const CLIENT_SOURCE = readFileSync(new URL('./admin-dashboard-client.tsx', import.meta.url), 'utf8');
const I18N_SOURCE = readFileSync(new URL('./admin-i18n.ts', import.meta.url), 'utf8');

test('TenantAdminPage calls hasTenantAdminAccess with the resolved tenant', () => {
  assert.ok(
    /hasTenantAdminAccess\(supabase, activeTenant\.tenantId\)/.test(PAGE_SOURCE),
    'the Admin page must call hasTenantAdminAccess(supabase, activeTenant.tenantId)',
  );
});

test('TenantAdminPage returns UnauthorizedState when hasTenantAdminAccess denies, before the members fetch', () => {
  const gateIndex = PAGE_SOURCE.indexOf('const adminAccess = await hasTenantAdminAccess(');
  const denyIndex = PAGE_SOURCE.indexOf('if (!adminAccess) return <UnauthorizedState />;');
  const fetchIndex = PAGE_SOURCE.indexOf('listTenantAdminMembers(supabase)');

  assert.ok(gateIndex !== -1, 'hasTenantAdminAccess must be called and its result held');
  assert.ok(denyIndex !== -1, 'a denied adminAccess must render UnauthorizedState');
  assert.ok(fetchIndex !== -1, 'the members fetch must still exist');
  assert.ok(
    gateIndex < denyIndex && denyIndex < fetchIndex,
    'the permission check and its denial must both run strictly before the members Supabase read, so no member row ever reaches an unauthorized caller\'s RSC payload',
  );
});

test('no Cyrillic characters remain anywhere in the Admin page, its client component, or its dictionary', () => {
  const cyrillicPattern = /[Ѐ-ӿ]/;
  assert.ok(!cyrillicPattern.test(PAGE_SOURCE), 'page.tsx must contain no Cyrillic/Russian text');
  assert.ok(!cyrillicPattern.test(CLIENT_SOURCE), 'admin-dashboard-client.tsx must contain no Cyrillic/Russian text');
  assert.ok(!cyrillicPattern.test(I18N_SOURCE), 'admin-i18n.ts source code (outside the `ja` dictionary strings) must contain no Cyrillic/Russian text');
});
