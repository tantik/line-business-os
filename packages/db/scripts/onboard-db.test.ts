import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONBOARD_DB_QUERIES,
  READ_ONLY_SESSION_SQL,
  STATEMENT_TIMEOUT_SQL,
  loadExistingOnboardingState,
  mapPgErrorToSafeMessage,
  type QueryRunner,
} from './onboard-db.js';
import {
  createReadOnlyCliSummary,
  parseOnboardingInput,
  type OnboardingInput,
  type RawOnboardingInput,
} from './onboard-tenant.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Non-real fixtures, only used to prove they NEVER leak into a summary/error.
const FAKE_OWNER_UUID = '00000000-0000-4000-8000-000000000abc';
const FAKE_OWNER_EMAIL = 'owner@example.jp';
const FAKE_TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const FAKE_ROLE_UUID = '00000000-0000-0000-0000-000000000003';

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

  constructor(private readonly responses: Record<string, unknown[]>) {}

  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values: values ?? [] });
    const rows = (this.responses[text] ?? []) as T[];
    return { rows };
  }
}

const FULL_DB_RESPONSES: Record<string, unknown[]> = {
  [ONBOARD_DB_QUERIES.ownerMirror]: [{ exists: 1 }],
  [ONBOARD_DB_QUERIES.tenantBySlug]: [{ id: FAKE_TENANT_UUID, name: 'Acme KK', kind: 'client' }],
  [ONBOARD_DB_QUERIES.locations]: [{ name: 'Main Store' }],
  [ONBOARD_DB_QUERIES.membership]: [{ status: 'active' }],
  [ONBOARD_DB_QUERIES.tenantOwnerRole]: [{ id: FAKE_ROLE_UUID }],
  [ONBOARD_DB_QUERIES.roleAssignment]: [{ exists: 1 }],
  [ONBOARD_DB_QUERIES.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
};

// --- loader: tenant absent --------------------------------------------------

test('loadExistingOnboardingState: tenant absent → null tenant, no tenant-scoped queries', async () => {
  const runner = new FakeRunner({
    [ONBOARD_DB_QUERIES.ownerMirror]: [],
    [ONBOARD_DB_QUERIES.tenantBySlug]: [],
  });
  const state = await loadExistingOnboardingState(runner, parsedInput());

  assert.equal(state.tenant, null);
  assert.equal(state.userMirrorExists, false);

  const texts: string[] = runner.calls.map((c) => c.text);
  assert.deepEqual(texts, [ONBOARD_DB_QUERIES.ownerMirror, ONBOARD_DB_QUERIES.tenantBySlug] as string[]);
  // No tenant-scoped follow-ups ran.
  assert.ok(!texts.includes(ONBOARD_DB_QUERIES.locations));
  assert.ok(!texts.includes(ONBOARD_DB_QUERIES.membership));
  assert.ok(!texts.includes(ONBOARD_DB_QUERIES.roleAssignment));
  assert.ok(!texts.includes(ONBOARD_DB_QUERIES.enabledModules));
});

test('loadExistingOnboardingState: owner mirror existence reflects the owner query', async () => {
  const present = new FakeRunner({ [ONBOARD_DB_QUERIES.ownerMirror]: [{ exists: 1 }] });
  assert.equal((await loadExistingOnboardingState(present, parsedInput())).userMirrorExists, true);

  const absent = new FakeRunner({ [ONBOARD_DB_QUERIES.ownerMirror]: [] });
  assert.equal((await loadExistingOnboardingState(absent, parsedInput())).userMirrorExists, false);
});

// --- loader: tenant present -------------------------------------------------

test('loadExistingOnboardingState: tenant present → maps every field', async () => {
  const runner = new FakeRunner(FULL_DB_RESPONSES);
  const state = await loadExistingOnboardingState(runner, parsedInput());

  assert.deepEqual(state.tenant, { slug: 'acme-kk', name: 'Acme KK', kind: 'client' });
  assert.equal(state.userMirrorExists, true);
  assert.deepEqual(state.locationNames, ['Main Store']);
  assert.equal(state.membershipExists, true);
  assert.equal(state.membershipStatus, 'active');
  assert.equal(state.roleAssignmentExists, true);
  assert.deepEqual(state.enabledModules, ['core', 'workforce']);
});

test('loadExistingOnboardingState: missing membership/role assignment → false flags', async () => {
  const runner = new FakeRunner({
    ...FULL_DB_RESPONSES,
    [ONBOARD_DB_QUERIES.membership]: [],
    [ONBOARD_DB_QUERIES.roleAssignment]: [],
  });
  const state = await loadExistingOnboardingState(runner, parsedInput());
  assert.equal(state.membershipExists, false);
  assert.equal(state.membershipStatus, null);
  assert.equal(state.roleAssignmentExists, false);
});

test('loadExistingOnboardingState: missing tenant_owner role → safe error', async () => {
  const runner = new FakeRunner({
    ...FULL_DB_RESPONSES,
    [ONBOARD_DB_QUERIES.tenantOwnerRole]: [],
  });
  await assert.rejects(
    () => loadExistingOnboardingState(runner, parsedInput()),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Required system role tenant_owner is missing.');
      return true;
    },
  );
});

// --- loader: parameterization + no PII in query values ----------------------

