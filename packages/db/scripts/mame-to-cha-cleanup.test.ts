import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryRunner } from './onboard-db.js';
import {
  MAME_TO_CHA_CLEANUP_SQL,
  buildMameToChaCleanupPlan,
  executeMameToChaCleanupPlan,
  runMameToChaCleanupCommitFromEnv,
  runMameToChaCleanupDryRunFromEnv,
  validateMameToChaCleanupOrThrow,
} from './mame-to-cha-cleanup.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import type { LoadedMameToChaFixtureState, MameToChaFixtureIdentity } from './mame-to-cha-state.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';
import type { DryRunPgClient } from './onboard-write.js';
import type { CommitPgClient } from './onboard-commit.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const STAFF_ROLE_ID = '44444444-4444-4444-8444-444444444444';
const MANAGER_USER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_USER_ID = '66666666-6666-4666-8666-666666666666';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const IDENTITY: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: STAFF_USER_ID };
const NOW = new Date('2026-06-01T00:00:00Z');

class FakeRunner implements QueryRunner {
  public calls: { text: string; values: readonly unknown[] }[] = [];
  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values: values ?? [] });
    return { rows: [] as T[] };
  }
}

function fullyPresentLoadedState(): LoadedMameToChaFixtureState {
  return {
    ids: {
      tenantId: TENANT_ID,
      locationId: LOCATION_ID,
      roleIdByKey: { manager: MANAGER_ROLE_ID, employee: STAFF_ROLE_ID },
      staffEmployeeId: EMPLOYEE_ID,
    },
    state: {
      tenantExists: true,
      locationExists: true,
      enabledModules: ['core', 'workforce'],
      membershipsByLogicalId: { 'manager-1': 'active', 'staff-1': 'active' },
      roleAssignmentsByLogicalId: { 'manager-1': true, 'staff-1': true },
      employeeBindingsByLogicalId: { 'staff-1': true },
      shiftTypeCodesPresent: MAME_TO_CHA_FIXTURE.shiftTypes.map((s) => s.code),
      recipeCategoryLabelsPresent: MAME_TO_CHA_FIXTURE.recipes.map((r) => r.categoryLabelJa),
      recipeTitlesPresent: MAME_TO_CHA_FIXTURE.recipes.map((r) => r.titleJa),
      acceptanceDataPresent: {
        shiftAssignment: true,
        shiftPreferenceRequest: true,
        workReport: true,
        correctionRequest: true,
      },
    },
  };
}

function nothingPresentLoadedState(): LoadedMameToChaFixtureState {
  return {
    ids: { tenantId: TENANT_ID, locationId: LOCATION_ID, roleIdByKey: {}, staffEmployeeId: null },
    state: {},
  };
}

// ===========================================================================
// validateMameToChaCleanupOrThrow
// ===========================================================================

test('validateMameToChaCleanupOrThrow accepts the tracked fixture', () => {
  assert.doesNotThrow(() => validateMameToChaCleanupOrThrow(MAME_TO_CHA_FIXTURE));
});

test('validateMameToChaCleanupOrThrow rejects an empty (wildcard-shaped) slug', () => {
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: '' as never } };
  assert.throws(() => validateMameToChaCleanupOrThrow(fixture), /must not be empty/);
});

test('validateMameToChaCleanupOrThrow rejects a foreign tenant slug', () => {
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'some-other-tenant' as never } };
  assert.throws(() => validateMameToChaCleanupOrThrow(fixture), /exactly "mame-to-cha"/);
});

test('validateMameToChaCleanupOrThrow refuses the protected mame-to-cha-tokyo slug', () => {
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'mame-to-cha-tokyo' as never } };
  assert.throws(() => validateMameToChaCleanupOrThrow(fixture));
});

// ===========================================================================
// buildMameToChaCleanupPlan — dependency order + present flags
// ===========================================================================

