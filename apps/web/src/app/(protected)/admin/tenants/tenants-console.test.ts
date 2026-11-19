import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_ERROR_KEY, OUTCOME_KEY, OWNER_KEY, STATUS_KEY, STORE_ERROR_KEY, TENANTS_DICT_KEYS, fillTenants, tTenants, type TenantsKey } from './tenants-i18n.js';
import { PLATFORM_LOCATION_ERROR_CODES } from '../../../../lib/platform/platform-location.js';

/**
 * Admin console `/admin/tenants` (Stage 4B-3): JA/EN completeness and the
 * security shape of the page / action / client, as source guards (the
 * Server Components are not built for DI here, same convention as
 * `accept-invite/route.test.ts`).
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('every mapped key exists in JA and EN, non-empty and distinct', () => {
  const keys = new Set([...Object.values(FIELD_ERROR_KEY), ...Object.values(OUTCOME_KEY), ...Object.values(STATUS_KEY), ...Object.values(OWNER_KEY)]);
  for (const key of keys) {
    const ja = tTenants('ja', key);
    const en = tTenants('en', key);
    assert.ok(ja && en, `missing copy for ${key}`);
    assert.notEqual(ja, en, `JA and EN identical for ${key}`);
  }
});

test('JA and EN dictionaries have exactly the same keys; store copy (L3c) never empty', () => {
  assert.deepEqual([...TENANTS_DICT_KEYS.ja].sort(), [...TENANTS_DICT_KEYS.en].sort());
  // (EN listCount is deliberately '' -- "3件" has no English counter word)
  for (const key of TENANTS_DICT_KEYS.ja.filter((k) => k.startsWith('stores')) as TenantsKey[]) {
    assert.ok(tTenants('ja', key)?.length, `empty JA copy for ${key}`);
    assert.ok(tTenants('en', key)?.length, `empty EN copy for ${key}`);
  }
});

test('stores (L3c): every platform-location error code has JA + EN copy, distinct per language', () => {
  assert.deepEqual(Object.keys(STORE_ERROR_KEY).sort(), [...PLATFORM_LOCATION_ERROR_CODES].sort());
  for (const code of PLATFORM_LOCATION_ERROR_CODES) {
    const key = STORE_ERROR_KEY[code];
    assert.ok(tTenants('ja', key) && tTenants('en', key), `missing copy for ${code}`);
    assert.notEqual(tTenants('ja', key), tTenants('en', key), `JA and EN identical for ${code}`);
  }
  // no raw server text: copy is fixed strings, the only placeholders are {n} / {name}
  for (const key of TENANTS_DICT_KEYS.ja as TenantsKey[]) {
    for (const lang of ['ja', 'en'] as const) {
      const placeholders = tTenants(lang, key).match(/\{(\w+)\}/g) ?? [];
      for (const p of placeholders) assert.ok(p === '{n}' || p === '{name}', `${lang}.${key}: unexpected placeholder ${p}`);
    }
  }
  assert.equal(fillTenants(tTenants('ja', 'storesStaffCount'), { n: 3 }), '所属スタッフ 3人');
  assert.equal(fillTenants(tTenants('en', 'storesRowMenu'), { name: '本店' }), 'Actions for “本店”');
});

test('page: the store read uses the same staff session and also 404s on 42501', () => {
  const page = read('./page.tsx');
  const gate = page.indexOf('isPlatformStaff(supabase)');
  const stores = page.indexOf('listPlatformTenantLocations(supabase)');
  assert.ok(gate >= 0 && stores > gate);
  assert.ok(page.includes("locations.status === 'unauthorized'"));
});

test('stores UI: @line-os/ui components, not the legacy design-kit; archive needs a confirm; no archive for the last open store', () => {
  const src = read('./tenant-stores.tsx');
  assert.ok(src.includes("from '@line-os/ui'"));
  assert.ok(!src.includes('design-kit'));
  assert.ok(src.includes('<ConfirmDialog'));
  assert.ok(src.includes('if (activeStores.length <= 1) return [rename];'));
  assert.ok(src.includes('setArchiveTarget(store);'), 'the archive item opens the confirm');
  assert.equal(src.split('handleSetActive(archiveTarget, false)').length, 2, 'archiving happens only from the confirm dialog');
  assert.ok(!src.includes('handleSetActive(store, false)'), 'never archives directly from the menu');
});

test('page: platform-staff gate before the list read; others get a 404', () => {
  const page = read('./page.tsx');
  const gate = page.indexOf('isPlatformStaff(supabase)');
  const list = page.indexOf('listPlatformTenantProvisioning(supabase)');
  assert.ok(gate >= 0 && list > gate);
  assert.ok(/if \(!\(await isPlatformStaff\(supabase\)\)\) notFound\(\);/.test(page));
});

test('no privileged key anywhere on the console path', () => {
  for (const rel of ['./page.tsx', './tenants-console.tsx', '../../../../lib/platform/provisioning-actions.ts', '../../../../lib/platform/provision-tenant-client.ts']) {
    const src = read(rel);
    assert.ok(!/service_role|SERVICE_ROLE|createServiceClient|SECRET_KEY/i.test(src), `${rel} must not reference a privileged key`);
  }
});

test('action: validation, then staff gate, then the caller token; body is exactly request_id + input', () => {
  const action = read('../../../../lib/platform/provisioning-actions.ts');
  const body = action.slice(action.indexOf('export async function submitTenantProvisioning'));
  const v = body.indexOf('validateProvisioningForm(');
  const g = body.indexOf('isPlatformStaff(supabase)');
  const c = body.indexOf('callProvisionTenant(');
  assert.ok(v >= 0 && g > v && c > g);
  const client = read('../../../../lib/platform/provision-tenant-client.ts');
  assert.ok(/body: JSON\.stringify\(\{\s*request_id: requestId,\s*input: \{/.test(client));
  assert.ok(!/actor/i.test(client.slice(client.indexOf('body: JSON.stringify'))), 'never an actor field');
});

test('client keeps one request_id per form session and only renews it on request_mismatch', () => {
  const src = read('./tenants-console.tsx');
  assert.ok(src.includes("formData.set('requestId', requestId)"));
  assert.ok(src.includes('next.outcome.needsNewRequest ? newRequestId() : next.requestId'));
});

test('page has no static title (a non-staff 404 must not name the console)', () => {
  const page = read('./page.tsx');
  assert.ok(!/title:\s*'/.test(page.slice(page.indexOf('export const metadata'))));
});
