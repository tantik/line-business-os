import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONBOARD_TX_SQL,
  ONBOARD_WRITE_SQL,
  buildAuditRows,
  executeOnboardingWritePlan,
  mapDryRunTransactionErrorToSafeMessage,
  prepareOwnerEmailPII,
  runOnboardingDryRunTransactionFromEnv,
  validateWritablePlanOrThrow,
  withLocalDryRunTransaction,
  type DryRunPgClient,
  type OnboardingWriteOperation,
} from './onboard-write.js';
import {
  buildOnboardingPlan,
  parseOnboardingInput,
  type ExistingOnboardingState,
  type OnboardingInput,
  type RawOnboardingInput,
} from './onboard-tenant.js';
import { ONBOARD_DB_QUERIES, type QueryRunner } from './onboard-db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Synthetic, non-real fixtures, only used to prove they NEVER leak into SQL
// values, audit metadata, or a summary.
const FAKE_OWNER_UUID = '00000000-0000-4000-8000-000000000abc';
const FAKE_OWNER_EMAIL = 'owner@example.jp';
const FAKE_TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const FAKE_ROLE_UUID = '22222222-2222-4222-8222-222222222222';
const FAKE_LOCATION_UUID = '33333333-3333-4333-8333-333333333333';

// Synthetic PII env values (32-byte base64 key + arbitrary pepper). NOT secrets.
const SYNTHETIC_PII_ENV = {
  PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PII_HASH_PEPPER: 'synthetic-test-pepper',
};

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function validRaw(overrides: Partial<RawOnboardingInput> = {}): RawOnboardingInput {
  return {
    tenantName: 'Acme KK',
    tenantSlug: 'acme-kk',
    ownerAuthUserId: FAKE_OWNER_UUID,
    ownerEmail: FAKE_OWNER_EMAIL,
    locationName: 'Main Store',
    timezone: 'Asia/Tokyo',
    modules: 'core,workforce',
    dryRun: true,
    ...overrides,
  };
}

function parsedInput(overrides: Partial<RawOnboardingInput> = {}): OnboardingInput {
  const result = parseOnboardingInput(validRaw(overrides));
  assert.ok(result.ok, `expected valid input, got: ${result.ok ? '' : result.errors.join(', ')}`);
  return result.value;
}

/** Records every query and returns scripted rows keyed by exact query text. */
class FakeRunner implements QueryRunner {
  public calls: { text: string; values: readonly unknown[] }[] = [];

  constructor(private readonly responses: Record<string, unknown[]> = {}) {}

  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values: values ?? [] });
    const rows = (this.responses[text] ?? []) as T[];
    return { rows };
  }
}

/** Default read responses for a fresh-create happy path. */
function createResponses(overrides: Record<string, unknown[]> = {}): Record<string, unknown[]> {
  return {
    [ONBOARD_WRITE_SQL.selectTenant]: [{ id: FAKE_TENANT_UUID, name: 'Acme KK', kind: 'client' }],
    [ONBOARD_WRITE_SQL.selectTenantOwnerRole]: [{ id: FAKE_ROLE_UUID }],
    [ONBOARD_WRITE_SQL.selectLocations]: [],
    [ONBOARD_WRITE_SQL.selectUserPII]: [],
    ...overrides,
  };
}

/** State for an all-reuse run (tenant present, owner mirror + membership exist). */
function reuseState(overrides: Partial<ExistingOnboardingState> = {}): ExistingOnboardingState {
  return {
    tenant: { slug: 'acme-kk', name: 'Acme KK', kind: 'client' },
    userMirrorExists: true,
    locationNames: ['Main Store'],
    membershipExists: true,
    membershipStatus: 'active',
    roleAssignmentExists: true,
    enabledModules: ['core', 'workforce'],
    ...overrides,
  };
}

function callsTo(runner: FakeRunner, text: string): { text: string; values: readonly unknown[] }[] {
  return runner.calls.filter((c) => c.text === text);
}

function preparedPII(): { emailEncrypted: Buffer; emailHash: string } {
  const pii = prepareOwnerEmailPII(FAKE_OWNER_EMAIL, SYNTHETIC_PII_ENV);
  assert.ok(pii, 'expected prepared PII');
  return pii;
}

// ===========================================================================
// QueryRunner type compatibility
// ===========================================================================

test('the executor accepts the existing onboard-db QueryRunner type', () => {
  // The FakeRunner satisfies the onboard-db QueryRunner the executor consumes.
  const runner: QueryRunner = new FakeRunner();
  assert.equal(typeof runner.query, 'function');
});

// ===========================================================================
// Tenant
// ===========================================================================

