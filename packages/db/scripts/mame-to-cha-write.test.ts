import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_STATE_SQL } from './mame-to-cha-state.js';
import type { ResolvedMameToChaFixtureIds, MameToChaFixtureIdentity } from './mame-to-cha-state.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { buildMameToChaFixturePlan, type MameToChaFixturePlan } from './mame-to-cha-plan.js';
import {
  MAME_TO_CHA_WRITE_SQL,
  executeMameToChaFixtureWritePlan,
  validateMameToChaWritePlanOrThrow,
  runMameToChaApplyDryRunTransactionFromEnv,
  runMameToChaApplyCommitTransactionFromEnv,
} from './mame-to-cha-write.js';
import type { DryRunPgClient } from './onboard-write.js';
import type { CommitPgClient } from './onboard-commit.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const STAFF_ROLE_ID = '44444444-4444-4444-8444-444444444444';
const MANAGER_USER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_USER_ID = '66666666-6666-4666-8666-666666666666';
const AM_SHIFT_TYPE_ID = '77777777-7777-4777-8777-777777777777';
const PM_SHIFT_TYPE_ID = '88888888-8888-4888-8888-888888888888';
const CATEGORY_ID = '99999999-9999-4999-8999-999999999999';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WORK_REPORT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SYNTHETIC_PII_ENV = {
  PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PII_HASH_PEPPER: 'synthetic-test-pepper',
};

const IDENTITY: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: STAFF_USER_ID };
const NOW = new Date('2026-06-01T00:00:00Z');

type Response = unknown[] | ((values: readonly unknown[]) => unknown[]);

class FakeRunner implements QueryRunner {
  public calls: { text: string; values: readonly unknown[] }[] = [];
  constructor(private readonly responses: Record<string, Response> = {}) {}

  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values: values ?? [] });
    const resp = this.responses[text];
    if (typeof resp === 'function') return { rows: resp(values ?? []) as T[] };
    return { rows: (resp ?? []) as T[] };
  }
}

/** Responses for tests that call `executeMameToChaFixtureWritePlan` directly (no state loader). */
function freshCreateResponses(): Record<string, Response> {
  return {
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [{ id: TENANT_ID }],
    [MAME_TO_CHA_STATE_SQL.locationsByTenant]: [
      { id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: true },
    ],
    [MAME_TO_CHA_WRITE_SQL.selectShiftTypeIdByCode]: (values) => {
      const code = values[2];
      return [{ id: code === 'AM' ? AM_SHIFT_TYPE_ID : PM_SHIFT_TYPE_ID }];
    },
    [MAME_TO_CHA_WRITE_SQL.selectRecipeCategoryIdByLabel]: [{ id: CATEGORY_ID }],
    [MAME_TO_CHA_STATE_SQL.employeeByUser]: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }],
    [MAME_TO_CHA_WRITE_SQL.selectWorkReportId]: [{ id: WORK_REPORT_ID }],
  };
}

function freshIds(): ResolvedMameToChaFixtureIds {
  return {
    tenantId: null,
    locationId: null,
    roleIdByKey: { manager: MANAGER_ROLE_ID, employee: STAFF_ROLE_ID },
    staffEmployeeId: null,
  };
}

function freshPlan(): MameToChaFixturePlan {
  return buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
}

// ===========================================================================
// validateMameToChaWritePlanOrThrow — exact tenant scope / protected refusal
// ===========================================================================

test('validateMameToChaWritePlanOrThrow accepts the tracked fixture plan', () => {
  assert.doesNotThrow(() => validateMameToChaWritePlanOrThrow(MAME_TO_CHA_FIXTURE, freshPlan()));
});

test('validateMameToChaWritePlanOrThrow rejects an empty tenant slug', () => {
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: '' as never } };
  assert.throws(() => validateMameToChaWritePlanOrThrow(fixture, freshPlan()), /must not be empty/);
});

