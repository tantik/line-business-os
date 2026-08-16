import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAME_TO_CHA_CLOUD_D7_SQL,
  runMameToChaCloudD7FromEnv,
  type CloudD7Client,
} from './mame-to-cha-cloud-d7.js';
import {
  parseCloudD7CliArgs,
  runCloudD7Cli,
} from './mame-to-cha-cloud-d7-cli.js';
import { MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';
import type { MameToChaVerifyReport } from './mame-to-cha-verify.js';

const IDENTITY = {
  managerUserId: '55555555-5555-4555-8555-555555555555',
  staffUserId: '66666666-6666-4666-8666-666666666666',
};
const TARGET = {
  projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
  environment: 'acceptance' as const,
  connectionMode: 'pooler' as const,
};
const REPORT: MameToChaVerifyReport = {
  ok: true,
  tenantSlug: 'mame-to-cha',
  checks: [{ id: 'tenant', status: 'pass', message: 'Tenant exists exactly once.' }],
  failures: [],
};

test('D7 runs verification inside a read-only transaction and always rolls back', async () => {
  const calls: string[] = [];
  const client: CloudD7Client = {
    connect: async () => { calls.push('connect'); },
    query: async (text) => { calls.push(text); return { rows: [] }; },
    end: async () => { calls.push('end'); },
  };
  const result = await runMameToChaCloudD7FromEnv(
    {
      gate: 'D7',
      projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
      targetEnvironment: 'acceptance',
      mode: 'execute',
    },
    IDENTITY,
    { MAME_TO_CHA_CLOUD_DATABASE_URL: 'reviewed-target' },
    {
      assertDatabaseUrl: () => TARGET,
      createClient: () => client,
      verify: async () => REPORT,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.deepEqual(calls, [
    'connect',
    MAME_TO_CHA_CLOUD_D7_SQL.statementTimeout,
    MAME_TO_CHA_CLOUD_D7_SQL.beginReadOnly,
    MAME_TO_CHA_CLOUD_D7_SQL.rollback,
    'end',
  ]);
});

test('D7 rejects a different target before constructing a client', async () => {
  let constructed = 0;
  await assert.rejects(
    () => runMameToChaCloudD7FromEnv(
      {
        gate: 'D7',
        projectRef: 'wrong-project',
        targetEnvironment: 'acceptance',
        mode: 'execute',
      },
      IDENTITY,
      { MAME_TO_CHA_CLOUD_DATABASE_URL: 'not-read-before-gate' },
      { createClient: () => { constructed += 1; throw new Error('must not construct'); } },
    ),
    /Project ref/,
  );
  assert.equal(constructed, 0);
});

test('D7 has no commit or write SQL surface', () => {
  const sql = Object.values(MAME_TO_CHA_CLOUD_D7_SQL).join('\n').toLowerCase();
  assert.doesNotMatch(sql, /\b(commit|insert|update|delete|alter|drop|grant|truncate)\b/);
  assert.match(MAME_TO_CHA_CLOUD_D7_SQL.beginReadOnly, /^begin read only$/);
});

test('D7 CLI accepts only explicit read-only target and identity flags', () => {
  assert.deepEqual(
    parseCloudD7CliArgs([
      '--gate', 'D7',
      '--project-ref', MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
      '--target-environment', 'acceptance',
      '--manager-user-id', IDENTITY.managerUserId,
      '--staff-user-id', IDENTITY.staffUserId,
    ]),
    {
      gate: 'D7',
      projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
      targetEnvironment: 'acceptance',
      managerUserId: IDENTITY.managerUserId,
      staffUserId: IDENTITY.staffUserId,
    },
  );
  assert.throws(() => parseCloudD7CliArgs(['--confirm', 'not-applicable']), /Unknown D7 argument/);
});

test('D7 CLI prints a redacted summary and reflects verification failure in its exit code', async () => {
  const lines: string[] = [];
  const code = await runCloudD7Cli(
    [
      '--gate', 'D7',
      '--project-ref', MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
      '--target-environment', 'acceptance',
      '--manager-user-id', IDENTITY.managerUserId,
      '--staff-user-id', IDENTITY.staffUserId,
    ],
    {
      execute: async () => ({
        ...REPORT,
        ok: false,
        checks: [{ id: 'tenant', status: 'fail', message: 'Expected exactly one tenant row.' }],
        failures: ['Expected exactly one tenant row.'],
        gate: 'D7',
        target: TARGET,
        readOnly: true,
      }),
      print: (line) => lines.push(line),
    },
  );
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /55555555|66666666|password|service_role/i);
});
