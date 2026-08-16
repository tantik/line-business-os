import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2b - source-text regression guards for the preview
 * staff shift-preference-submission wrapper. Same convention as
 * `authorize.test.ts`/`schedule-actions.test.ts`. Deliberately a separate
 * file from `schedule-actions.ts` (the B2a manager module) - see the doc
 * comment on `previewSubmitShiftPreference` for why.
 */
const SOURCE = readFileSync(new URL('./staff-schedule-actions.ts', import.meta.url), 'utf8');

function fnBody(name: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `expected to find export async function ${name}(`);
  return SOURCE.slice(start);
}

test('exports exactly previewSubmitShiftPreference', () => {
  assert.ok(/export async function previewSubmitShiftPreference\(/.test(SOURCE));
});

test('resolves the staff context, never the manager context', () => {
  const body = fnBody('previewSubmitShiftPreference');
  assert.ok(/resolvePreviewStaffContext\(\)/.test(body));
  assert.ok(!/resolvePreviewManagerContext\(/.test(body));
});

test('never reads a client-supplied employeeId/locationId field', () => {
  const body = fnBody('previewSubmitShiftPreference');
  assert.ok(!/formData\.get\('employeeId'\)/.test(body));
  assert.ok(!/formData\.get\('locationId'\)/.test(body));
});

test('validates a submitted shiftTypeId against the strict tenant, the resolved location, and isActive before the service-layer call', () => {
  const body = fnBody('previewSubmitShiftPreference');
  assert.ok(/if \(input\.shiftTypeId\)/.test(body));
  assert.ok(/listWorkforceShiftTypes\(supabase, tenantId\)/.test(body));
  assert.ok(
    /shiftType\.locationId !== locationId/.test(body),
    'must reject a shift type belonging to another location - shift_types.location_id is a real, non-null column (0025)',
  );
  assert.ok(/!shiftType\.isActive/.test(body), 'must reject an inactive shift type');
  const validationIdx = body.indexOf('shiftType.locationId !== locationId');
  const callIdx = body.indexOf('submitShiftPreferenceWrite(');
  assert.ok(validationIdx >= 0 && validationIdx < callIdx, 'shift-type validation must run before the service-layer call');
});

test('calls submitShiftPreferenceWrite unchanged', () => {
  const body = fnBody('previewSubmitShiftPreference');
  assert.ok(/submitShiftPreferenceWrite\(supabase, tenantId, \{/.test(body));
});

test('never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions|employee-line-links)/.test(SOURCE));
});

test('never references tenantSlug/moduleEnabled authority literals', () => {
  assert.ok(!SOURCE.includes('tenantSlug'));
  assert.ok(!SOURCE.includes('moduleEnabled'));
});

test('never exports a B2a manager action (kept separate so a route importing one role\'s actions never bundles the other role\'s worker registrations)', () => {
  const b2aManagerActions = [
    'previewUpsertEmployee',
    'previewSetEmployeeActive',
    'previewCreateShiftAssignment',
    'previewUpdateShiftAssignment',
    'previewRunAutoDistribution',
    'previewPublishSchedule',
    'previewDecideCorrectionRequest',
  ];
  for (const name of b2aManagerActions) {
    assert.ok(!new RegExp(`export async function ${name}\\(`).test(SOURCE), `must not export ${name}`);
  }
});