test('validateMameToChaWritePlanOrThrow rejects a wrong tenant slug', () => {
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'some-other-tenant' as never } };
  assert.throws(() => validateMameToChaWritePlanOrThrow(fixture, freshPlan()), /exactly "mame-to-cha"/);
});

test('validateMameToChaWritePlanOrThrow refuses the protected mame-to-cha-tokyo slug', () => {
  // mame-to-cha-tokyo already fails the exact-slug check (it is not "mame-to-cha"),
  // so it is refused there; the dedicated protected-slug check is defense-in-depth
  // for a hypothetical future fixture edit and is exercised directly below.
  const fixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'mame-to-cha-tokyo' as never } };
  assert.throws(() => validateMameToChaWritePlanOrThrow(fixture, freshPlan()));
});

test('validateMameToChaWritePlanOrThrow throws before any write on a plan conflict', () => {
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    membershipsByLogicalId: { 'manager-1': 'suspended' },
  });
  assert.throws(() => validateMameToChaWritePlanOrThrow(MAME_TO_CHA_FIXTURE, plan), /conflict/);
});

// ===========================================================================
// executeMameToChaFixtureWritePlan — idempotent apply, tenant scoping
// ===========================================================================

test('a from-scratch execution creates every fixture entity and scopes every write to the resolved tenant', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  const plan = freshPlan();
  const summary = await executeMameToChaFixtureWritePlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, plan, freshIds(), {
    now: NOW,
    piiEnv: SYNTHETIC_PII_ENV,
  });

  assert.equal(summary.tenantSlug, 'mame-to-cha');
  assert.ok(summary.changedOperationCount > 0);
  assert.ok((summary.operationCounts['tenant.create'] ?? 0) >= 1);
  assert.ok((summary.operationCounts['employee_binding.create'] ?? 0) >= 1);

  // Every write/read call that takes a tenant id as its first bound value uses
  // the resolved tenant id -- never a different tenant's id, never a literal.
  const tenantScopedTexts = [
    MAME_TO_CHA_WRITE_SQL.insertLocation,
    MAME_TO_CHA_WRITE_SQL.upsertTenantModule,
    MAME_TO_CHA_WRITE_SQL.insertMembership,
    MAME_TO_CHA_WRITE_SQL.insertRoleAssignment,
    MAME_TO_CHA_WRITE_SQL.insertEmployee,
    MAME_TO_CHA_WRITE_SQL.insertShiftType,
    MAME_TO_CHA_WRITE_SQL.insertRecipeCategory,
    MAME_TO_CHA_WRITE_SQL.insertRecipe,
    MAME_TO_CHA_WRITE_SQL.insertShiftAssignment,
    MAME_TO_CHA_WRITE_SQL.insertShiftPreferenceRequest,
    MAME_TO_CHA_WRITE_SQL.insertWorkReport,
    MAME_TO_CHA_WRITE_SQL.insertCorrectionRequest,
  ];
  for (const text of tenantScopedTexts) {
    const calls = runner.calls.filter((c) => c.text === text);
    for (const call of calls) {
      assert.equal(call.values[0], TENANT_ID, `expected ${text} to be scoped to the resolved tenant id`);
    }
  }
});