test('tenant conflict throws BEFORE any write', async () => {
  const input = parsedInput();
  const state: ExistingOnboardingState = {
    tenant: { slug: 'acme-kk', name: 'A Different Name', kind: 'client' },
  };
  const plan = buildOnboardingPlan(input, state);
  assert.equal(plan.ok, false);

  const runner = new FakeRunner(createResponses());
  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, state, { ownerEmailPII: preparedPII() }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(!UUID_LIKE.test(err.message), 'conflict message leaked a UUID');
      assert.ok(!err.message.includes('@'), 'conflict message leaked an email');
      assert.ok(!err.message.includes(FAKE_OWNER_EMAIL));
      return true;
    },
  );
  assert.equal(runner.calls.length, 0, 'no statement should run on a tenant conflict');
});

test('tenant create issues a parameterized INSERT then SELECT', async () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  await executeOnboardingWritePlan(runner, input, plan, {}, { ownerEmailPII: preparedPII() });

  const inserts = callsTo(runner, ONBOARD_WRITE_SQL.insertTenant);
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0]?.values, ['acme-kk', 'Acme KK', 'client']);

  const selects = callsTo(runner, ONBOARD_WRITE_SQL.selectTenant);
  assert.equal(selects.length, 1);
  assert.deepEqual(selects[0]?.values, ['acme-kk']);
});

// ===========================================================================
// User mirror + PII
// ===========================================================================

test('user mirror create WITHOUT email needs no PII env', async () => {
  // No env set on the helper call; prepareOwnerEmailPII(null) returns null.
  assert.equal(prepareOwnerEmailPII(null, {}), null);

  const input = parsedInput({ ownerEmail: undefined });
  assert.equal(input.ownerEmail, null);
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  const summary = await executeOnboardingWritePlan(runner, input, plan, {});

  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertUser).length, 1);
  assert.deepEqual(callsTo(runner, ONBOARD_WRITE_SQL.insertUser)[0]?.values, [FAKE_OWNER_UUID]);
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertUserWithPII).length, 0);
  assert.equal(summary.ownerEmailProvided, false);
});

test('prepareOwnerEmailPII requires PII env when an email is provided', () => {
  assert.throws(
    () => prepareOwnerEmailPII(FAKE_OWNER_EMAIL, {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('PII_ENCRYPTION_KEY'), 'must name the missing env var');
      assert.ok(!err.message.includes('@'), 'must not echo the email');
      assert.ok(!err.message.includes(FAKE_OWNER_EMAIL));
      return true;
    },
  );

  assert.throws(
    () => prepareOwnerEmailPII(FAKE_OWNER_EMAIL, { PII_ENCRYPTION_KEY: SYNTHETIC_PII_ENV.PII_ENCRYPTION_KEY }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('PII_HASH_PEPPER'), 'must name the missing pepper');
      assert.ok(!err.message.includes('@'));
      return true;
    },
  );
});

test('the executor rejects a provided email with no prepared PII (names env vars)', async () => {
  const input = parsedInput(); // email provided
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('PII_ENCRYPTION_KEY'));
      assert.ok(err.message.includes('PII_HASH_PEPPER'));
      assert.ok(!err.message.includes('@'));
      return true;
    },
  );
});

test('user mirror create WITH email writes encrypted PII and never the raw email', async () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  const summary = await executeOnboardingWritePlan(runner, input, plan, {}, {
    ownerEmailPII: preparedPII(),
  });

  const withPII = callsTo(runner, ONBOARD_WRITE_SQL.insertUserWithPII);
  assert.equal(withPII.length, 1);
  assert.equal(withPII[0]?.values[0], FAKE_OWNER_UUID);
  assert.ok(Buffer.isBuffer(withPII[0]?.values[1]), 'email_encrypted must be a buffer');
  assert.equal(typeof withPII[0]?.values[2], 'string');

  // The raw email must appear nowhere in any SQL text or bound value.
  const serializedCalls = JSON.stringify(runner.calls);
  assert.ok(!serializedCalls.includes(FAKE_OWNER_EMAIL), 'raw email leaked into a call');
  assert.ok(!serializedCalls.includes('@'), 'an email-like token leaked into a call');

  // And not into the summary.
  const serializedSummary = JSON.stringify(summary);
  assert.ok(!serializedSummary.includes(FAKE_OWNER_EMAIL));
  assert.ok(!serializedSummary.includes('@'));
});

test('existing user mirror WITH PII is not overwritten', async () => {
  const input = parsedInput();
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);

  const runner = new FakeRunner(
    createResponses({
      [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
      [ONBOARD_WRITE_SQL.selectUserPII]: [
        { email_encrypted: '\\xdead', email_hash: 'deadbeefcafe' },
      ],
    }),
  );

  const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
    ownerEmailPII: preparedPII(),
  });

  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.backfillUserPII).length, 0, 'must not backfill');
  assert.ok(summary.operations.some((op) => op.entity === 'user' && op.action === 'reuse'));
});

