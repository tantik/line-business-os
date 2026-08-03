import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Phase 1N-4C Slice B2a - source-text regression guards for the preview
 * shift create/update/unassign, auto-distribution, and publish wrappers.
 * Same convention as `authorize.test.ts`/`staff-actions.test.ts`.
 */
const SOURCE = readFileSync(new URL('./schedule-actions.ts', import.meta.url), 'utf8');

function fnBody(name: string, nextName?: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `expected to find export async function ${name}(`);
  const end = nextName ? SOURCE.indexOf(`export async function ${nextName}(`) : SOURCE.length;
  return SOURCE.slice(start, end);
}

test('exports exactly the four B2a schedule wrappers', () => {
  for (const name of [
    'previewCreateShiftAssignment',
    'previewUpdateShiftAssignment',
    'previewRunAutoDistribution',
    'previewPublishSchedule',
  ]) {
    assert.ok(new RegExp(`export async function ${name}\\(`).test(SOURCE));
  }
});

test('all wrappers, including the read-only week-refresh helper, request workforce.shift.write per the B2a permission matrix', () => {
  const matches = [...SOURCE.matchAll(/resolvePreviewManagerContext\('([^']+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(matches, [
    'workforce.shift.write',
    'workforce.shift.write',
    'workforce.shift.write',
    'workforce.shift.write',
    'workforce.shift.write',
  ]);
});

test('previewCreateShiftAssignment never trusts a submitted locationId and validates employeeId/shiftTypeId before the service-layer call', () => {
  const body = fnBody('previewCreateShiftAssignment', 'previewUpdateShiftAssignment');
  assert.ok(/withResolvedLocationId\(formData, locationId\)/.test(body), 'must substitute the resolved location before parsing');
  const employeeCheckIdx = body.indexOf("employee.locationId !== locationId");
  const shiftTypeCheckIdx = body.indexOf('if (!shiftType) return');
  const createIdx = body.indexOf('createShiftAssignmentWrite(');
  assert.ok(employeeCheckIdx >= 0 && employeeCheckIdx < createIdx, 'employeeId must be validated before the service-layer call');
  assert.ok(shiftTypeCheckIdx >= 0 && shiftTypeCheckIdx < createIdx, 'shiftTypeId must be validated before the service-layer call');
});

test('previewUpdateShiftAssignment verifies the target assignment location independently, not inferred from "one active location"', () => {
  const body = fnBody('previewUpdateShiftAssignment', 'previewRunAutoDistribution');
  assert.ok(/getShiftAssignmentById\(supabase, tenantId, input\.assignmentId\)/.test(body), 'must read only the target assignment through the RLS facade');
  assert.ok(/target\.locationId !== locationId/.test(body), 'must reject a target assignment whose own locationId does not match the resolved location');
  const validationIdx = body.indexOf('target.locationId !== locationId');
  const updateIdx = body.indexOf('updateShiftAssignmentWrite(');
  assert.ok(validationIdx < updateIdx, 'assignment-location validation must run before the service-layer call');
});

test('previewUpdateShiftAssignment validates a non-null submitted employeeId/shiftTypeId before the service-layer call', () => {
  const body = fnBody('previewUpdateShiftAssignment', 'previewRunAutoDistribution');
  assert.ok(/if \(input\.employeeId\)/.test(body));
  assert.ok(/if \(!isUnassign && input\.shiftTypeId\)/.test(body));
});

test('single-cell writes use targeted staff/shift-type reads and unassign cannot leave a phantom unpublished row', () => {
  const createBody = fnBody('previewCreateShiftAssignment', 'previewUpdateShiftAssignment');
  const updateBody = fnBody('previewUpdateShiftAssignment', 'previewRunAutoDistribution');
  assert.ok(createBody.includes('getWorkforceStaffDirectoryEntryById('));
  assert.ok(createBody.includes('getWorkforceShiftTypeById('));
  assert.ok(updateBody.includes('getWorkforceStaffDirectoryEntryById('));
  assert.ok(updateBody.includes('getWorkforceShiftTypeById('));
  assert.ok(/published:\s*isUnassign \? true : input\.published/.test(updateBody));
});

test('previewRunAutoDistribution injects the resolved location and never reads a client-supplied locationId', () => {
  const body = fnBody('previewRunAutoDistribution', 'previewPublishSchedule');
  assert.ok(/\{ \.\.\.\(input as Record<string, unknown>\), locationId \}/.test(body), 'must override any client-supplied locationId with the resolved one');
});

test('previewRunAutoDistribution runs the raw pre-check (rawInputHasPositiveRequirement) before resolving tenant context at all', () => {
  const body = fnBody('previewRunAutoDistribution', 'previewPublishSchedule');
  const rawCheckIdx = body.indexOf('rawInputHasPositiveRequirement(input)');
  const resolveContextIdx = body.indexOf("resolvePreviewManagerContext('workforce.shift.write')");
  assert.ok(rawCheckIdx >= 0, 'must call rawInputHasPositiveRequirement(input)');
  assert.ok(rawCheckIdx < resolveContextIdx, 'the raw pre-check must run before tenant/module/location resolution');
});

test('previewRunAutoDistribution re-checks hasPositiveHeadcount on the fully-parsed requirements before any read or the autoDistribute() call - a request that could only ever be a no-op must never reach the algorithm', () => {
  const body = fnBody('previewRunAutoDistribution', 'previewPublishSchedule');
  const guardIdx = body.indexOf('hasPositiveHeadcount(parsed.staffingRequirements)');
  assert.ok(guardIdx >= 0, 'must check hasPositiveHeadcount(parsed.staffingRequirements)');
  const listStaffIdx = body.indexOf('listWorkforceStaffDirectory(');
  // Matches only the actual call site (`autoDistribute({`) - the guard's own
  // doc comment above it mentions `autoDistribute()` in prose, which must not
  // be mistaken for the call.
  const autoDistributeIdx = body.indexOf('autoDistribute({');
  assert.ok(guardIdx < listStaffIdx, 'the post-parse guard must run before any tenant read');
  assert.ok(guardIdx < autoDistributeIdx, 'the post-parse guard must run before the algorithm call');
});

test('previewRunAutoDistribution forwards the parsed staffingRequirements array unchanged to autoDistribute() - a valid, positive requirement set is never filtered or rewritten before reaching the algorithm', () => {
  const body = fnBody('previewRunAutoDistribution', 'previewPublishSchedule');
  assert.ok(
    /staffingRequirements:\s*parsed\.staffingRequirements,/.test(body),
    'must pass parsed.staffingRequirements directly (the same array hasPositiveHeadcount validated) into the autoDistribute() call',
  );
});

test('previewPublishSchedule injects the resolved location before parsing', () => {
  const body = fnBody('previewPublishSchedule');
  assert.ok(/withResolvedLocationId\(formData, locationId\)/.test(body));
});

test('never imports a raw dashboard action module', () => {
  assert.ok(!/@\/lib\/workforce\/(staff-actions|schedule-actions|attendance-actions|employee-line-links)/.test(SOURCE));
});

test('never references tenantSlug/moduleEnabled authority literals', () => {
  assert.ok(!SOURCE.includes('tenantSlug'));
  assert.ok(!SOURCE.includes('moduleEnabled'));
});

test('never exports a B2b staff action (kept in a separate file so a route importing one role\'s actions never bundles the other role\'s worker registrations)', () => {
  assert.ok(!/export async function previewSubmit/.test(SOURCE));
});
