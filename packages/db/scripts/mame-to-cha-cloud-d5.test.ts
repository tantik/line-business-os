import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { MAME_TO_CHA_WRITE_SQL, prepareEmployeeNamePII } from './mame-to-cha-write.js';
import {
  executeMameToChaCloudD5,
  MAME_TO_CHA_CLOUD_D5_SQL,
  runMameToChaCloudD5FromEnv,
} from './mame-to-cha-cloud-d5.js';
import {
  cloudGateConfirmation,
  MAME_TO_CHA_ACCEPTANCE_TARGET,
} from './mame-to-cha-cloud-gates.js';

const TENANT = {
  id: '10000000-0000-4000-8000-000000000001',
  name: MAME_TO_CHA_FIXTURE.tenant.displayName,
  kind: MAME_TO_CHA_FIXTURE.tenant.kind,
};
const LOCATION = {
  id: '20000000-0000-4000-8000-000000000002',
  name: MAME_TO_CHA_FIXTURE.location.name,
  timezone: MAME_TO_CHA_FIXTURE.location.timezone,
  is_active: true,
};
const STAFF_USER_ID = '30000000-0000-4000-8000-000000000003';
const PII = prepareEmployeeNamePII('Acceptance Staff One', {
  PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PII_HASH_PEPPER: 'test-only-pepper',
});

class FakeRunner implements QueryRunner {
  calls: { text: string; values?: readonly unknown[] }[] = [];
  existing = false;
  conflict = false;
  missingPrerequisite = false;

  async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
    this.calls.push({ text, values });
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectTenant) return { rows: [TENANT] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectLocations) return { rows: [LOCATION] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectModule) {
      return { rows: (this.missingPrerequisite ? [] : [{ is_enabled: true }]) as R[] };
    }
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectUserMirror) return { rows: [{ id: STAFF_USER_ID }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectMembership) return { rows: [{ status: 'active' }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectEmployeeRole) return { rows: [{ id: 'employee-role' }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectRoleAssignment) return { rows: [{ id: 'assignment' }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D5_SQL.selectEmployee) {
      if (!this.existing) return { rows: [] };
      return { rows: [{
        id: 'employee-id',
        location_id: LOCATION.id,
        name_hash: this.conflict ? 'wrong-hash' : PII.nameHash,
        position_label: 'ホールスタッフ',
        employment_type: 'part_time',
        is_active: true,
      }] as R[] };
    }
    return { rows: [] };
  }
}

test('D5 creates only one encrypted staff employee binding plus changed-only audit', async () => {
  const runner = new FakeRunner();
  const result = await executeMameToChaCloudD5(runner, STAFF_USER_ID, PII);
  assert.equal(result.changedOperationCount, 1);
  assert.equal(result.auditRowCount, 2);
  const insert = runner.calls.find((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertEmployee);
  assert.ok(insert);
  assert.ok(Buffer.isBuffer(insert.values?.[3]));
  assert.equal(insert.values?.includes('Acceptance Staff One'), false);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertAudit).length, 2);
});

test('D5 is a no-write no-audit result for an exact active binding', async () => {
  const runner = new FakeRunner();
  runner.existing = true;
  const result = await executeMameToChaCloudD5(runner, STAFF_USER_ID, PII);
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0);
  assert.equal(runner.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('D5 rejects missing D2-D4 prerequisites and conflicting PII before writing', async () => {
  const missing = new FakeRunner();
  missing.missingPrerequisite = true;
  await assert.rejects(() => executeMameToChaCloudD5(missing, STAFF_USER_ID, PII), /prerequisites/);
  assert.equal(missing.calls.some((call) => call.text.startsWith('insert ')), false);

  const conflict = new FakeRunner();
  conflict.existing = true;
  conflict.conflict = true;
  await assert.rejects(() => executeMameToChaCloudD5(conflict, STAFF_USER_ID, PII), /conflicting staff/);
  assert.equal(conflict.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('D5 SQL surface excludes Auth, acceptance content, and plaintext PII columns', () => {
  const sql = JSON.stringify(MAME_TO_CHA_CLOUD_D5_SQL);
  for (const forbidden of ['auth.', 'recipes', 'shifts', 'attendance', 'shift_requests', 'name_plaintext']) {
    assert.equal(sql.includes(forbidden), false);
  }
  assert.equal(MAME_TO_CHA_WRITE_SQL.insertEmployee.includes('name_encrypted'), true);
  assert.equal(MAME_TO_CHA_WRITE_SQL.insertEmployee.includes('name_hash'), true);
});

test('D5 preflight never runs concurrent queries on its single pg client', async () => {
  const runner = new FakeRunner();
  let active = 0;
  const query = runner.query.bind(runner);
  runner.query = async <R = unknown>(text: string, values?: readonly unknown[]) => {
    active += 1;
    assert.equal(active, 1, 'D5 issued concurrent queries through one runner');
    await Promise.resolve();
    try {
      return await query<R>(text, values);
    } finally {
      active -= 1;
    }
  };
  await executeMameToChaCloudD5(runner, STAFF_USER_ID, PII);
});

test('D5 validates exact approval and PII before constructing a Cloud client', async () => {
  let constructed = 0;
  const createClient = () => {
    constructed += 1;
    throw new Error('client must not be constructed');
  };
  const input = {
    gate: 'D5',
    projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
    targetEnvironment: 'acceptance',
    confirm: cloudGateConfirmation('D5'),
    mode: 'execute' as const,
  };
  await assert.rejects(
    () => runMameToChaCloudD5FromEnv(
      { ...input, confirm: undefined },
      STAFF_USER_ID,
      {},
      { createClient },
    ),
    /confirmation phrase/,
  );
  await assert.rejects(
    () => runMameToChaCloudD5FromEnv(
      input,
      STAFF_USER_ID,
      { MAME_TO_CHA_CLOUD_DATABASE_URL: 'not-read-before-pii' },
      { createClient },
    ),
    /PII_ENCRYPTION_KEY/,
  );
  assert.equal(constructed, 0);
});