test('existing user mirror WITHOUT PII + email backfills NULL-only', async () => {
  const input = parsedInput();
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);

  const runner = new FakeRunner(
    createResponses({
      [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
      [ONBOARD_WRITE_SQL.selectUserPII]: [{ email_encrypted: null, email_hash: null }],
    }),
  );

  const pii = preparedPII();
  const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
    ownerEmailPII: pii,
  });

  const backfills = callsTo(runner, ONBOARD_WRITE_SQL.backfillUserPII);
  assert.equal(backfills.length, 1);
  assert.deepEqual(backfills[0]?.values, [FAKE_OWNER_UUID, pii.emailEncrypted, pii.emailHash]);
  // The backfill statement is itself NULL-guarded.
  assert.ok(/email_encrypted is null/i.test(ONBOARD_WRITE_SQL.backfillUserPII));
  assert.ok(/email_hash is null/i.test(ONBOARD_WRITE_SQL.backfillUserPII));
  assert.ok(summary.operations.some((op) => op.entity === 'user' && op.action === 'pii_backfill'));
});

// ===========================================================================
// Membership
// ===========================================================================

test('membership absent → create active', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState({ membershipExists: false, membershipStatus: null });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  await executeOnboardingWritePlan(runner, input, plan, state);

  const created = callsTo(runner, ONBOARD_WRITE_SQL.insertMembership);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0]?.values, [FAKE_TENANT_UUID, FAKE_OWNER_UUID]);
  assert.ok(/status\) values \(\$1, \$2, 'active'\)/i.test(ONBOARD_WRITE_SQL.insertMembership));
});

test('membership invited → activate', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState({ membershipStatus: 'invited' });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  await executeOnboardingWritePlan(runner, input, plan, state);

  const activated = callsTo(runner, ONBOARD_WRITE_SQL.activateMembership);
  assert.equal(activated.length, 1);
  assert.deepEqual(activated[0]?.values, [FAKE_TENANT_UUID, FAKE_OWNER_UUID]);
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertMembership).length, 0);
});

test('membership active → reuse (no membership write)', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState({ membershipStatus: 'active' });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  await executeOnboardingWritePlan(runner, input, plan, state);

  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertMembership).length, 0);
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.activateMembership).length, 0);
});

test('membership suspended → fail safely before any write', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState({ membershipStatus: 'suspended' });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(createResponses());

  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, state),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(/suspended/i.test(err.message));
      assert.ok(!UUID_LIKE.test(err.message));
      assert.ok(!err.message.includes('@'));
      return true;
    },
  );
  assert.equal(runner.calls.length, 0);
});

test('membership revoked → fail safely before any write', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState({ membershipStatus: 'revoked' });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(createResponses());

  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, state),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(/revoked/i.test(err.message));
      assert.ok(!UUID_LIKE.test(err.message));
      assert.ok(!err.message.includes('@'));
      return true;
    },
  );
  assert.equal(runner.calls.length, 0);
});

// ===========================================================================
// Role assignment
// ===========================================================================

test('role assignment uses WHERE NOT EXISTS + location_id IS NULL, not ON CONFLICT', async () => {
  assert.ok(/where not exists/i.test(ONBOARD_WRITE_SQL.insertRoleAssignment));
  assert.ok(/location_id is null/i.test(ONBOARD_WRITE_SQL.insertRoleAssignment));
  assert.ok(!/on conflict/i.test(ONBOARD_WRITE_SQL.insertRoleAssignment));

  const input = parsedInput({ ownerEmail: undefined });
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  await executeOnboardingWritePlan(runner, input, plan, {});

  const assigned = callsTo(runner, ONBOARD_WRITE_SQL.insertRoleAssignment);
  assert.equal(assigned.length, 1);
  assert.deepEqual(assigned[0]?.values, [FAKE_TENANT_UUID, FAKE_OWNER_UUID, FAKE_ROLE_UUID]);
});

test('missing tenant_owner role → safe failure', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses({ [ONBOARD_WRITE_SQL.selectTenantOwnerRole]: [] }));

  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(/tenant_owner/i.test(err.message));
      assert.ok(!UUID_LIKE.test(err.message));
      return true;
    },
  );
});

// ===========================================================================
// Tenant modules
// ===========================================================================

test('disabled module is re-enabled; config is never overwritten', async () => {
  assert.ok(/do update set is_enabled = true/i.test(ONBOARD_WRITE_SQL.upsertTenantModule));
  assert.ok(/is_enabled = false/i.test(ONBOARD_WRITE_SQL.upsertTenantModule));
  assert.ok(!/config/i.test(ONBOARD_WRITE_SQL.upsertTenantModule), 'must not touch config');

  const input = parsedInput({ ownerEmail: undefined });
  // workforce is NOT in enabledModules → plan marks it 'enable'.
  const state = reuseState({ enabledModules: ['core'] });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  await executeOnboardingWritePlan(runner, input, plan, state);

  const moduleCalls = callsTo(runner, ONBOARD_WRITE_SQL.upsertTenantModule);
  assert.ok(moduleCalls.some((c) => c.values[1] === 'workforce'));
  for (const c of moduleCalls) {
    assert.equal(c.values[0], FAKE_TENANT_UUID);
    assert.equal(c.values.length, 2, 'module upsert binds tenant_id + module only (no config)');
  }
});

