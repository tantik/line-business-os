import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from './onboard-db.js';
import { ONBOARD_WRITE_SQL } from './onboard-write.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import { executeMameToChaCloudD4, MAME_TO_CHA_CLOUD_D4_SQL } from './mame-to-cha-cloud-d4.js';

const TENANT = { id: '10000000-0000-4000-8000-000000000001', name: MAME_TO_CHA_FIXTURE.tenant.displayName, kind: MAME_TO_CHA_FIXTURE.tenant.kind };
const IDENTITY = { managerUserId: '20000000-0000-4000-8000-000000000002', staffUserId: '30000000-0000-4000-8000-000000000003' };

class FakeRunner implements QueryRunner {
  calls: { text: string; values?: readonly unknown[] }[] = [];
  existing = false;
  blocked = false;
  async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
    this.calls.push({ text, values });
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectTenant) return { rows: [TENANT] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectModule) return { rows: [{ is_enabled: true }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectUserMirror) return { rows: (this.existing ? [{ id: values?.[0] }] : []) as R[] };
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectMembership) return { rows: (this.blocked ? [{ status: 'suspended' }] : this.existing ? [{ status: 'active' }] : []) as R[] };
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectRole) return { rows: [{ id: values?.[0] === 'manager' ? 'role-manager' : 'role-employee' }] as R[] };
    if (text === MAME_TO_CHA_CLOUD_D4_SQL.selectRoleAssignment) return { rows: (this.existing ? [{ id: 'assignment' }] : []) as R[] };
    return { rows: [] };
  }
}

test('D4 creates exactly two mirrors, memberships, and role assignments plus changed-only audit', async () => {
  const runner = new FakeRunner();
  const result = await executeMameToChaCloudD4(runner, IDENTITY);
  assert.equal(result.changedOperationCount, 6);
  assert.equal(result.auditRowCount, 7);
  assert.equal(runner.calls.filter((c) => c.text === ONBOARD_WRITE_SQL.insertUser).length, 2);
  assert.equal(runner.calls.filter((c) => c.text === MAME_TO_CHA_WRITE_SQL.insertMembership).length, 2);
  assert.equal(runner.calls.filter((c) => c.text === MAME_TO_CHA_WRITE_SQL.insertRoleAssignment).length, 2);
  assert.equal(runner.calls.filter((c) => c.text === MAME_TO_CHA_WRITE_SQL.insertAudit).length, 7);
});

test('D4 is a no-write no-audit result when all access rows exist', async () => {
  const runner = new FakeRunner();
  runner.existing = true;
  const result = await executeMameToChaCloudD4(runner, IDENTITY);
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0);
  assert.equal(runner.calls.some((c) => c.text.startsWith('insert ') || c.text.startsWith('update ')), false);
});

test('D4 rejects blocked membership before any write', async () => {
  const runner = new FakeRunner();
  runner.blocked = true;
  await assert.rejects(() => executeMameToChaCloudD4(runner, IDENTITY), /blocked membership/);
  assert.equal(runner.calls.some((c) => c.text.startsWith('insert ') || c.text.startsWith('update ')), false);
});

test('D4 SQL surface excludes Auth, employee, PII, and business content', () => {
  const sql = JSON.stringify(MAME_TO_CHA_CLOUD_D4_SQL);
  for (const forbidden of ['auth.', 'workforce.', 'employees', 'recipes', 'shifts', 'name_encrypted', 'name_hash']) {
    assert.equal(sql.includes(forbidden), false);
  }
});
