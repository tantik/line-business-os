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

test('a from-scratch plan explicitly models both manager and staff core-user mirrors', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
  const mirrorOps = plan.operations.filter((op) => op.entity === 'user_mirror');
  assert.equal(mirrorOps.length, 2);
  assert.ok(mirrorOps.every((op) => op.action === 'create'));
  assert.deepEqual(
    mirrorOps.map((op) => op.key).sort(),
    ['manager-1', 'staff-1'],
  );
});

test('user_mirror operations are planned before membership/employee_binding (write-order contract)', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
  const mirrorIndex = plan.operations.findIndex((op) => op.entity === 'user_mirror');
  const membershipIndex = plan.operations.findIndex((op) => op.entity === 'membership');
  const employeeBindingIndex = plan.operations.findIndex((op) => op.entity === 'employee_binding');
  assert.ok(mirrorIndex >= 0);
  assert.ok(mirrorIndex < membershipIndex);
  assert.ok(mirrorIndex < employeeBindingIndex);
});

test('an existing manager mirror (only) plans reuse for manager, create for staff', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    userMirrorsByLogicalId: { 'manager-1': true },
  });
  const managerOp = plan.operations.find((op) => op.entity === 'user_mirror' && op.key === 'manager-1');
  const staffOp = plan.operations.find((op) => op.entity === 'user_mirror' && op.key === 'staff-1');
  assert.equal(managerOp?.action, 'reuse');
  assert.equal(staffOp?.action, 'create');
});

test('a fully-existing state plans reuse everywhere (idempotent, no dependent writes)', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    tenantExists: true,
    userMirrorsByLogicalId: { 'manager-1': true, 'staff-1': true },
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