// ===========================================================================
// Audit
// ===========================================================================

test('buildAuditRows uses the system actor, null actor_id, core module', () => {
  const operations: OnboardingWriteOperation[] = [
    { entity: 'tenant', action: 'create' },
    { entity: 'tenant_module', action: 'enable', module: 'workforce' },
  ];
  const rows = buildAuditRows({
    tenantId: FAKE_TENANT_UUID,
    tenantSlug: 'acme-kk',
    operations,
  });

  assert.ok(rows.length >= operations.length + 1, 'expects per-op rows + a summary row');
  for (const row of rows) {
    assert.equal(row.actorKind, 'system');
    assert.equal(row.actorId, null);
    assert.equal(row.module, 'core');
    assert.equal(row.entityId, null);
  }
});

test('audit metadata contains no email, owner id, or UUID-like string', async () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  await executeOnboardingWritePlan(runner, input, plan, {}, { ownerEmailPII: preparedPII() });

  const auditCalls = callsTo(runner, ONBOARD_WRITE_SQL.insertAudit);
  assert.ok(auditCalls.length > 0);
  for (const call of auditCalls) {
    const metadata = call.values[7];
    const serialized = JSON.stringify(metadata);
    assert.ok(!serialized.includes('@'), 'email-like token in audit metadata');
    assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'owner email in audit metadata');
    assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id in audit metadata');
    assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string in audit metadata');
  }
});

// ===========================================================================
// Changed-only audit (committed path policy)
// ===========================================================================

test('changed-only audit: a fresh create writes one row per change + a summary (8 total)', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  const summary = await executeOnboardingWritePlan(runner, input, plan, {}, {
    auditMode: 'changed-only',
  });

  // tenant + user + location + membership + role_assignment + 2 modules = 7.
  assert.equal(summary.changedOperationCount, 7);
  assert.equal(summary.auditRowCount, 8, 'seven changed rows + one summary row');
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertAudit).length, 8);
});

test('changed-only audit: a pure all-reuse run writes no audit rows and no summary', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
    auditMode: 'changed-only',
  });

  assert.equal(summary.changedOperationCount, 0);
  assert.equal(summary.auditRowCount, 0, 'a pure reuse run must not be audited');
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertAudit).length, 0);
});

test('changed-only audit: only the changed operation is recorded on a partial change', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  // workforce is disabled → exactly one state-changing op (enable workforce).
  const state = reuseState({ enabledModules: ['core'] });
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
    auditMode: 'changed-only',
  });

  assert.equal(summary.changedOperationCount, 1);
  assert.equal(summary.auditRowCount, 2, 'one changed row + one summary row');
  const auditCalls = callsTo(runner, ONBOARD_WRITE_SQL.insertAudit);
  assert.equal(auditCalls.length, 2);
  // The single non-summary audit row is the workforce enable.
  const actions = auditCalls.map((c) => c.values[6]);
  assert.ok(actions.includes('enable'), 'the changed op (enable) is audited');
  assert.ok(actions.includes('summary'), 'a summary row is still written');
});

test('buildAuditRows changed-only filters reuse and omits the summary when nothing changed', () => {
  const allReuse: OnboardingWriteOperation[] = [
    { entity: 'tenant', action: 'reuse' },
    { entity: 'membership', action: 'reuse' },
  ];
  assert.deepEqual(
    buildAuditRows({ tenantId: FAKE_TENANT_UUID, tenantSlug: 'acme-kk', operations: allReuse }, {
      auditMode: 'changed-only',
    }),
    [],
    'no rows at all for a pure reuse operation set',
  );

  const withChange: OnboardingWriteOperation[] = [
    { entity: 'tenant', action: 'reuse' },
    { entity: 'tenant_module', action: 'enable', module: 'workforce' },
  ];
  const rows = buildAuditRows(
    { tenantId: FAKE_TENANT_UUID, tenantSlug: 'acme-kk', operations: withChange },
    { auditMode: 'changed-only' },
  );
  assert.equal(rows.length, 2, 'one changed row + summary');
  assert.equal(rows[0]?.action, 'enable');
  assert.equal(rows[1]?.action, 'summary');
});

