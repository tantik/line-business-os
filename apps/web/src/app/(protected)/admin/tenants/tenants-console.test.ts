import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_ERROR_KEY, OUTCOME_KEY, OWNER_KEY, STATUS_KEY, tTenants } from './tenants-i18n.js';

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