test('the plan lists acceptance data before structural fixture rows (safe dependency order)', () => {
  const plan = buildMameToChaCleanupPlan(MAME_TO_CHA_FIXTURE, fullyPresentLoadedState());
  const order = plan.map((op) => op.entity);
  assert.ok(order.indexOf('correction_request') < order.indexOf('employee_binding'));
  assert.ok(order.indexOf('employee_binding') < order.indexOf('role_assignment'));
  assert.ok(order.indexOf('role_assignment') < order.indexOf('membership'));
  assert.ok(order.indexOf('membership') < order.indexOf('shift_type'));
  assert.ok(order.indexOf('recipe') < order.indexOf('recipe_category'));
});

test('the plan never includes the tenant, location, or tenant_module entities', () => {
  const plan = buildMameToChaCleanupPlan(MAME_TO_CHA_FIXTURE, fullyPresentLoadedState());
  const entities = new Set(plan.map((op) => op.entity));
  assert.ok(!entities.has('tenant' as never));
  assert.ok(!entities.has('location' as never));
  assert.ok(!entities.has('tenant_module' as never));
});

test('when nothing exists yet, the plan marks every operation as not present', () => {
  const plan = buildMameToChaCleanupPlan(MAME_TO_CHA_FIXTURE, nothingPresentLoadedState());
  assert.ok(plan.every((op) => op.present === false));
});

// ===========================================================================
// executeMameToChaCleanupPlan — scoped deletes, no wildcard, idempotent
// ===========================================================================

test('a fully-present fixture is fully removed, every delete scoped to the resolved tenant id', async () => {
  const runner = new FakeRunner();
  const summary = await executeMameToChaCleanupPlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, fullyPresentLoadedState(), NOW);
  assert.ok(summary.removedCount > 0);
  for (const call of runner.calls) {
    assert.equal(call.values[0], TENANT_ID, `expected ${call.text} to be scoped to the resolved tenant id`);
  }
});

test('nothing present -> zero deletes issued (idempotent no-op)', async () => {
  const runner = new FakeRunner();
  const summary = await executeMameToChaCleanupPlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, nothingPresentLoadedState(), NOW);
  assert.equal(summary.removedCount, 0);
  assert.equal(runner.calls.length, 0);
});

test('when the tenant does not exist at all, no query runs and the result is a clean no-op', async () => {
  const runner = new FakeRunner();
  const loaded: LoadedMameToChaFixtureState = { ids: { tenantId: null, locationId: null, roleIdByKey: {}, staffEmployeeId: null }, state: {} };
  const summary = await executeMameToChaCleanupPlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, loaded, NOW);
  assert.equal(summary.removedCount, 0);
  assert.equal(runner.calls.length, 0);
});

test('no delete statement is a tenant-only wildcard (every one also scopes by a fixture-owned key)', () => {
  for (const sql of Object.values(MAME_TO_CHA_CLEANUP_SQL)) {
    // Every DELETE must bind at least two parameters: tenant_id plus a
    // fixture-owned natural key (user id, employee id + date, code, title).
    const placeholderCount = (sql.match(/\$\d/g) ?? []).length;
    assert.ok(placeholderCount >= 2, `expected a non-wildcard scoped delete: ${sql}`);
    assert.ok(/tenant_id\s*=\s*\$1/.test(sql), `expected tenant_id = $1 scoping: ${sql}`);
  }
});

test('no cleanup SQL literally references mame-to-cha-tokyo or truncates/drops', () => {
  const allSql = Object.values(MAME_TO_CHA_CLEANUP_SQL).join(' ');
  assert.ok(!allSql.includes('mame-to-cha-tokyo'));
  assert.ok(!/\b(truncate|drop)\b/i.test(allSql));
});

test('no cleanup SQL statement ever targets core.users or auth.users (Auth/user-mirror deletion is out of scope)', () => {
  const allSql = Object.values(MAME_TO_CHA_CLEANUP_SQL).join(' ').toLowerCase();
  assert.ok(!allSql.includes('core.users'));
  assert.ok(!allSql.includes('auth.users'));
});

