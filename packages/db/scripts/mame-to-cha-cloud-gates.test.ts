import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cloudGateConfirmation,
  MAME_TO_CHA_ACCEPTANCE_TARGET,
  MAME_TO_CHA_CLOUD_GATES,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

const BASE = {
  gate: 'D1',
  projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
  targetEnvironment: 'acceptance',
  mode: 'plan' as const,
  confirm: undefined,
};

test('the execution map keeps every operation in one independently approved gate', () => {
  assert.deepEqual(MAME_TO_CHA_CLOUD_GATES.D1.planEntities, ['tenant', 'location']);
  assert.deepEqual(MAME_TO_CHA_CLOUD_GATES.D4.planEntities, ['user_mirror', 'membership', 'role_assignment']);
  assert.equal(MAME_TO_CHA_CLOUD_GATES.D3.kind, 'auth-write');
  assert.equal(MAME_TO_CHA_CLOUD_GATES.D5.requiresPii, true);
  assert.equal(MAME_TO_CHA_CLOUD_GATES.D7.kind, 'read-only');
});
test('plan mode validates the exact reviewed non-production target without requiring write confirmation', () => {
  const result = validateMameToChaCloudGate(BASE);
  assert.equal(result.definition.gate, 'D1');
  assert.equal(result.environment, 'acceptance');
  assert.equal(result.confirmationRequired, cloudGateConfirmation('D1'));
});

test('rejects an unknown or missing gate', () => {
  assert.throws(() => validateMameToChaCloudGate({ ...BASE, gate: undefined }), /Exactly one valid gate/);
  assert.throws(() => validateMameToChaCloudGate({ ...BASE, gate: 'D1,D2' }), /Exactly one valid gate/);
});

test('rejects a different project before execution', () => {
  assert.throws(
    () => validateMameToChaCloudGate({ ...BASE, projectRef: 'production-project' }),
    /does not match/,
  );
});

test('rejects every environment except acceptance', () => {
  assert.throws(
    () => validateMameToChaCloudGate({ ...BASE, targetEnvironment: 'production' }),
    /production is forbidden/,
  );
});

test('write execution requires the exact gate-specific confirmation', () => {
  const execute = { ...BASE, mode: 'execute' as const };
  assert.throws(() => validateMameToChaCloudGate(execute), /exact single-gate confirmation/);
  assert.throws(
    () => validateMameToChaCloudGate({ ...execute, confirm: cloudGateConfirmation('D2') }),
    /exact single-gate confirmation/,
  );
  assert.equal(
    validateMameToChaCloudGate({ ...execute, confirm: cloudGateConfirmation('D1') }).definition.gate,
    'D1',
  );
});

test('read-only D7 never asks for a write confirmation', () => {
  const result = validateMameToChaCloudGate({ ...BASE, gate: 'D7', mode: 'execute' });
  assert.equal(result.confirmationRequired, null);
});