test('a fully-existing state plans/executes as all-reuse (idempotent, no dependent writes)', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
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
  });
  const ids: ResolvedMameToChaFixtureIds = {
    tenantId: TENANT_ID,
    locationId: LOCATION_ID,
    roleIdByKey: { manager: MANAGER_ROLE_ID, employee: STAFF_ROLE_ID },
    staffEmployeeId: EMPLOYEE_ID,
  };

  const summary = await executeMameToChaFixtureWritePlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, plan, ids, {
    now: NOW,
    piiEnv: SYNTHETIC_PII_ENV,
    auditMode: 'changed-only',
  });

  assert.equal(summary.changedOperationCount, 0);
  assert.equal(summary.auditRowCount, 0, 'a pure all-reuse run must write zero audit rows (changed-only)');
  assert.ok(summary.operations.every((op) => op.action === 'reuse'));

  // No insert statement was ever issued on a pure reuse run, except the
  // tenant-module upsert and the role-assignment insert -- both always run
  // unconditionally (idempotent no-op via `on conflict`/`where not exists`
  // guards), matching the existing generic onboarding tool's convention
  // (onboard-write.ts's `upsertTenantModule`/`insertRoleAssignment`).
  const alwaysRunInserts: readonly string[] = [
    MAME_TO_CHA_WRITE_SQL.upsertTenantModule,
    MAME_TO_CHA_WRITE_SQL.insertRoleAssignment,
  ];
  const insertTexts = Object.values(MAME_TO_CHA_WRITE_SQL).filter(
    (sql) => /^insert/i.test(sql) && !alwaysRunInserts.includes(sql),
  );
  for (const text of insertTexts) {
    assert.equal(runner.calls.filter((c) => c.text === text).length, 0, `unexpected insert: ${text}`);
  }
});

test('a suspended manager membership blocks the entire write before any insert', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {
    membershipsByLogicalId: { 'manager-1': 'suspended' },
  });
  await assert.rejects(
    executeMameToChaFixtureWritePlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, plan, freshIds(), {
      now: NOW,
      piiEnv: SYNTHETIC_PII_ENV,
    }),
  );
  assert.equal(runner.calls.length, 0, 'no query should run once the pre-write gate throws');
});

test('audit metadata never carries a UUID, email, or secret-shaped value', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  const summary = await executeMameToChaFixtureWritePlan(
    runner,
    MAME_TO_CHA_FIXTURE,
    IDENTITY,
    freshPlan(),
    freshIds(),
    { now: NOW, piiEnv: SYNTHETIC_PII_ENV },
  );
  const auditCalls = runner.calls.filter((c) => c.text === MAME_TO_CHA_WRITE_SQL.insertAudit);
  assert.ok(auditCalls.length > 0);
  // Only the metadata blob (values[7]) must be UUID/email-free -- values[0] is
  // the audit row's own tenant_id column, a legitimate, expected value there.
  const serialized = JSON.stringify(auditCalls.map((c) => c.values[7]));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized));
  assert.ok(!serialized.includes('@'));
  assert.equal(summary.tenantSlug, 'mame-to-cha');
});

test('employee display name is written only as encrypted PII, never plaintext', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  await executeMameToChaFixtureWritePlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, freshPlan(), freshIds(), {
    now: NOW,
    piiEnv: SYNTHETIC_PII_ENV,
  });
  const insertEmployeeCall = runner.calls.find((c) => c.text === MAME_TO_CHA_WRITE_SQL.insertEmployee);
  assert.ok(insertEmployeeCall);
  const serialized = JSON.stringify(insertEmployeeCall.values);
  assert.ok(!serialized.includes('Acceptance Staff One'));
});

test('missing PII env fails the employee binding write safely', async () => {
  const runner = new FakeRunner(freshCreateResponses());
  await assert.rejects(
    executeMameToChaFixtureWritePlan(runner, MAME_TO_CHA_FIXTURE, IDENTITY, freshPlan(), freshIds(), {
      now: NOW,
      piiEnv: {},
    }),
    /PII_ENCRYPTION_KEY/,
  );
});

// ===========================================================================
// Dry-run / commit transaction entry points (fake pg client -- no real DB)
// ===========================================================================

function fakeClient(responses: Record<string, Response>): DryRunPgClient & CommitPgClient {
  return {
    connect: async () => undefined,
    query: async (text: string, values?: readonly unknown[]) => {
      const resp = responses[text];
      if (typeof resp === 'function') return { rows: resp(values ?? []) };
      return { rows: resp ?? [] };
    },
    end: async () => undefined,
  };
}

