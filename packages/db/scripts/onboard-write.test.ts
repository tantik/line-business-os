import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONBOARD_WRITE_SQL,
  buildAuditRows,
  executeOnboardingWritePlan,
  prepareOwnerEmailPII,
  validateWritablePlanOrThrow,
  type OnboardingWriteOperation,
} from './onboard-write.js';
import {
  buildOnboardingPlan,
  parseOnboardingInput,
  type ExistingOnboardingState,
  type OnboardingInput,
  type RawOnboardingInput,
} from './onboard-tenant.js';
import type { QueryRunner } from './onboard-db.js';

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
// Transaction control deferred to Stage 3c-3b
// ===========================================================================

test('Stage 3c-3a has no BEGIN/COMMIT/ROLLBACK (transaction wrapper is next stage)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!/\bbegin\b/i.test(source), 'no BEGIN in Stage 3c-3a');
  assert.ok(!/\bcommit\b/i.test(source), 'no COMMIT in Stage 3c-3a');
  assert.ok(!/\brollback\b/i.test(source), 'no ROLLBACK in Stage 3c-3a');
});

// ===========================================================================
// Source guards
// ===========================================================================

test('onboard-write.ts uses no service_role / Supabase client / driver', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
});

test('onboard-write.ts contains no COMMIT and no DELETE/TRUNCATE/DROP/ALTER/GRANT', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!/\bcommit\b/i.test(source), 'COMMIT must not appear anywhere');
  const forbidden = /\b(delete|truncate|drop|alter|grant)\b/i;
  assert.ok(!forbidden.test(source), 'a destructive DDL/DML token is present');
});

test('onboard-write.ts reads no DATABASE_URL and does no console logging', () => {
  const source = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  assert.ok(!source.includes('DATABASE_URL'), 'must not reference DATABASE_URL');
  assert.ok(!/console\./.test(source), 'must not log via console');
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
          text.includes('onboard-write')
        ) {
          offenders.push(full);
        }
      }
    }
  };
  walk(webSrc);

  assert.deepEqual(offenders, [], `apps/web must not reference onboarding: ${offenders.join(', ')}`);
});
