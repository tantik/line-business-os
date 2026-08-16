import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { MAME_TO_CHA_STATE_SQL } from './mame-to-cha-state.js';
import { MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import {
  executeMameToChaCloudD6,
  MAME_TO_CHA_CLOUD_D6_SQL,
  runMameToChaCloudD6FromEnv,
} from './mame-to-cha-cloud-d6.js';
import {
  cloudGateConfirmation,
  MAME_TO_CHA_ACCEPTANCE_TARGET,
} from './mame-to-cha-cloud-gates.js';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const LOCATION_ID = '20000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '30000000-0000-4000-8000-000000000003';
const IDENTITY = {
  managerUserId: '40000000-0000-4000-8000-000000000004',
  staffUserId: '50000000-0000-4000-8000-000000000005',
};
const NOW = new Date('2026-07-20T00:00:00.000Z');

class FakeRunner implements QueryRunner {
  calls: { text: string; values?: readonly unknown[] }[] = [];
  contentExists = false;
  missingPrerequisite = false;

  async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
    this.calls.push({ text, values });
    if (text === MAME_TO_CHA_CLOUD_D6_SQL.selectTenant) {
      return { rows: [{
        id: TENANT_ID,
        name: MAME_TO_CHA_FIXTURE.tenant.displayName,
        kind: MAME_TO_CHA_FIXTURE.tenant.kind,
      }] as R[] };
    }
    if (text === MAME_TO_CHA_CLOUD_D6_SQL.selectLocation) {
      return { rows: [{
        id: LOCATION_ID,
        timezone: MAME_TO_CHA_FIXTURE.location.timezone,
        is_active: true,
      }] as R[] };
    }
    if (text === MAME_TO_CHA_CLOUD_D6_SQL.selectEmployee) {
      return { rows: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }] as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.tenantBySlug) {
      return { rows: [{
        id: TENANT_ID,
        name: MAME_TO_CHA_FIXTURE.tenant.displayName,
        kind: 'client',
        created_at: NOW,
      }] as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.roleByKey) return { rows: [{ id: `role-${values?.[0]}` }] as R[] };
    if (text === MAME_TO_CHA_STATE_SQL.userMirrorExists) return { rows: [{ exists: true }] as R[] };
    if (text === MAME_TO_CHA_STATE_SQL.locationsByTenant) {
      return { rows: [{ id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: true }] as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.enabledModules) {
      return { rows: [{ module: 'workforce' }] as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.membershipStatus) {
      return { rows: (this.missingPrerequisite ? [] : [{ status: 'active' }]) as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.roleAssignmentExists) return { rows: [{ exists: true }] as R[] };
    if (text === MAME_TO_CHA_STATE_SQL.employeeByUser) {
      return { rows: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }] as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.shiftTypeCodes) {
      return { rows: (this.contentExists ? MAME_TO_CHA_FIXTURE.shiftTypes.map(({ code }) => ({ code })) : []) as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.recipeCategoryLabels) {
      return { rows: (this.contentExists ? [{ label_ja: MAME_TO_CHA_FIXTURE.recipes[0]!.categoryLabelJa }] : []) as R[] };
    }
    if (text === MAME_TO_CHA_STATE_SQL.recipeTitles) {
      return { rows: (this.contentExists ? [{ title_ja: MAME_TO_CHA_FIXTURE.recipes[0]!.titleJa }] : []) as R[] };
    }
    if (
      text === MAME_TO_CHA_STATE_SQL.shiftAssignmentExists ||
      text === MAME_TO_CHA_STATE_SQL.shiftPreferenceExists ||
      text === MAME_TO_CHA_STATE_SQL.workReportExists ||
      text === MAME_TO_CHA_STATE_SQL.correctionRequestExists
    ) {
      return { rows: [{ exists: this.contentExists }] as R[] };
    }
    if (text === MAME_TO_CHA_WRITE_SQL.selectShiftTypeIdByCode) {
      return { rows: [{ id: `shift-type-${values?.[2]}` }] as R[] };
    }
    if (text === MAME_TO_CHA_WRITE_SQL.selectRecipeCategoryIdByLabel) {
      return { rows: [{ id: 'category-id' }] as R[] };
    }
    if (text === MAME_TO_CHA_WRITE_SQL.selectWorkReportId) {
      return { rows: [{ id: 'attendance-id' }] as R[] };
    }
    return { rows: [] };
  }
}

const D6_WRITES = [
  MAME_TO_CHA_WRITE_SQL.insertShiftType,
  MAME_TO_CHA_WRITE_SQL.insertRecipeCategory,
  MAME_TO_CHA_WRITE_SQL.insertRecipe,
  MAME_TO_CHA_WRITE_SQL.insertShiftAssignment,
  MAME_TO_CHA_WRITE_SQL.insertShiftPreferenceRequest,
  MAME_TO_CHA_WRITE_SQL.insertWorkReport,
  MAME_TO_CHA_WRITE_SQL.insertCorrectionRequest,
];

test('D6 creates exactly the deterministic content plus changed-only audit', async () => {
  const runner = new FakeRunner();
  const result = await executeMameToChaCloudD6(runner, IDENTITY, NOW);
  assert.equal(result.changedOperationCount, 8);
  assert.equal(result.auditRowCount, 9);
  assert.equal(runner.calls.filter((call) => D6_WRITES.includes(call.text)).length, 8);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertAudit).length, 9);
  for (const call of runner.calls.filter((candidate) => D6_WRITES.includes(candidate.text))) {
    assert.equal(call.values?.[0], TENANT_ID);
  }
});

test('D6 is a no-write no-audit result when exact fixture content exists', async () => {
  const runner = new FakeRunner();
  runner.contentExists = true;
  const result = await executeMameToChaCloudD6(runner, IDENTITY, NOW);
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0);
  assert.equal(runner.calls.some((call) => D6_WRITES.includes(call.text)), false);
  assert.equal(runner.calls.some((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertAudit), false);
});

test('D6 rejects an incomplete D1-D5 prerequisite before any write', async () => {
  const runner = new FakeRunner();
  runner.missingPrerequisite = true;
  await assert.rejects(() => executeMameToChaCloudD6(runner, IDENTITY, NOW), /D1-D5 prerequisites/);
  assert.equal(runner.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('D6 accepts the real Cloud prerequisite shape without a separate core module row', async () => {
  const runner = new FakeRunner();
  await executeMameToChaCloudD6(runner, IDENTITY, NOW);
  assert.equal(
    runner.calls.some((call) => call.text === MAME_TO_CHA_WRITE_SQL.upsertTenantModule),
    false,
  );
});

test('D6 write surface excludes identity, PII, module, and schema changes', () => {
  for (const sql of D6_WRITES) {
    for (const forbidden of [
      'auth.',
      'core.users',
      'tenant_memberships',
      'role_assignments',
      'tenant_modules',
      'workforce.employees',
      'name_encrypted',
      'name_hash',
      'alter ',
      'delete ',
      'drop ',
      'truncate ',
    ]) {
      assert.equal(sql.toLowerCase().includes(forbidden), false);
    }
  }
});

test('D6 preflight and writes never issue concurrent queries on one pg client', async () => {
  const runner = new FakeRunner();
  let active = 0;
  const query = runner.query.bind(runner);
  runner.query = async <R = unknown>(text: string, values?: readonly unknown[]) => {
    active += 1;
    assert.equal(active, 1, 'D6 issued concurrent queries through one runner');
    await Promise.resolve();
    try {
      return await query<R>(text, values);
    } finally {
      active -= 1;
    }
  };
  await executeMameToChaCloudD6(runner, IDENTITY, NOW);
});

test('D6 validates exact approval before constructing a Cloud client', async () => {
  let constructed = 0;
  await assert.rejects(
    () => runMameToChaCloudD6FromEnv(
      {
        gate: 'D6',
        projectRef: MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef,
        targetEnvironment: 'acceptance',
        confirm: undefined,
        mode: 'execute',
      },
      IDENTITY,
      { MAME_TO_CHA_CLOUD_DATABASE_URL: 'not-read-before-gate' },
      {
        createClient: () => {
          constructed += 1;
          throw new Error('must not construct');
        },
      },
    ),
    /confirmation phrase/,
  );
  assert.equal(constructed, 0);
  assert.equal(cloudGateConfirmation('D6'), 'EXECUTE D6 ON pehcoenozjtsjdvjietj FOR mame-to-cha');
});