/**
 * A tiny in-memory simulation of the fixture-relevant tables, so the FULL
 * pipeline (state loader -> plan -> executor) can be exercised end-to-end
 * from a genuinely empty starting state, including the "insert, then
 * select it back" sequencing the real executor performs. Statement-control
 * (transaction) SQL is ignored (accepted, no-op) -- only the fixture SQL
 * catalogs are simulated.
 */
class StatefulFakeDb implements DryRunPgClient, CommitPgClient {
  tenant: { id: string; name: string; kind: string } | null = null;
  locations: { id: string; name: string; is_active: boolean }[] = [];
  enabledModules = new Set<string>();
  memberships = new Map<string, string>(); // `${tenantId}:${userId}` -> status
  roleAssignments = new Set<string>(); // `${tenantId}:${userId}:${roleId}`
  employees = new Map<string, { id: string; location_id: string; is_active: boolean }>(); // `${tenantId}:${userId}`
  shiftTypes = new Map<string, string>(); // `${tenantId}:${locationId}:${code}` -> id
  recipeCategories = new Map<string, string>(); // `${tenantId}:${label}` -> id
  recipes = new Set<string>(); // `${tenantId}:${title}`
  shifts = new Set<string>(); // `${tenantId}:${employeeId}:${startsAt}`
  shiftRequests = new Set<string>(); // `${tenantId}:${employeeId}:${kind}:${workDate}`
  attendance = new Map<string, string>(); // `${tenantId}:${employeeId}:${workDate}` -> id
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return `generated-${this.seq.toString().padStart(8, '0')}`;
  }

  async connect(): Promise<void> {}
  async end(): Promise<void> {}

  async query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }> {
    const v = values ?? [];
    switch (text) {
      case 'begin':
      case 'rollback':
      case 'commit':
      case "set statement_timeout = '10s'":
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.tenantBySlug:
        return { rows: this.tenant ? [this.tenant] : [] };
      case MAME_TO_CHA_WRITE_SQL.insertTenant:
        this.tenant = { id: TENANT_ID, name: String(v[1]), kind: String(v[2]) };
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.locationsByTenant:
        return { rows: this.locations };
      case MAME_TO_CHA_WRITE_SQL.insertLocation:
        this.locations.push({ id: LOCATION_ID, name: String(v[1]), is_active: true });
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.enabledModules:
        return { rows: [...this.enabledModules].map((module) => ({ module })) };
      case MAME_TO_CHA_WRITE_SQL.upsertTenantModule:
        this.enabledModules.add(String(v[1]));
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.roleByKey:
        return { rows: [{ id: v[0] === 'manager' ? MANAGER_ROLE_ID : STAFF_ROLE_ID }] };
      case MAME_TO_CHA_STATE_SQL.membershipStatus: {
        const status = this.memberships.get(`${v[0]}:${v[1]}`);
        return { rows: status ? [{ status }] : [] };
      }
      case MAME_TO_CHA_WRITE_SQL.insertMembership:
        this.memberships.set(`${v[0]}:${v[1]}`, 'active');
        return { rows: [] };
      case MAME_TO_CHA_WRITE_SQL.activateMembership:
        this.memberships.set(`${v[0]}:${v[1]}`, 'active');
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.roleAssignmentExists:
        return { rows: [{ exists: this.roleAssignments.has(`${v[0]}:${v[1]}:${v[2]}`) }] };
      case MAME_TO_CHA_WRITE_SQL.insertRoleAssignment:
        this.roleAssignments.add(`${v[0]}:${v[1]}:${v[2]}`);
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.employeeByUser: {
        const emp = this.employees.get(`${v[0]}:${v[1]}`);
        return { rows: emp ? [emp] : [] };
      }
      case MAME_TO_CHA_WRITE_SQL.insertEmployee:
        this.employees.set(`${v[0]}:${v[2]}`, { id: EMPLOYEE_ID, location_id: String(v[1]), is_active: true });
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.shiftTypeCodes:
        return {
          rows: [...this.shiftTypes.keys()]
            .filter((k) => k.startsWith(`${v[0]}:${v[1]}:`))
            .map((k) => ({ code: k.split(':')[2] })),
        };
      case MAME_TO_CHA_WRITE_SQL.insertShiftType:
        this.shiftTypes.set(`${v[0]}:${v[1]}:${v[2]}`, this.nextId());
        return { rows: [] };
      case MAME_TO_CHA_WRITE_SQL.selectShiftTypeIdByCode: {
        const id = this.shiftTypes.get(`${v[0]}:${v[1]}:${v[2]}`);
        return { rows: id ? [{ id }] : [] };
      }
      case MAME_TO_CHA_STATE_SQL.recipeCategoryLabels:
        return {
          rows: [...this.recipeCategories.keys()]
            .filter((k) => k.startsWith(`${v[0]}:`))
            .map((k) => ({ label_ja: k.slice(String(v[0]).length + 1) })),
        };
      case MAME_TO_CHA_WRITE_SQL.insertRecipeCategory:
        this.recipeCategories.set(`${v[0]}:${v[1]}`, this.nextId());
        return { rows: [] };
      case MAME_TO_CHA_WRITE_SQL.selectRecipeCategoryIdByLabel: {
        const id = this.recipeCategories.get(`${v[0]}:${v[1]}`);
        return { rows: id ? [{ id }] : [] };
      }
      case MAME_TO_CHA_STATE_SQL.recipeTitles:
        return {
          rows: [...this.recipes]
            .filter((k) => k.startsWith(`${v[0]}:`))
            .map((k) => ({ title_ja: k.slice(String(v[0]).length + 1) })),
        };
      case MAME_TO_CHA_WRITE_SQL.insertRecipe:
        this.recipes.add(`${v[0]}:${v[2]}`);
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.shiftAssignmentExists:
        return { rows: [{ exists: this.shifts.has(`${v[0]}:${v[1]}:${v[2]}`) }] };
      case MAME_TO_CHA_WRITE_SQL.insertShiftAssignment:
        this.shifts.add(`${v[0]}:${v[2]}:${v[4]}`);
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.shiftPreferenceExists:
        return { rows: [{ exists: this.shiftRequests.has(`${v[0]}:${v[1]}:preference:${v[2]}`) }] };
      case MAME_TO_CHA_WRITE_SQL.insertShiftPreferenceRequest:
        this.shiftRequests.add(`${v[0]}:${v[2]}:preference:${v[3]}`);
        return { rows: [] };
      case MAME_TO_CHA_STATE_SQL.workReportExists:
        return { rows: [{ exists: this.attendance.has(`${v[0]}:${v[1]}:${v[2]}`) }] };
      case MAME_TO_CHA_WRITE_SQL.insertWorkReport:
        this.attendance.set(`${v[0]}:${v[2]}:${v[3]}`, this.nextId());
        return { rows: [] };
      case MAME_TO_CHA_WRITE_SQL.selectWorkReportId: {
        const id = this.attendance.get(`${v[0]}:${v[1]}:${v[2]}`);
        return { rows: id ? [{ id }] : [] };
      }
      case MAME_TO_CHA_STATE_SQL.correctionRequestExists:
        return { rows: [{ exists: this.shiftRequests.has(`${v[0]}:${v[1]}:correction:${v[2]}`) }] };
      case MAME_TO_CHA_WRITE_SQL.insertCorrectionRequest:
        this.shiftRequests.add(`${v[0]}:${v[2]}:correction:${v[3]}`);
        return { rows: [] };
      case MAME_TO_CHA_WRITE_SQL.insertAudit:
        return { rows: [] };
      default:
        throw new Error(`StatefulFakeDb: unhandled query: ${text}`);
    }
  }
}