test('loadExistingOnboardingState: queries are parameterized and PII-free in values', async () => {
  const runner = new FakeRunner(FULL_DB_RESPONSES);
  await loadExistingOnboardingState(runner, parsedInput());

  for (const call of runner.calls) {
    // Any query with a placeholder must receive at least one bound value.
    if (call.text.includes('$1')) {
      assert.ok(call.values.length >= 1, `expected bound values for: ${call.text}`);
    }
    // The owner email is PII and must never be used as a query value.
    for (const value of call.values) {
      assert.notEqual(value, FAKE_OWNER_EMAIL);
      assert.ok(!(typeof value === 'string' && value.includes('@')), 'email-like value bound');
    }
  }

  // The tenant_owner role lookup takes no parameters.
  const roleCall = runner.calls.find((c) => c.text === ONBOARD_DB_QUERIES.tenantOwnerRole);
  assert.ok(roleCall);
  assert.equal(roleCall.values.length, 0);

  // Owner auth user id is bound only to the identity-scoped reads.
  const ownerCall = runner.calls.find((c) => c.text === ONBOARD_DB_QUERIES.ownerMirror);
  assert.ok(ownerCall?.values.includes(FAKE_OWNER_UUID));
});

test('roleAssignment query scopes the tenant-wide (NULL location) assignment', () => {
  assert.ok(ONBOARD_DB_QUERIES.roleAssignment.includes('location_id is null'));
});

// --- redaction --------------------------------------------------------------

test('createReadOnlyCliSummary from loaded state leaks no email/UUID/secret', async () => {
  const runner = new FakeRunner(FULL_DB_RESPONSES);
  const input = parsedInput();
  const state = await loadExistingOnboardingState(runner, input);

  const summary = createReadOnlyCliSummary(input, 'dry-run', state, 'local-read-only');
  const serialized = JSON.stringify(summary);

  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'owner email leaked');
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!serialized.includes(FAKE_TENANT_UUID), 'tenant uuid leaked');
  assert.ok(!serialized.includes(FAKE_ROLE_UUID), 'role uuid leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');

  const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.ok(!uuidLike.test(serialized), 'a UUID-like string leaked');

  assert.equal(summary.stage, 'phase-1h-stage-3c2');
  assert.equal(summary.dbConnection, 'local-read-only');
  assert.equal(summary.stateSource, 'local-read-only');
  assert.equal(summary.liveOnboarding, 'not-implemented');
  assert.equal(summary.plan.tenantSlug, 'acme-kk');
});

// --- safe error mapping -----------------------------------------------------

test('mapPgErrorToSafeMessage returns static, secret-free messages', () => {
  const leaky = {
    code: 'ECONNREFUSED',
    message:
      'connect ECONNREFUSED 127.0.0.1:54322 postgres://secretuser:sup3rsecretpw@127.0.0.1:54322/postgres',
  };
  const messages = [
    mapPgErrorToSafeMessage(leaky),
    mapPgErrorToSafeMessage({ code: '42P01' }),
    mapPgErrorToSafeMessage({ code: '28P01' }),
    mapPgErrorToSafeMessage({ code: '57014' }),
    mapPgErrorToSafeMessage(new Error('some raw driver text')),
    mapPgErrorToSafeMessage('weird'),
  ];

  for (const message of messages) {
    assert.ok(message.length > 0);
    assert.ok(!message.includes('secretuser'), 'username leaked');
    assert.ok(!message.includes('sup3rsecretpw'), 'password leaked');
    assert.ok(!message.includes('postgres://'), 'connection URL leaked');
    assert.ok(!message.includes('127.0.0.1'), 'host leaked');
    assert.ok(!message.includes('@'), 'host/credential token leaked');
    assert.ok(!message.includes(FAKE_OWNER_UUID), 'owner uid leaked');
    assert.ok(!message.includes(FAKE_OWNER_EMAIL), 'owner email leaked');
  }
});

// --- source guards ----------------------------------------------------------

test('onboard-tenant.ts stays driver-free (no direct pg, Client, or connect)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg' directly");
  assert.ok(!/require\(\s*['"]pg['"]\s*\)/.test(source), "must not require 'pg'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
});

test('onboard-db.ts uses no service_role / Supabase client', () => {
  const source = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
});

test('onboard-db.ts is SELECT-only (no write tokens)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');
  const forbidden = /\b(insert|update|delete|truncate|drop|alter|grant|commit|rollback)\b/i;
  assert.ok(!forbidden.test(source), 'a SQL write/DDL token is present in onboard-db.ts');
  assert.ok(!/\bfor\s+(update|share)\b/i.test(source), 'a row-lock clause is present');

  // Each catalog query is a SELECT.
  for (const sql of Object.values(ONBOARD_DB_QUERIES)) {
    assert.ok(/^\s*select\b/i.test(sql), `not a SELECT: ${sql}`);
  }
  // Only the two allowed session SETs exist.
  assert.equal(READ_ONLY_SESSION_SQL, 'set default_transaction_read_only = on');
  assert.equal(STATEMENT_TIMEOUT_SQL, "set statement_timeout = '10s'");
});

test('onboard-db.ts never reads the auth schema or does email→uid lookup', () => {
  const source = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');
  assert.ok(!/auth\.users/i.test(source), 'must not query auth.users');
  assert.ok(!/auth\.[a-z_]+/i.test(source), 'must not query the auth schema');
  assert.ok(!/email_hash/i.test(source), 'must not resolve identity via email blind index');
  // Catalog queries must not reference the auth schema either.
  for (const sql of Object.values(ONBOARD_DB_QUERIES)) {
    assert.ok(!/auth\./i.test(sql), `auth schema referenced: ${sql}`);
  }
});

test('apps/web does not import the onboarding scripts', () => {
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
        if (text.includes('onboard-db') || text.includes('onboard-tenant')) {
          offenders.push(full);
        }
      }
    }
  };
  walk(webSrc);

  assert.deepEqual(offenders, [], `apps/web must not reference onboarding: ${offenders.join(', ')}`);
});