test('default audit mode still records reuse rows + a summary (dry-run behavior preserved)', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({ [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }] }),
  );

  const summary = await executeOnboardingWritePlan(runner, input, plan, state);

  assert.equal(summary.changedOperationCount, 0);
  assert.ok(summary.auditRowCount >= summary.operations.length + 1, 'all ops + summary are audited');
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertAudit).length, summary.auditRowCount);
});

// ===========================================================================
// Redacted summary
// ===========================================================================

test('redacted summary leaks no email, owner id, UUID, or DATABASE_URL', async () => {
  const input = parsedInput();
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({
      [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
      [ONBOARD_WRITE_SQL.selectUserPII]: [{ email_encrypted: null, email_hash: null }],
    }),
  );

  const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
    ownerEmailPII: preparedPII(),
  });
  const serialized = JSON.stringify(summary);

  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'owner email leaked');
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!serialized.includes(FAKE_TENANT_UUID), 'tenant uuid leaked');
  assert.ok(!serialized.includes(FAKE_ROLE_UUID), 'role uuid leaked');
  assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');

  assert.equal(summary.stage, 'phase-1h-stage-3c3a');
  assert.equal(summary.persisted, false);
  assert.equal(summary.transactionControl, 'deferred-to-stage-3c-3b');
  assert.equal(summary.tenantSlug, 'acme-kk');
});

// ===========================================================================
// Parameterization + identity rules
// ===========================================================================

test('every statement binds a values array; placeholders get bound values', async () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(createResponses());

  await executeOnboardingWritePlan(runner, input, plan, {}, { ownerEmailPII: preparedPII() });

  assert.ok(runner.calls.length > 0);
  for (const call of runner.calls) {
    assert.ok(Array.isArray(call.values), `values must be an array for: ${call.text}`);
    if (call.text.includes('$1')) {
      assert.ok(call.values.length >= 1, `expected bound values for: ${call.text}`);
    }
  }
});

test('owner email is never used for an identity lookup', async () => {
  const input = parsedInput();
  const state = reuseState();
  const plan = buildOnboardingPlan(input, state);
  const runner = new FakeRunner(
    createResponses({
      [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
      [ONBOARD_WRITE_SQL.selectUserPII]: [{ email_encrypted: null, email_hash: null }],
    }),
  );

  await executeOnboardingWritePlan(runner, input, plan, state, { ownerEmailPII: preparedPII() });

  for (const call of runner.calls) {
    for (const value of call.values) {
      assert.notEqual(value, FAKE_OWNER_EMAIL, 'raw email bound as a value');
      assert.ok(
        !(typeof value === 'string' && value.includes('@')),
        `email-like value bound for: ${call.text}`,
      );
    }
  }

  // Identity-scoped reads bind the slug / auth user id, never the email.
  assert.deepEqual(callsTo(runner, ONBOARD_WRITE_SQL.selectTenant)[0]?.values, ['acme-kk']);
  assert.deepEqual(callsTo(runner, ONBOARD_WRITE_SQL.selectUserPII)[0]?.values, [FAKE_OWNER_UUID]);
});

// ===========================================================================
// Location ambiguity
// ===========================================================================

test('location ambiguity at write time safe-fails before the location insert', async () => {
  const input = parsedInput({ ownerEmail: undefined });
  const plan = buildOnboardingPlan(input, {});
  const runner = new FakeRunner(
    createResponses({
      [ONBOARD_WRITE_SQL.selectLocations]: [
        { id: FAKE_LOCATION_UUID, name: 'Main Store' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'main  store' },
      ],
    }),
  );

  await assert.rejects(
    () => executeOnboardingWritePlan(runner, input, plan, {}),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(/multiple existing locations/i.test(err.message));
      assert.ok(!UUID_LIKE.test(err.message));
      assert.ok(!err.message.includes('@'));
      return true;
    },
  );
  assert.equal(callsTo(runner, ONBOARD_WRITE_SQL.insertLocation).length, 0);
});

test('validateWritablePlanOrThrow safe-fails on ambiguous existing state', () => {
  const input = parsedInput();
  const state: ExistingOnboardingState = { locationNames: ['Main Store', 'main store'] };
  const plan = buildOnboardingPlan(input, state);

  assert.throws(
    () => validateWritablePlanOrThrow(input, plan, state),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(/multiple existing locations/i.test(err.message));
      assert.ok(!UUID_LIKE.test(err.message));
      return true;
    },
  );
});

// ===========================================================================
// Transaction control (Stage 3c-3b: BEGIN/ROLLBACK present, never COMMIT)
// ===========================================================================

test('Stage 3c-3b has BEGIN + ROLLBACK transaction control but never COMMIT', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  // The dry-run wrapper opens and discards a transaction.
  assert.ok(/\bbegin\b/i.test(source), 'expected BEGIN transaction control');
  assert.ok(/\brollback\b/i.test(source), 'expected ROLLBACK transaction control');
  // It must never commit: the literal COMMIT token must not appear at all.
  assert.ok(!/\bcommit\b/i.test(source), 'COMMIT must never appear in onboard-write.ts');
});

