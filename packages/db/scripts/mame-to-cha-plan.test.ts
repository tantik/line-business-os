import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMameToChaFixturePlan, redactMameToChaPlanSummary } from './mame-to-cha-plan.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';

test('a from-scratch plan creates every entity, nothing reused', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
  assert.equal(plan.ok, true);
  assert.equal(plan.conflicts.length, 0);
  assert.ok(plan.operations.some((op) => op.entity === 'tenant' && op.action === 'create'));
  assert.ok(plan.operations.some((op) => op.entity === 'employee_binding' && op.action === 'create'));
  assert.ok(!plan.operations.some((op) => op.entity === 'employee_binding' && op.key === 'manager-1'));
  assert.equal(plan.operations.filter((op) => op.entity === 'shift_type').length, MAME_TO_CHA_FIXTURE.shiftTypes.length);
});

test('a fully-existing state plans reuse everywhere (idempotent, no dependent writes)', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    tenantExists: true,
    locationExists: true,
    enabledModules: ['core', 'workforce'],
    membershipsByLogicalId: { 'manager-1': 'active', 'staff-1': 'active' },
    roleAssignmentsByLogicalId: { 'manager-1': true, 'staff-1': true },
    employeeBindingsByLogicalId: { 'staff-1': true },
    shiftTypeCodesPresent: MAME_TO_CHA_FIXTURE.shiftTypes.map((s) => s.code),
    recipeCategoryLabelsPresent: MAME_TO_CHA_FIXTURE.recipes.map((r) => r.categoryLabelJa),
    recipeTitlesPresent: MAME_TO_CHA_FIXTURE.recipes.map((r) => r.titleJa),
    acceptanceDataPresent: {
      shiftAssignment: true,
      shiftPreferenceRequest: true,
      workReport: true,
      correctionRequest: true,
    },
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.operations.every((op) => op.action === 'reuse'));
});

test('a suspended manager membership is a conflict, not a silent reactivation', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    membershipsByLogicalId: { 'manager-1': 'suspended' },
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.conflicts.length, 1);
  assert.ok(plan.operations.some((op) => op.entity === 'membership' && op.action === 'conflict' && op.key === 'manager-1'));
});

test('an invited membership is planned for activation, not reuse', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    membershipsByLogicalId: { 'manager-1': 'invited' },
  });
  assert.ok(plan.operations.some((op) => op.entity === 'membership' && op.action === 'activate' && op.key === 'manager-1'));
});

test('redacted summary never carries a UUID, email, or secret-shaped value', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
  const summary = redactMameToChaPlanSummary(plan);
  const serialized = JSON.stringify(summary);
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized));
  assert.ok(!serialized.includes('@'));
  assert.equal(summary.tenantSlug, 'mame-to-cha');
  assert.ok((summary.operationCounts['tenant.create'] ?? 0) >= 1);
});
