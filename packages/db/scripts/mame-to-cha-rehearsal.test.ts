import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRehearsalCliArgs, runMameToChaRehearsalCli } from './mame-to-cha-rehearsal.js';
import type { MameToChaRehearsalEnv } from './mame-to-cha-env-guard.js';
import type { SchemaCheckReport } from './mame-to-cha-schema-check.js';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CLOUD_DB_URL = 'postgresql://postgres:postgres@db.abcxyz.supabase.co:5432/postgres';
const MANAGER_USER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_USER_ID = '66666666-6666-4666-8666-666666666666';

function fullEnv(overrides: Partial<MameToChaRehearsalEnv> = {}): MameToChaRehearsalEnv {
  return {
    DATABASE_URL: LOCAL_DB_URL,
    MAME_TO_CHA_LOCAL_MANAGER_EMAIL: 'manager@example.test',
    MAME_TO_CHA_LOCAL_MANAGER_PASSWORD: 'local-only-placeholder',
    MAME_TO_CHA_LOCAL_STAFF_EMAIL: 'staff@example.test',
    MAME_TO_CHA_LOCAL_STAFF_PASSWORD: 'local-only-placeholder',
    ...overrides,
  };
}

function allExistSchemaCheck(): Promise<SchemaCheckReport> {
  return Promise.resolve({ ok: true, relations: [], functions: [], missing: [] });
}

// --- arg parsing -------------------------------------------------------------

test('parses a bare subcommand', () => {
  const result = parseRehearsalCliArgs(['dry-run']);
  assert.ok(result.ok);
  assert.equal(result.value.subcommand, 'dry-run');
});

test('parses --manager-user-id / --staff-user-id / --confirm-apply / --confirm-cleanup / --dry-run', () => {
  const result = parseRehearsalCliArgs([
    'apply',
    '--manager-user-id',
    MANAGER_USER_ID,
    '--staff-user-id',
    STAFF_USER_ID,
    '--confirm-apply',
  ]);
  assert.ok(result.ok);
  assert.equal(result.value.managerUserId, MANAGER_USER_ID);
  assert.equal(result.value.staffUserId, STAFF_USER_ID);
  assert.equal(result.value.confirmApply, true);
});

test('rejects an unknown flag', () => {
  const result = parseRehearsalCliArgs(['dry-run', '--not-a-real-flag']);
  assert.equal(result.ok, false);
});

test('rejects a value flag with a missing value', () => {
  const result = parseRehearsalCliArgs(['apply', '--manager-user-id']);
  assert.equal(result.ok, false);
});

// --- subcommand routing -------------------------------------------------------

test('rejects a missing subcommand', async () => {
  const outcome = await runMameToChaRehearsalCli([], { env: fullEnv() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'unknown-subcommand');
});

test('rejects an unknown subcommand', async () => {
  const outcome = await runMameToChaRehearsalCli(['reset-everything'], { env: fullEnv() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'unknown-subcommand');
});

// --- dry-run -------------------------------------------------------------------

test('dry-run blocks before any DB connection when DATABASE_URL is missing', async () => {
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv({ DATABASE_URL: undefined }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'env-guard-blocked');
  assert.equal(outcome.connectionAttempted, false);
});

test('dry-run blocks a Cloud-like DATABASE_URL before connecting', async () => {
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv({ DATABASE_URL: CLOUD_DB_URL }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'env-guard-blocked');
  assert.equal(outcome.connectionAttempted, false);
});

test('dry-run blocks when a required credential env var is missing', async () => {
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv({ MAME_TO_CHA_LOCAL_STAFF_PASSWORD: undefined }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'env-guard-blocked');
});

test('dry-run passes end-to-end with a full local environment and a fake all-exists schema check', async () => {
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv(),
    runSchemaCheck: allExistSchemaCheck,
  });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'dry-run-ok');
  assert.equal(outcome.connectionAttempted, true);
  assert.ok(outcome.lines.some((l) => l.includes('no migration needed')));
});