test('the transaction-control SQL is begin/rollback only (no commit token)', () => {
  assert.equal(ONBOARD_TX_SQL.begin, 'begin');
  assert.equal(ONBOARD_TX_SQL.rollback, 'rollback');
  assert.equal(ONBOARD_TX_SQL.statementTimeout, "set statement_timeout = '10s'");
  const serialized = JSON.stringify(ONBOARD_TX_SQL);
  assert.ok(!/\bcommit\b/i.test(serialized), 'no commit token in the transaction SQL');
});

// ===========================================================================
// Local dry-run transaction wrapper (fake Client only — no real DB)
// ===========================================================================

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_DB_TARGET = { target: 'local-postgres' as const, port: 54322 };

/** Fake pg client: records connect/query/end order; never touches a real DB. */
class FakeDryRunClient implements DryRunPgClient {
  public events: string[] = [];
  public queries: { text: string; values: readonly unknown[] }[] = [];
  public connected = false;
  public ended = 0;

  constructor(
    private readonly opts: {
      responses?: Record<string, unknown[]>;
      connectError?: unknown;
      errorOnQuery?: (text: string) => unknown;
    } = {},
  ) {}

  async connect(): Promise<void> {
    this.events.push('connect');
    if (this.opts.connectError !== undefined) throw this.opts.connectError;
    this.connected = true;
  }

  async query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }> {
    this.events.push(`query:${text}`);
    this.queries.push({ text, values: values ?? [] });
    const err = this.opts.errorOnQuery?.(text);
    if (err !== undefined) throw err;
    return { rows: this.opts.responses?.[text] ?? [] };
  }

  async end(): Promise<void> {
    this.events.push('end');
    this.ended += 1;
  }
}

