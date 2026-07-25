import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCloudD3CliArgs, runCloudD3Cli } from './mame-to-cha-cloud-d3-cli.js';
import { cloudGateConfirmation, MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';

const ARGS = [
  '--gate', 'D3',
  '--project-ref', MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
  '--target-environment', 'acceptance',
  '--confirm', cloudGateConfirmation('D3'),
];

test('D3 CLI accepts only explicit single-value flags', () => {
  assert.equal(parseCloudD3CliArgs(ARGS).gate, 'D3');
  assert.throws(() => parseCloudD3CliArgs([...ARGS, '--execute']), /Unknown D3 argument/);
  assert.throws(() => parseCloudD3CliArgs([...ARGS, '--gate', 'D3']), /more than once/);
});

test('D3 CLI prints no passwords, keys, or emails', async () => {
  const lines: string[] = [];
  const exitCode = await runCloudD3Cli(ARGS, {
    execute: async () => ({
      gate: 'D3',
      tenantSlug: 'mame-to-cha',
      managerUserId: 'manager-id',
      staffUserId: 'staff-id',
      managerCreated: true,
      staffCreated: true,
      changedOperationCount: 2,
      noop: false,
      target: {
        projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
        environment: 'acceptance',
      },
    }),
    print: (line) => lines.push(line),
  });
  assert.equal(exitCode, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes('@mame-to-cha.test'), false);
  assert.equal(lines[0]?.includes('password'), false);
  assert.equal(lines[0]?.includes('service-role'), false);
});

test('D3 CLI never echoes unknown argument values', async () => {
  const errors: string[] = [];
  const exitCode = await runCloudD3Cli(['--unknown', 'sensitive-value'], {
    printError: (line) => errors.push(line),
  });
  assert.equal(exitCode, 1);
  assert.equal(errors.join(' ').includes('sensitive-value'), false);
});
