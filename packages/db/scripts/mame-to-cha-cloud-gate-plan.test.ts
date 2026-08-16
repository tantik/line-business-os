import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCloudGatePlan, parseCloudGatePlanArgs } from './mame-to-cha-cloud-gate-plan.js';
import { MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';

const ARGS = [
  '--gate',
  'D1',
  '--project-ref',
  MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
  '--target-environment',
  'acceptance',
];

test('parses only the three explicit plan flags', () => {
  assert.deepEqual(parseCloudGatePlanArgs(ARGS), {
    gate: 'D1',
    projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
    targetEnvironment: 'acceptance',
  });
  assert.throws(() => parseCloudGatePlanArgs([...ARGS, '--execute']), /Unknown argument/);
});
test('builds a redacted plan-only D1 result with no write capability', () => {
  const result = buildCloudGatePlan(ARGS) as {
    mode: string;
    performsIo: boolean;
    executable: boolean;
    gate: string;
    planEntities: string[];
  };
  assert.equal(result.mode, 'plan-only');
  assert.equal(result.performsIo, false);
  assert.equal(result.executable, false);
  assert.equal(result.gate, 'D1');
  assert.deepEqual(result.planEntities, ['tenant', 'location']);
});

test('cannot plan for a different project or production', () => {
  assert.throws(() => buildCloudGatePlan(ARGS.map((value) => value === 'acceptance' ? 'production' : value)));
  assert.throws(() => buildCloudGatePlan(ARGS.map((value) => value === MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef ? 'other' : value)));
});
