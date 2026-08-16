import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAME_TO_CHA_REQUIRED_ENV_VARS,
  checkMameToChaLocalEnvironment,
  looksLikeLocalTestEmail,
  type MameToChaRehearsalEnv,
} from './mame-to-cha-env-guard.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CLOUD_DB_URL = 'postgresql://postgres:postgres@db.abcxyz.supabase.co:5432/postgres';

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

test('passes with a full local environment and the tracked fixture', () => {
  const report = checkMameToChaLocalEnvironment(fullEnv(), MAME_TO_CHA_FIXTURE);
  assert.equal(report.ok, true);
  assert.equal(report.blockedReasons.length, 0);
  assert.deepEqual(report.dbLocalTarget, { target: 'local-postgres', port: 54322 });
});

test('blocks a missing DATABASE_URL', () => {
  const report = checkMameToChaLocalEnvironment(fullEnv({ DATABASE_URL: undefined }), MAME_TO_CHA_FIXTURE);
  assert.equal(report.ok, false);
  assert.ok(report.blockedReasons.some((m) => m.includes('DATABASE_URL')));
});

test('blocks a Cloud-like DATABASE_URL', () => {
  const report = checkMameToChaLocalEnvironment(fullEnv({ DATABASE_URL: CLOUD_DB_URL }), MAME_TO_CHA_FIXTURE);
  assert.equal(report.ok, false);
  assert.equal(report.dbLocalTarget, null);
});

test('never echoes the DATABASE_URL value in any check message', () => {
  const report = checkMameToChaLocalEnvironment(fullEnv({ DATABASE_URL: CLOUD_DB_URL }), MAME_TO_CHA_FIXTURE);
  const allMessages = report.checks.map((c) => c.message).join(' ');
  assert.ok(!allMessages.includes('supabase.co'));
  assert.ok(!allMessages.includes(CLOUD_DB_URL));
});

for (const varName of MAME_TO_CHA_REQUIRED_ENV_VARS) {
  test(`blocks a missing ${varName}`, () => {
    const report = checkMameToChaLocalEnvironment(fullEnv({ [varName]: undefined }), MAME_TO_CHA_FIXTURE);
    assert.equal(report.ok, false);
    assert.ok(report.blockedReasons.some((m) => m.includes(varName)));
  });

  test(`never echoes the ${varName} value`, () => {
    const secretValue = 'super-secret-value-should-never-appear';
    const report = checkMameToChaLocalEnvironment(fullEnv({ [varName]: secretValue }), MAME_TO_CHA_FIXTURE);
    const allMessages = report.checks.map((c) => c.message).join(' ');
    assert.ok(!allMessages.includes(secretValue));
  });
}

test('blocks when the fixture tenant slug is not exactly "mame-to-cha"', () => {
  const report = checkMameToChaLocalEnvironment(fullEnv(), {
    tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'mame-to-cha-tokyo' as never },
  });
  assert.equal(report.ok, false);
  assert.ok(report.blockedReasons.some((m) => m.toLowerCase().includes('protected')));
});

test('looksLikeLocalTestEmail accepts obviously local/test domains', () => {
  assert.equal(looksLikeLocalTestEmail('manager@example.test'), true);
  assert.equal(looksLikeLocalTestEmail('manager@example.com'), true);
  assert.equal(looksLikeLocalTestEmail('manager@example.jp'), true);
});

test('looksLikeLocalTestEmail rejects a plausible real-looking domain', () => {
  assert.equal(looksLikeLocalTestEmail('owner@mame-to-cha.jp'), false);
  assert.equal(looksLikeLocalTestEmail('not-an-email'), false);
});

test('hard-fails (does not merely warn) on a non-local-looking manager email, aligned with the auth-provision guard', () => {
  const report = checkMameToChaLocalEnvironment(
    fullEnv({ MAME_TO_CHA_LOCAL_MANAGER_EMAIL: 'owner@mame-to-cha.jp' }),
    MAME_TO_CHA_FIXTURE,
  );
  assert.equal(report.ok, false);
  assert.ok(report.blockedReasons.some((m) => m.includes('MAME_TO_CHA_LOCAL_MANAGER_EMAIL')));
  assert.ok(!report.blockedReasons.some((m) => m.includes('mame-to-cha.jp')), 'must never echo the offending email value');
});

test('hard-fails on a non-local-looking staff email', () => {
  const report = checkMameToChaLocalEnvironment(
    fullEnv({ MAME_TO_CHA_LOCAL_STAFF_EMAIL: 'staff@realclient.co.jp' }),
    MAME_TO_CHA_FIXTURE,
  );
  assert.equal(report.ok, false);
  assert.ok(report.blockedReasons.some((m) => m.includes('MAME_TO_CHA_LOCAL_STAFF_EMAIL')));
});