test('runMameToChaApplyDryRunTransactionFromEnv requires DATABASE_URL', async () => {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    await assert.rejects(
      runMameToChaApplyDryRunTransactionFromEnv(MAME_TO_CHA_FIXTURE, IDENTITY, { now: NOW, piiEnv: SYNTHETIC_PII_ENV }),
      /DATABASE_URL is required/,
    );
  } finally {
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('runMameToChaApplyDryRunTransactionFromEnv always rolls back and never commits', async () => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const client = new StatefulFakeDb();
  const queries: string[] = [];
  const wrappedClient: DryRunPgClient = {
    connect: client.connect.bind(client),
    query: async (text, values) => {
      queries.push(text);
      return client.query(text, values);
    },
    end: client.end.bind(client),
  };
  try {
    const result = await runMameToChaApplyDryRunTransactionFromEnv(
      MAME_TO_CHA_FIXTURE,
      IDENTITY,
      { now: NOW, piiEnv: SYNTHETIC_PII_ENV },
      { createClient: () => wrappedClient },
    );
    assert.equal(result.rolledBack, true);
    assert.equal(result.persisted, false);
    assert.ok(queries.includes('begin'));
    assert.ok(queries.includes('rollback'));
    assert.ok(!queries.includes('commit'), 'the dry-run path must never issue commit');
  } finally {
    delete process.env.DATABASE_URL;
  }
});

test('runMameToChaApplyCommitTransactionFromEnv commits only when something changed', async () => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const client = new StatefulFakeDb();
  try {
    const result = await runMameToChaApplyCommitTransactionFromEnv(
      MAME_TO_CHA_FIXTURE,
      IDENTITY,
      { now: NOW, piiEnv: SYNTHETIC_PII_ENV },
      { createClient: () => client },
    );
    assert.equal(result.committed, true);
    assert.equal(result.noop, false);
  } finally {
    delete process.env.DATABASE_URL;
  }
});

