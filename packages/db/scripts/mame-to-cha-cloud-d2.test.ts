import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import { executeMameToChaCloudD2, MAME_TO_CHA_CLOUD_D2_SQL } from './mame-to-cha-cloud-d2.js';

const TENANT = {
  id: '10000000-0000-4000-8000-000000000001',
  name: MAME_TO_CHA_FIXTURE.tenant.displayName,
  kind: MAME_TO_CHA_FIXTURE.tenant.kind,
};

class FakeRunner implements QueryRunner {
  calls: { text: string; values?: readonly unknown[] }[] = [];
  tenantRows: unknown[] = [TENANT];
  moduleRows: unknown[] = [];
  async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
    this.calls.push({ text, values });
    if (text === MAME_TO_CHA_CLOUD_D2_SQL.selectTenant) return { rows: this.tenantRows as R[] };
    if (text === MAME_TO_CHA_CLOUD_D2_SQL.selectModule) return { rows: this.moduleRows as R[] };
    return { rows: [] };
  }
}

test('D2 enables only Workforce and writes changed-only audit', async () => {
  const runner = new FakeRunner();
  const result = await executeMameToChaCloudD2(runner);
  assert.equal(result.action, 'enable');
  assert.equal(result.changedOperationCount, 1);
  assert.equal(result.auditRowCount, 2);
  const moduleWrites = runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.upsertTenantModule);
  assert.equal(moduleWrites.length, 1);
  assert.deepEqual(moduleWrites[0]?.values, [TENANT.id, 'workforce']);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertAudit).length, 2);
});

test('D2 is an idempotent no-op when Workforce is already enabled', async () => {
  const runner = new FakeRunner();
  runner.moduleRows = [{ module: 'workforce', is_enabled: true }];
  const result = await executeMameToChaCloudD2(runner);
  assert.equal(result.action, 'reuse');
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0);
  assert.equal(runner.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('D2 fails closed when D1 tenant is absent or conflicting', async () => {
  const absent = new FakeRunner();
  absent.tenantRows = [];
  await assert.rejects(() => executeMameToChaCloudD2(absent), /exactly one existing D1 tenant/);
  assert.equal(absent.calls.some((call) => call.text.startsWith('insert ')), false);

  const conflict = new FakeRunner();
  conflict.tenantRows = [{ ...TENANT, name: 'Other' }];
  await assert.rejects(() => executeMameToChaCloudD2(conflict), /conflicting tenant/);
  assert.equal(conflict.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('D2 SQL surface excludes Auth, membership, role, employee, and business content', () => {
  const sql = JSON.stringify(MAME_TO_CHA_CLOUD_D2_SQL);
  for (const forbidden of ['auth.', 'tenant_memberships', 'role_assignments', 'employees', 'recipes', 'shifts']) {
    assert.equal(sql.includes(forbidden), false);
  }
});