test('executeMameToChaCleanupPlan rejects identical manager/staff ids before any query', async () => {
  const runner = new FakeRunner();
  const identicalIdentity: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: MANAGER_USER_ID };
  await assert.rejects(
    executeMameToChaCleanupPlan(runner, MAME_TO_CHA_FIXTURE, identicalIdentity, fullyPresentLoadedState(), NOW),
    /distinct/,
  );
  assert.equal(runner.calls.length, 0, 'no query should run once the identity gate throws');
});

test('the shift-assignment/preference/work-report/correction-request deletes target the exact acceptance-data key', async () => {
  const runner = new FakeRunner();
  await executeMameToChaCleanupPlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, fullyPresentLoadedState(), NOW);
  const shiftDate = resolveIsoDate(NOW, MAME_TO_CHA_FIXTURE.acceptanceData.shiftAssignmentDayOffset);
  const startsAtIso = localDateTimeToUtcIso(shiftDate, MAME_TO_CHA_FIXTURE.shiftTypes[0]!.startsAtLocal, MAME_TO_CHA_FIXTURE.location.timezone);
  const shiftDeleteCall = runner.calls.find((c) => c.text === MAME_TO_CHA_CLEANUP_SQL.deleteShiftAssignment);
  assert.ok(shiftDeleteCall);
  assert.equal(shiftDeleteCall.values[1], EMPLOYEE_ID);
  assert.equal(shiftDeleteCall.values[2], startsAtIso);
});

// ===========================================================================
// Dry-run / commit entry points (fake pg client -- no real DB)
// ===========================================================================

function fakeClient(handler: (text: string, values: readonly unknown[]) => unknown[]): DryRunPgClient & CommitPgClient {
  return {
    connect: async () => undefined,
    query: async (text, values) => ({ rows: handler(text, values ?? []) }),
    end: async () => undefined,
  };
}

test('runMameToChaCleanupDryRunFromEnv requires DATABASE_URL', async () => {
  delete process.env.DATABASE_URL;
  await assert.rejects(
    runMameToChaCleanupDryRunFromEnv(MAME_TO_CHA_FIXTURE, IDENTITY, NOW),
    /DATABASE_URL is required/,
  );
});

test('runMameToChaCleanupDryRunFromEnv rejects identical manager/staff ids before connecting', async () => {
  const identicalIdentity: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: MANAGER_USER_ID };
  await assert.rejects(
    runMameToChaCleanupDryRunFromEnv(MAME_TO_CHA_FIXTURE, identicalIdentity, NOW),
    /distinct/,
  );
});

test('runMameToChaCleanupCommitFromEnv rejects identical manager/staff ids before connecting', async () => {
  const identicalIdentity: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: MANAGER_USER_ID };
  await assert.rejects(
    runMameToChaCleanupCommitFromEnv(MAME_TO_CHA_FIXTURE, identicalIdentity, NOW),
    /distinct/,
  );
});

test('runMameToChaCleanupDryRunFromEnv always rolls back and never commits, even with rows present', async () => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const queries: string[] = [];
  const client = fakeClient((text) => {
    queries.push(text);
    if (text === 'select id, name, kind from core.tenants where slug = $1') {
      return [{ id: TENANT_ID, name: MAME_TO_CHA_FIXTURE.tenant.displayName, kind: 'client' }];
    }
    return [];
  });
  try {
    const result = await runMameToChaCleanupDryRunFromEnv(MAME_TO_CHA_FIXTURE, IDENTITY, NOW, { createClient: () => client });
    assert.equal(result.rolledBack, true);
    assert.equal(result.removed, false);
    assert.ok(queries.includes('begin'));
    assert.ok(queries.includes('rollback'));
    assert.ok(!queries.includes('commit'));
  } finally {
    delete process.env.DATABASE_URL;
  }
});

test('runMameToChaCleanupCommitFromEnv is a rolled-back no-op when the tenant does not exist', async () => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const client = fakeClient(() => []);
  try {
    const result = await runMameToChaCleanupCommitFromEnv(MAME_TO_CHA_FIXTURE, IDENTITY, NOW, { createClient: () => client });
    assert.equal(result.committed, false);
    assert.equal(result.noop, true);
    assert.equal(result.removedCount, 0);
  } finally {
    delete process.env.DATABASE_URL;
  }
});