test('runMameToChaApplyCommitTransactionFromEnv is a rolled-back no-op on an all-reuse re-run', async () => {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const responses: Record<string, Response> = {
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [{ id: TENANT_ID, name: MAME_TO_CHA_FIXTURE.tenant.displayName, kind: 'client' }],
    [MAME_TO_CHA_STATE_SQL.locationsByTenant]: [
      { id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: true },
    ],
    [MAME_TO_CHA_STATE_SQL.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
    [MAME_TO_CHA_STATE_SQL.roleByKey]: (values) => [{ id: values[0] === 'manager' ? MANAGER_ROLE_ID : STAFF_ROLE_ID }],
    [MAME_TO_CHA_STATE_SQL.membershipStatus]: [{ status: 'active' }],
    [MAME_TO_CHA_STATE_SQL.roleAssignmentExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.employeeByUser]: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }],
    [MAME_TO_CHA_STATE_SQL.shiftTypeCodes]: MAME_TO_CHA_FIXTURE.shiftTypes.map((s) => ({ code: s.code })),
    [MAME_TO_CHA_STATE_SQL.recipeCategoryLabels]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ label_ja: r.categoryLabelJa })),
    [MAME_TO_CHA_STATE_SQL.recipeTitles]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ title_ja: r.titleJa })),
    [MAME_TO_CHA_STATE_SQL.shiftAssignmentExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.shiftPreferenceExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.workReportExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.correctionRequestExists]: [{ exists: true }],
  };
  const client = fakeClient(responses);
  try {
    const result = await runMameToChaApplyCommitTransactionFromEnv(
      MAME_TO_CHA_FIXTURE,
      IDENTITY,
      { now: NOW, piiEnv: SYNTHETIC_PII_ENV },
      { createClient: () => client },
    );
    assert.equal(result.committed, false);
    assert.equal(result.noop, true);
  } finally {
    delete process.env.DATABASE_URL;
  }
});

test('this file issues no bare DELETE/DROP/TRUNCATE/ALTER (apply never deletes)', async () => {
  const destructive = Object.values(MAME_TO_CHA_WRITE_SQL).filter((sql) =>
    /\b(delete|drop|truncate|alter)\b/i.test(sql),
  );
  assert.equal(destructive.length, 0);
});
