import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2a - source-text regression guards for the preview
 * employee create/edit and activate/deactivate wrappers. Same convention as
 * `authorize.test.ts`: these wrappers call impure Supabase/service-layer
 * dependencies not designed for injection, so call-order and target-validation
 * safety properties are locked in statically here.
 */
const SOURCE = readFileSync(new URL('./staff-actions.ts', import.meta.url), 'utf8');

test('exports exactly previewUpsertEmployee and previewSetEmployeeActive', () => {
  assert.ok(/export async function previewUpsertEmployee\(/.test(SOURCE));
  assert.ok(/export async function previewSetEmployeeActive\(/.test(SOURCE));
});

test('every wrapper (including the read-only refresh helper) requests workforce.staff.manage per the B2a permission matrix', () => {
  const matches = [...SOURCE.matchAll(/resolvePreviewManagerContext\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(matches, ['workforce.staff.manage', 'workforce.staff.manage', 'workforce.staff.manage']);
});

test('previewUpsertEmployee never parses the raw client FormData directly - it always substitutes the resolved location first', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('export async function previewUpsertEmployee'), SOURCE.indexOf('export async function previewSetEmployeeActive'));
  assert.ok(!/parseUpsertEmployeeInput\(formData\)/.test(fnBody), 'must not parse the raw client FormData directly');
  assert.ok(/parseUpsertEmployeeInput\(scopedFormData\)/.test(fnBody), 'must parse a scoped FormData with the server-resolved location substituted in');
  assert.ok(/if \(key === 'locationId'\) continue/.test(fnBody), 'a client-submitted locationId field must be discarded, never forwarded');
  assert.ok(/scopedFormData\.set\('locationId', locationId\)/.test(fnBody), 'the server-resolved locationId must always be substituted');
});

test('previewUpsertEmployee validates a submitted target employee id against the strict tenant and resolved location before the service-layer call', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('export async function previewUpsertEmployee'), SOURCE.indexOf('export async function previewSetEmployeeActive'));
  assert.ok(/if \(input\.id\)/.test(fnBody));
  assert.ok(/listWorkforceStaffDirectory\(supabase, tenantId\)/.test(fnBody));
  assert.ok(/target\.locationId !== locationId/.test(fnBody), 'must reject a target employee whose location does not match the resolved location');
  const upsertIdx = fnBody.indexOf('upsertWorkforceEmployee(');
  const validationIdx = fnBody.indexOf('target.locationId !== locationId');
  assert.ok(validationIdx < upsertIdx, 'target validation must run before the service-layer call');
});

test('previewSetEmployeeActive validates the target staffId against the strict tenant and resolved location before the service-layer call', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('export async function previewSetEmployeeActive'));
  assert.ok(/listWorkforceStaffDirectory\(supabase, tenantId\)/.test(fnBody));
  assert.ok(/target\.locationId !== locationId/.test(fnBody));
  const setActiveIdx = fnBody.indexOf('setWorkforceEmployeeActive(');
  const validationIdx = fnBody.indexOf('target.locationId !== locationId');
  assert.ok(validationIdx < setActiveIdx, 'target validation must run before the service-layer call');
});

test('never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions)/.test(SOURCE));
});

test('LINE binding uses the server-only service helper after the employee upsert succeeds', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('export async function previewUpsertEmployee'), SOURCE.indexOf('export async function previewSetEmployeeActive'));
  assert.ok(fnBody.indexOf("result.status === 'success'") < fnBody.indexOf('bindEmployeeLineUser('));
  assert.ok(/bindEmployeeLineUser\(supabase, tenantId, result\.data\.staffId/.test(fnBody));
});

test('never references tenantSlug/moduleEnabled authority literals', () => {
  assert.ok(!SOURCE.includes('tenantSlug'));
  assert.ok(!SOURCE.includes('moduleEnabled'));
});
