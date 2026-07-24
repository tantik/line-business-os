import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCloudD1CliArgs, runCloudD1Cli } from './mame-to-cha-cloud-d1-cli.js';
import { cloudGateConfirmation, MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';

const ARGS = [
  '--gate', 'D1',
  '--project-ref', MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
  '--target-environment', 'acceptance',
  '--confirm', cloudGateConfirmation('D1'),
];

test('D1 CLI accepts only explicit single-value flags', () => {
  assert.equal(parseCloudD1CliArgs(ARGS).gate, 'D1');
  assert.throws(() => parseCloudD1CliArgs([...ARGS, '--execute']), /Unknown D1 argument/);
  assert.throws(() => parseCloudD1CliArgs([...ARGS, '--gate', 'D1']), /more than once/);
});

test('D1 CLI prints only a redacted summary from an injected executor', async () => {
  const lines: string[] = [];
  const exitCode = await runCloudD1Cli(ARGS, {
    execute: async () => ({
      gate: 'D1',
      tenantSlug: 'mame-to-cha',
      operations: [
        { entity: 'tenant', action: 'create', key: 'mame-to-cha' },
        { entity: 'location', action: 'create', key: 'primary' },
      ],
      changedOperationCount: 2,
      auditRowCount: 3,
      committed: true,
      noop: false,
      target: {
        projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
        environment: 'acceptance',
        connectionMode: 'direct',
      },
    }),
    print: (line) => lines.push(line),
  });
  assert.equal(exitCode, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.includes('operations'), false);
  assert.equal(lines[0]?.includes('password'), false);
});

test('D1 CLI returns non-zero and never echoes unknown argument values', async () => {
  const errors: string[] = [];
  const exitCode = await runCloudD1Cli(['--unknown', 'sensitive-value'], {
    printError: (line) => errors.push(line),
  });
  assert.equal(exitCode, 1);
  assert.equal(errors.join(' ').includes('sensitive-value'), false);
});