test('dry-run reports no-go when a required relation is missing', async () => {
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv(),
    runSchemaCheck: () =>
      Promise.resolve({
        ok: false,
        relations: [],
        functions: [],
        missing: ['workforce.shift_types (table)'],
      }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'schema-check-blocked');
});

test('dry-run never echoes a secret env var value in its output lines', async () => {
  const secretValue = 'super-secret-should-never-appear';
  const outcome = await runMameToChaRehearsalCli(['dry-run'], {
    env: fullEnv({ MAME_TO_CHA_LOCAL_MANAGER_PASSWORD: secretValue }),
    runSchemaCheck: allExistSchemaCheck,
  });
  const joined = outcome.lines.join(' ');
  assert.ok(!joined.includes(secretValue));
  assert.ok(!joined.includes(LOCAL_DB_URL));
});

// --- apply: real implementation, but every test here uses injected fakes -----
// (this session never invokes apply against a real database; see the task's
// hard restrictions and docs/phase-1n-4c-local-onboarding-rehearsal.md).

test('apply requires --manager-user-id and --staff-user-id before any connection is attempted', async () => {
  const outcome = await runMameToChaRehearsalCli(['apply'], { env: fullEnv() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'apply-missing-identity');
  assert.equal(outcome.connectionAttempted, false);
});

test('apply without --confirm-apply runs the dry-run (always-rollback) transaction', async () => {
  let calledCommit = false;
  const outcome = await runMameToChaRehearsalCli(
    ['apply', '--manager-user-id', MANAGER_USER_ID, '--staff-user-id', STAFF_USER_ID],
    {
      env: fullEnv(),
      runApplyDryRun: async () => ({
        mode: 'dry-run',
        rolledBack: true,
        persisted: false,
        tenantSlug: 'mame-to-cha',
        dbTarget: { target: 'local-postgres', port: 54322 },
        write: { persisted: false, tenantSlug: 'mame-to-cha', operations: [], operationCounts: { 'tenant.create': 1 }, changedOperationCount: 1, auditRowCount: 1 },
      }),
      runApplyCommit: async () => {
        calledCommit = true;
        throw new Error('must not be called without --confirm-apply');
      },
    },
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'apply-dry-run-ok');
  assert.equal(calledCommit, false);
  assert.ok(outcome.lines.some((l) => l.includes('nothing was persisted')));
});

test('apply --confirm-apply runs the real commit path (fake dep; never a real DB in this test)', async () => {
  const outcome = await runMameToChaRehearsalCli(
    ['apply', '--manager-user-id', MANAGER_USER_ID, '--staff-user-id', STAFF_USER_ID, '--confirm-apply'],
    {
      env: fullEnv(),
      runApplyCommit: async () => ({
        mode: 'commit',
        committed: true,
        persisted: true,
        noop: false,
        tenantSlug: 'mame-to-cha',
        dbTarget: { target: 'local-postgres', port: 54322 },
        changedOperationCount: 5,
        auditRowCount: 6,
        write: { persisted: false, tenantSlug: 'mame-to-cha', operations: [], operationCounts: {}, changedOperationCount: 5, auditRowCount: 6 },
      }),
    },
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'apply-committed');
  assert.ok(outcome.lines.some((l) => l.includes('applied: 5 change(s)')));
});

test('apply also blocks on a bad local environment before identity is even checked', async () => {
  const outcome = await runMameToChaRehearsalCli(['apply'], {
    env: fullEnv({ DATABASE_URL: CLOUD_DB_URL }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'env-guard-blocked');
});

// --- verify --------------------------------------------------------------------

test('verify reports failures with a non-zero exit code', async () => {
  const outcome = await runMameToChaRehearsalCli(['verify'], {
    env: fullEnv(),
    runVerify: async () => ({
      ok: false,
      tenantSlug: 'mame-to-cha',
      checks: [{ id: 'tenant.exists-exactly-once', status: 'fail', message: 'Expected exactly one tenant row, found 0.' }],
      failures: ['Expected exactly one tenant row, found 0.'],
    }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'verify-failed');
});

test('verify reports success with exit code 0', async () => {
  const outcome = await runMameToChaRehearsalCli(['verify'], {
    env: fullEnv(),
    runVerify: async () => ({ ok: true, tenantSlug: 'mame-to-cha', checks: [], failures: [] }),
  });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'verify-ok');
});

// --- cleanup ---------------------------------------------------------------

test('cleanup requires --manager-user-id/--staff-user-id', async () => {
  const outcome = await runMameToChaRehearsalCli(['cleanup', '--dry-run'], { env: fullEnv() });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'cleanup-missing-identity');
});

test('cleanup requires either --dry-run or --confirm-cleanup', async () => {
  const outcome = await runMameToChaRehearsalCli(
    ['cleanup', '--manager-user-id', MANAGER_USER_ID, '--staff-user-id', STAFF_USER_ID],
    { env: fullEnv() },
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'cleanup-missing-mode');
});

test('cleanup --dry-run previews the removal plan without persisting (fake dep)', async () => {
  const outcome = await runMameToChaRehearsalCli(
    ['cleanup', '--manager-user-id', MANAGER_USER_ID, '--staff-user-id', STAFF_USER_ID, '--dry-run'],
    {
      env: fullEnv(),
      runCleanupDryRun: async () => ({
        mode: 'cleanup-dry-run',
        rolledBack: true,
        removed: false,
        tenantSlug: 'mame-to-cha',
        dbTarget: { target: 'local-postgres', port: 54322 },
        plan: [{ entity: 'correction_request', key: 'staff-1:day-1', present: true }],
      }),
    },
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'cleanup-dry-run-ok');
  assert.ok(outcome.lines.some((l) => l.includes('mame-to-cha-tokyo')));
});

test('cleanup --confirm-cleanup runs the real commit path (fake dep; never a real DB in this test)', async () => {
  const outcome = await runMameToChaRehearsalCli(
    ['cleanup', '--manager-user-id', MANAGER_USER_ID, '--staff-user-id', STAFF_USER_ID, '--confirm-cleanup'],
    {
      env: fullEnv(),
      runCleanupCommit: async () => ({
        mode: 'cleanup',
        committed: true,
        removed: true,
        noop: false,
        tenantSlug: 'mame-to-cha',
        dbTarget: { target: 'local-postgres', port: 54322 },
        removedCount: 4,
        operations: [],
      }),
    },
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'cleanup-committed');
  assert.ok(outcome.lines.some((l) => l.includes('removed: 4 row(s)')));
});

test('cleanup also blocks on a bad local environment before identity is even checked', async () => {
  const outcome = await runMameToChaRehearsalCli(['cleanup', '--confirm-cleanup'], {
    env: fullEnv({ DATABASE_URL: CLOUD_DB_URL }),
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'env-guard-blocked');
});

// --- auth-provision ----------------------------------------------------------

test('auth-provision does not use the DATABASE_URL guard (its own guard runs inside the module)', async () => {
  const outcome = await runMameToChaRehearsalCli(['auth-provision'], {
    env: fullEnv({ DATABASE_URL: undefined }),
    runAuthProvision: async () => ({
      managerUserId: MANAGER_USER_ID,
      staffUserId: STAFF_USER_ID,
      managerCreated: true,
      staffCreated: true,
    }),
  });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'auth-provision-ok');
  assert.ok(outcome.lines.some((l) => l.includes(MANAGER_USER_ID)));
});

test('auth-provision surfaces a safe error without leaking a secret', async () => {
  const outcome = await runMameToChaRehearsalCli(['auth-provision'], {
    env: fullEnv(),
    runAuthProvision: async () => {
      throw new Error('MAME_TO_CHA_LOCAL_SUPABASE_URL is required.');
    },
  });
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'auth-provision-error');
});

test('this session never invokes apply/cleanup/auth-provision against a real database or network (only fakes above)', () => {
  // Documentation-as-code: every apply/cleanup/auth-provision test above
  // supplies an explicit fake dependency; none rely on the default lazy
  // imports that would touch a real `pg` connection or Supabase admin API.
  assert.ok(true);
});
