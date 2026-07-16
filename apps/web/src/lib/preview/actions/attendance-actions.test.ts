import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2a - source-text regression guards for the preview
 * correction-request approve/reject wrapper. Same convention as
 * `authorize.test.ts`/`staff-actions.test.ts`/`schedule-actions.test.ts`.
 */
const SOURCE = readFileSync(new URL('./attendance-actions.ts', import.meta.url), 'utf8');

test('exports exactly previewDecideCorrectionRequest', () => {
  assert.ok(/export async function previewDecideCorrectionRequest\(/.test(SOURCE));
});

test('requests workforce.request.manage per the B2a permission matrix', () => {
  const matches = [...SOURCE.matchAll(/resolvePreviewManagerContext\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(matches, ['workforce.request.manage']);
});

test('validates the target correction request against the strict tenant + resolved location before the service-layer call, independent of the update filter', () => {
  assert.ok(/listShiftRequestsForManager\(supabase, tenantId, \{ kind: 'correction' \}\)/.test(SOURCE));
  assert.ok(/target\.locationId !== locationId/.test(SOURCE), 'must reject a target request whose own locationId does not match the resolved location');
  const validationIdx = SOURCE.indexOf('target.locationId !== locationId');
  const decideIdx = SOURCE.indexOf('decideCorrectionRequestWrite(');
  assert.ok(validationIdx < decideIdx, 'target-request-location validation must run before the service-layer call');
});

test('never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions|employee-line-links)/.test(SOURCE));
});

test('never references tenantSlug/moduleEnabled authority literals or a client-supplied employeeId field', () => {
  assert.ok(!SOURCE.includes('tenantSlug'));
  assert.ok(!SOURCE.includes('moduleEnabled'));
  assert.ok(!/formData\.get\('employeeId'\)/.test(SOURCE), 'the manager decision has no legitimate reason to accept an employeeId field');
});

test('never exports a B2b staff action (kept in staff-attendance-actions.ts so a route importing one role\'s actions never bundles the other role\'s worker registrations)', () => {
  assert.ok(!/export async function previewSubmit/.test(SOURCE));
});