/** Full scripted responses for a tenant-already-onboarded (reuse) dry-run. */
function reuseDbResponses(): Record<string, unknown[]> {
  return {
    [ONBOARD_DB_QUERIES.ownerMirror]: [{ exists: 1 }],
    // Same text as ONBOARD_WRITE_SQL.selectTenant — reuse keeps it consistent.
    [ONBOARD_DB_QUERIES.tenantBySlug]: [{ id: FAKE_TENANT_UUID, name: 'Acme KK', kind: 'client' }],
    [ONBOARD_DB_QUERIES.locations]: [{ name: 'Main Store' }],
    [ONBOARD_DB_QUERIES.membership]: [{ status: 'active' }],
    [ONBOARD_DB_QUERIES.tenantOwnerRole]: [{ id: FAKE_ROLE_UUID }],
    [ONBOARD_DB_QUERIES.roleAssignment]: [{ exists: 1 }],
    [ONBOARD_DB_QUERIES.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
    [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
  };
}

function withDatabaseUrl<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.DATABASE_URL;
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  const restore = (): void => {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  };
  return fn().then(
    (result) => {
      restore();
      return result;
    },
    (error: unknown) => {
      restore();
      throw error;
    },
  );
}

test('withLocalDryRunTransaction: guard before connect; BEGIN before writes; ROLLBACK after; end last; no COMMIT', async () => {
  const client = new FakeDryRunClient();
  const result = await withLocalDryRunTransaction(
    LOCAL_DB_URL,
    async (runner) => {
      await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
      return 'done';
    },
    {
      createClient: () => client,
      assertLocalUrl: () => {
        client.events.push('guard');
        return LOCAL_DB_TARGET;
      },
    },
  );

  assert.equal(result, 'done');
  assert.ok(client.events.indexOf('guard') < client.events.indexOf('connect'), 'guard must run before connect');

  const beginIdx = client.events.indexOf(`query:${ONBOARD_TX_SQL.begin}`);
  const writeIdx = client.events.findIndex((e) => e.startsWith('query:insert'));
  const rollbackIdx = client.events.lastIndexOf(`query:${ONBOARD_TX_SQL.rollback}`);
  assert.ok(beginIdx >= 0, 'BEGIN must be issued');
  assert.ok(writeIdx > beginIdx, 'writes must run after BEGIN');
  assert.ok(rollbackIdx > writeIdx, 'ROLLBACK must run after the writes');
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must close last');
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT may be issued');
  assert.equal(client.ended, 1);
});

test('withLocalDryRunTransaction: rolls back + closes when the write path throws after BEGIN', async () => {
  const client = new FakeDryRunClient();
  await assert.rejects(
    () =>
      withLocalDryRunTransaction(
        LOCAL_DB_URL,
        async (runner) => {
          await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
          throw new Error('boom in write path');
        },
        { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );

  assert.ok(client.events.includes(`query:${ONBOARD_TX_SQL.begin}`), 'BEGIN must have run');
  assert.ok(client.events.includes(`query:${ONBOARD_TX_SQL.rollback}`), 'ROLLBACK must run on error');
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must close even on error');
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT may be issued');
});

test('withLocalDryRunTransaction: connection failure → safe message; no BEGIN; client closed', async () => {
  const client = new FakeDryRunClient({
    connectError: {
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED 127.0.0.1:54322 postgres://secretuser:sup3rsecretpw@127.0.0.1:54322/postgres',
    },
  });

  await assert.rejects(
    () =>
      withLocalDryRunTransaction(LOCAL_DB_URL, async () => 'unused', {
        createClient: () => client,
        assertLocalUrl: () => LOCAL_DB_TARGET,
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Could not connect to the local database.');
      assert.ok(!err.message.includes('secretuser'), 'username leaked');
      assert.ok(!err.message.includes('sup3rsecretpw'), 'password leaked');
      assert.ok(!err.message.includes('127.0.0.1'), 'host leaked');
      assert.ok(!err.message.includes('postgres://'), 'connection URL leaked');
      return true;
    },
  );

  assert.ok(!client.events.includes(`query:${ONBOARD_TX_SQL.begin}`), 'must not BEGIN after a failed connect');
  assert.ok(client.events.includes('end'), 'client must be closed after a failed connect');
});

test('withLocalDryRunTransaction: rollback failure surfaces a safe message and still closes', async () => {
  const client = new FakeDryRunClient({
    errorOnQuery: (text) =>
      text === ONBOARD_TX_SQL.rollback
        ? { code: 'XX000', message: 'raw driver text postgres://u:p@h:54322/db' }
        : undefined,
  });

  await assert.rejects(
    () =>
      withLocalDryRunTransaction(
        LOCAL_DB_URL,
        async (runner) => {
          await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
          return 'ok';
        },
        { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(!err.message.includes('postgres://'), 'connection URL leaked');
      assert.ok(!err.message.includes('raw driver text'), 'raw driver text leaked');
      assert.ok(!UUID_LIKE.test(err.message), 'a UUID-like string leaked');
      return true;
    },
  );
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must still close');
});

test('runOnboardingDryRunTransactionFromEnv: reuse happy path → rolled back, nothing persisted, redacted', async () => {
  const client = new FakeDryRunClient({ responses: reuseDbResponses() });
  const result = await withDatabaseUrl(LOCAL_DB_URL, () =>
    runOnboardingDryRunTransactionFromEnv(parsedInput({ ownerEmail: undefined }), {
      createClient: () => client,
    }),
  );

  assert.equal(result.stage, 'phase-1h-stage-3c3b');
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.rolledBack, true);
  assert.equal(result.persisted, false);
  assert.equal(result.committed, false);
  assert.equal(result.transaction, 'rolled-back');
  assert.equal(result.tenantSlug, 'acme-kk');
  assert.deepEqual(result.dbTarget, LOCAL_DB_TARGET);

  // The transaction was opened and discarded; never committed.
  assert.ok(client.events.includes(`query:${ONBOARD_TX_SQL.begin}`));
  assert.ok(client.events.includes(`query:${ONBOARD_TX_SQL.rollback}`));
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT may be issued');
  assert.equal(client.events[client.events.length - 1], 'end');

  // The result is fully redacted (no email/UUID/DATABASE_URL).
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!serialized.includes(FAKE_TENANT_UUID), 'tenant uuid leaked');
  assert.ok(!serialized.includes(FAKE_ROLE_UUID), 'role uuid leaked');
  assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');
});

test('runOnboardingDryRunTransactionFromEnv: missing DATABASE_URL → safe error, no connection', async () => {
  const client = new FakeDryRunClient();
  await withDatabaseUrl(undefined, async () => {
    await assert.rejects(
      () =>
        runOnboardingDryRunTransactionFromEnv(parsedInput({ ownerEmail: undefined }), {
          createClient: () => client,
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(/DATABASE_URL/.test(err.message), 'must name the missing variable');
        return true;
      },
    );
    assert.equal(client.connected, false, 'must never connect when DATABASE_URL is absent');
    assert.equal(client.events.length, 0, 'no client activity without DATABASE_URL');
  });
});

test('runOnboardingDryRunTransactionFromEnv: PII env missing (email provided) → safe error, no connection', async () => {
  const client = new FakeDryRunClient({ responses: reuseDbResponses() });
  const prevKey = process.env.PII_ENCRYPTION_KEY;
  const prevPepper = process.env.PII_HASH_PEPPER;
  delete process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_HASH_PEPPER;
  try {
    await withDatabaseUrl(LOCAL_DB_URL, async () => {
      await assert.rejects(
        () =>
          runOnboardingDryRunTransactionFromEnv(parsedInput({ ownerEmail: FAKE_OWNER_EMAIL }), {
            createClient: () => client,
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(/PII_ENCRYPTION_KEY/.test(err.message), 'must name the missing PII env var');
          assert.ok(!err.message.includes('@'), 'must not echo the email');
          assert.ok(!err.message.includes(FAKE_OWNER_EMAIL));
          return true;
        },
      );
      assert.equal(client.connected, false, 'must not connect when PII prep fails');
    });
  } finally {
    if (prevKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
    else process.env.PII_ENCRYPTION_KEY = prevKey;
    if (prevPepper === undefined) delete process.env.PII_HASH_PEPPER;
    else process.env.PII_HASH_PEPPER = prevPepper;
  }
});

test('mapDryRunTransactionErrorToSafeMessage returns static, secret-free messages', () => {
  const leaky = {
    code: 'ECONNREFUSED',
    message: 'connect ECONNREFUSED postgres://secretuser:sup3rsecretpw@127.0.0.1:54322/postgres',
  };
  const messages = [
    mapDryRunTransactionErrorToSafeMessage(leaky),
    mapDryRunTransactionErrorToSafeMessage({ code: '23503' }),
    mapDryRunTransactionErrorToSafeMessage({ code: '23505' }),
    mapDryRunTransactionErrorToSafeMessage({ code: '22P02' }),
    mapDryRunTransactionErrorToSafeMessage({ code: '42P01' }),
    mapDryRunTransactionErrorToSafeMessage({ code: '57014' }),
    mapDryRunTransactionErrorToSafeMessage(new Error('some raw driver text')),
    mapDryRunTransactionErrorToSafeMessage('weird'),
  ];

  for (const message of messages) {
    assert.ok(message.length > 0);
    assert.ok(!message.includes('secretuser'), 'username leaked');
    assert.ok(!message.includes('sup3rsecretpw'), 'password leaked');
    assert.ok(!message.includes('postgres://'), 'connection URL leaked');
    assert.ok(!message.includes('127.0.0.1'), 'host leaked');
    assert.ok(!message.includes('@'), 'host/credential token leaked');
    assert.ok(!UUID_LIKE.test(message), 'a UUID-like string leaked');
    assert.ok(!/\bcommit\b/i.test(message), 'no commit token in safe messages');
  }
});

// ===========================================================================
// Source guards
// ===========================================================================

test('onboard-write.ts uses no service_role / Supabase client', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
});

test('onboard-write.ts contains no COMMIT and no DELETE/TRUNCATE/DROP/ALTER/GRANT', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!/\bcommit\b/i.test(source), 'COMMIT must not appear anywhere');
  const forbidden = /\b(delete|truncate|drop|alter|grant)\b/i;
  assert.ok(!forbidden.test(source), 'a destructive DDL/DML token is present');
});

test('onboard-write.ts does no console logging (DATABASE_URL is read but never logged)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  // The dry-run runner reads DATABASE_URL, but it must never print/log it.
  assert.ok(!/console\./.test(source), 'must not log via console');
  assert.ok(
    !/console\.[a-z]+\([^)]*DATABASE_URL/i.test(source),
    'must never print DATABASE_URL',
  );
});

test('write SQL tokens live in onboard-write.ts, not onboard-db.ts', () => {
  const writeSrc = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  const dbSrc = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');

  // The write module is where INSERT/UPDATE live.
  assert.ok(/\binsert\b/i.test(writeSrc), 'onboard-write.ts should contain INSERT');
  assert.ok(/\bupdate\b/i.test(writeSrc), 'onboard-write.ts should contain UPDATE');

  // The read module stays SELECT-only.
  const writeTokens = /\b(insert|update|delete|truncate|drop|alter|grant|commit|rollback)\b/i;
  assert.ok(!writeTokens.test(dbSrc), 'onboard-db.ts must remain SELECT-only');
});

test('onboard-db.ts remains SELECT-only', () => {
  const dbSrc = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');
  assert.ok(!/\b(insert|update|delete|truncate|drop|alter|grant|commit|rollback)\b/i.test(dbSrc));
});

test('onboard-tenant.ts stays driver-free (no pg import / new Client / .connect)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg' directly");
  assert.ok(!/require\(\s*['"]pg['"]\s*\)/.test(source), "must not require 'pg'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
});

test('apps/web does not import any onboarding script', () => {
  const webSrc = path.join(REPO_ROOT, 'apps', 'web', 'src');
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // apps/web/src absent in some checkouts — nothing to guard.
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        if (
          text.includes('onboard-db') ||
          text.includes('onboard-tenant') ||
          text.includes('onboard-write') ||
          text.includes('onboard-commit') ||
          text.includes('onboard-backup-gate')
        ) {
          offenders.push(full);
        }
      }
    }
  };
  walk(webSrc);

  assert.deepEqual(offenders, [], `apps/web must not reference onboarding: ${offenders.join(', ')}`);
});
