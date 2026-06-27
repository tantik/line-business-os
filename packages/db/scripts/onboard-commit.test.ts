import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMIT_INDETERMINATE_MESSAGE,
  ONBOARD_COMMIT_TX_SQL,
  mapCommitTransactionErrorToSafeMessage,
  runOnboardingCommitTransactionFromEnv,
  withLocalCommitTransaction,
  type CommitPgClient,
} from './onboard-commit.js';
import {
  parseOnboardingInput,
  type OnboardingInput,
  type RawOnboardingInput,
  type SafeDbTarget,
} from './onboard-tenant.js';
import { ONBOARD_DB_QUERIES } from './onboard-db.js';
import { ONBOARD_WRITE_SQL } from './onboard-write.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// Synthetic, non-real fixtures — only used to prove they NEVER leak into output.
const FAKE_OWNER_UUID = '00000000-0000-4000-8000-000000000abc';
const FAKE_OWNER_EMAIL = 'owner@example.jp';
const FAKE_TENANT_UUID = '11111111-1111-4111-8111-111111111111';
const FAKE_ROLE_UUID = '22222222-2222-4222-8222-222222222222';
const FAKE_LOCATION_UUID = '33333333-3333-4333-8333-333333333333';

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CLOUD_DB_URL = 'postgresql://u:p@db.abc.supabase.co:5432/postgres';
const LOCAL_DB_TARGET: SafeDbTarget = { target: 'local-postgres', port: 54322 };

const VALID_BACKUP_NAME = 'linebos-20260101-090500.dump.enc';

function validRaw(overrides: Partial<RawOnboardingInput> = {}): RawOnboardingInput {
  return {
    tenantName: 'Acme KK',
    tenantSlug: 'acme-kk',
    ownerAuthUserId: FAKE_OWNER_UUID,
    ownerEmail: FAKE_OWNER_EMAIL,
    locationName: 'Main Store',
    timezone: 'Asia/Tokyo',
    modules: 'core,workforce',
    dryRun: false,
    ...overrides,
  };
}

function parsedInput(overrides: Partial<RawOnboardingInput> = {}): OnboardingInput {
  const result = parseOnboardingInput(validRaw(overrides));
  assert.ok(result.ok, `expected valid input, got: ${result.ok ? '' : result.errors.join(', ')}`);
  return result.value;
}

/** Always-valid backup gate stub (avoids touching the filesystem in unit tests). */
function okBackup(): { ok: true; basename: string; ageHours: number } {
  return { ok: true, basename: VALID_BACKUP_NAME, ageHours: 1 };
}

/** Fake pg client: records connect/query/end order; never touches a real DB. */
class FakeCommitClient implements CommitPgClient {
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

/** Full scripted responses for an already-onboarded (all-reuse) tenant. */
function reuseDbResponses(): Record<string, unknown[]> {
  return {
    [ONBOARD_DB_QUERIES.ownerMirror]: [{ exists: 1 }],
    [ONBOARD_DB_QUERIES.tenantBySlug]: [{ id: FAKE_TENANT_UUID, name: 'Acme KK', kind: 'client' }],
    [ONBOARD_DB_QUERIES.locations]: [{ name: 'Main Store' }],
    [ONBOARD_DB_QUERIES.membership]: [{ status: 'active' }],
    [ONBOARD_DB_QUERIES.tenantOwnerRole]: [{ id: FAKE_ROLE_UUID }],
    [ONBOARD_DB_QUERIES.roleAssignment]: [{ exists: 1 }],
    [ONBOARD_DB_QUERIES.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
    [ONBOARD_WRITE_SQL.selectLocations]: [{ id: FAKE_LOCATION_UUID, name: 'Main Store' }],
  };
}

/** Like reuse, but the `workforce` module is disabled → exactly one change. */
function oneChangeDbResponses(): Record<string, unknown[]> {
  return { ...reuseDbResponses(), [ONBOARD_DB_QUERIES.enabledModules]: [{ module: 'core' }] };
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

// ===========================================================================
// Source guards
// ===========================================================================

test('onboard-commit.ts is the only write-side onboarding file with a transaction COMMIT', () => {
  const commitSrc = readFileSync(path.join(HERE, 'onboard-commit.ts'), 'utf8');
  const writeSrc = readFileSync(path.join(HERE, 'onboard-write.ts'), 'utf8');
  const dbSrc = readFileSync(path.join(HERE, 'onboard-db.ts'), 'utf8');
  const backupSrc = readFileSync(path.join(HERE, 'onboard-backup-gate.ts'), 'utf8');

  // The commit module carries the transaction-finalizing token.
  assert.ok(/\bcommit\b/i.test(commitSrc), 'onboard-commit.ts must contain the COMMIT token');
  assert.ok(/'commit'/.test(commitSrc), 'onboard-commit.ts must use the literal commit statement');

  // No other write/read-side onboarding file may carry it.
  assert.ok(!/\bcommit\b/i.test(writeSrc), 'onboard-write.ts must remain COMMIT-free');
  assert.ok(!/\bcommit\b/i.test(dbSrc), 'onboard-db.ts must remain COMMIT-free');
  // The backup gate only references COMMIT in prose, never as a statement.
  assert.ok(!/'commit'/.test(backupSrc), 'onboard-backup-gate.ts must not issue a commit statement');
});

test('ONBOARD_COMMIT_TX_SQL is begin/commit/rollback + statement timeout only', () => {
  assert.equal(ONBOARD_COMMIT_TX_SQL.statementTimeout, "set statement_timeout = '10s'");
  assert.equal(ONBOARD_COMMIT_TX_SQL.begin, 'begin');
  assert.equal(ONBOARD_COMMIT_TX_SQL.commit, 'commit');
  assert.equal(ONBOARD_COMMIT_TX_SQL.rollback, 'rollback');
});

test('onboard-commit.ts uses no service_role / Supabase client', () => {
  const source = readFileSync(path.join(HERE, 'onboard-commit.ts'), 'utf8');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
});

test('onboard-commit.ts contains no DELETE/TRUNCATE/DROP/ALTER/GRANT', () => {
  const source = readFileSync(path.join(HERE, 'onboard-commit.ts'), 'utf8');
  assert.ok(!/\b(delete|truncate|drop|alter|grant)\b/i.test(source), 'a destructive token is present');
});

test('onboard-commit.ts does no console logging', () => {
  const source = readFileSync(path.join(HERE, 'onboard-commit.ts'), 'utf8');
  assert.ok(!/console\./.test(source), 'must not log via console');
});

test('apps/web imports no onboarding script (incl. onboard-commit / onboard-backup-gate)', () => {
  const webSrc = path.join(REPO_ROOT, 'apps', 'web', 'src');
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
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

// ===========================================================================
// withLocalCommitTransaction (fake client only — no real DB)
// ===========================================================================

test('withLocalCommitTransaction: guard before connect; BEGIN before writes; COMMIT after; end last; COMMIT once', async () => {
  const client = new FakeCommitClient();
  const { value, committed } = await withLocalCommitTransaction<string>(
    LOCAL_DB_URL,
    async (runner) => {
      await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
      return { outcome: 'commit', value: 'done' };
    },
    {
      createClient: () => client,
      assertLocalUrl: () => {
        client.events.push('guard');
        return LOCAL_DB_TARGET;
      },
    },
  );

  assert.equal(value, 'done');
  assert.equal(committed, true);
  assert.ok(client.events.indexOf('guard') < client.events.indexOf('connect'), 'guard before connect');

  const beginIdx = client.events.indexOf(`query:${ONBOARD_COMMIT_TX_SQL.begin}`);
  const writeIdx = client.events.findIndex((e) => e.startsWith('query:insert'));
  const commitIdx = client.events.indexOf(`query:${ONBOARD_COMMIT_TX_SQL.commit}`);
  assert.ok(beginIdx >= 0, 'BEGIN must be issued');
  assert.ok(writeIdx > beginIdx, 'writes must run after BEGIN');
  assert.ok(commitIdx > writeIdx, 'COMMIT must run after the writes');
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must close last');
  assert.equal(client.events.filter((e) => e === `query:${ONBOARD_COMMIT_TX_SQL.commit}`).length, 1, 'exactly one COMMIT');
  assert.ok(!client.events.some((e) => e === `query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'no ROLLBACK on success');
});

test('withLocalCommitTransaction: no-op decision rolls back, never commits', async () => {
  const client = new FakeCommitClient();
  const { committed } = await withLocalCommitTransaction<string>(
    LOCAL_DB_URL,
    async () => ({ outcome: 'rollback', value: 'noop' }),
    { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
  );

  assert.equal(committed, false);
  assert.ok(client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'ROLLBACK must run');
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT for a no-op');
  assert.equal(client.events[client.events.length - 1], 'end');
});

test('withLocalCommitTransaction: error before commit → ROLLBACK and no COMMIT', async () => {
  const client = new FakeCommitClient();
  await assert.rejects(
    () =>
      withLocalCommitTransaction(
        LOCAL_DB_URL,
        async (runner) => {
          await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
          throw new Error('boom in write path');
        },
        { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
      ),
    (err: unknown) => err instanceof Error,
  );

  assert.ok(client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.begin}`), 'BEGIN must have run');
  assert.ok(client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'ROLLBACK on error');
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT on error');
  assert.equal(client.events[client.events.length - 1], 'end', 'connection closes even on error');
});

test('withLocalCommitTransaction: rollback failure surfaces a safe message and still closes', async () => {
  const client = new FakeCommitClient({
    errorOnQuery: (text) =>
      text === ONBOARD_COMMIT_TX_SQL.rollback
        ? { code: 'XX000', message: 'raw driver text postgres://u:p@h:54322/db' }
        : undefined,
  });

  await assert.rejects(
    () =>
      withLocalCommitTransaction(
        LOCAL_DB_URL,
        async (runner) => {
          await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
          throw new Error('boom before commit');
        },
        { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(!err.message.includes('postgres://'), 'connection URL leaked');
      assert.ok(!err.message.includes('raw driver text'), 'raw driver text leaked');
      return true;
    },
  );
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must still close');
});

test('withLocalCommitTransaction: connection failure → safe message; no BEGIN; client closed', async () => {
  const client = new FakeCommitClient({
    connectError: {
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED postgres://secretuser:sup3rsecretpw@127.0.0.1:54322/postgres',
    },
  });

  await assert.rejects(
    () =>
      withLocalCommitTransaction(LOCAL_DB_URL, async () => ({ outcome: 'commit', value: 'x' }), {
        createClient: () => client,
        assertLocalUrl: () => LOCAL_DB_TARGET,
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'Could not connect to the local database.');
      assert.ok(!err.message.includes('secretuser'), 'username leaked');
      assert.ok(!err.message.includes('sup3rsecretpw'), 'password leaked');
      assert.ok(!err.message.includes('127.0.0.1'), 'host leaked');
      return true;
    },
  );

  assert.ok(!client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.begin}`), 'no BEGIN after failed connect');
  assert.ok(client.events.includes('end'), 'client closed after a failed connect');
});

test('withLocalCommitTransaction: a failed COMMIT is reported as indeterminate and never rolled back', async () => {
  const client = new FakeCommitClient({
    errorOnQuery: (text) =>
      text === ONBOARD_COMMIT_TX_SQL.commit
        ? { code: 'XX000', message: 'raw driver text postgres://u:p@h:54322/db' }
        : undefined,
  });

  await assert.rejects(
    () =>
      withLocalCommitTransaction(
        LOCAL_DB_URL,
        async (runner) => {
          await runner.query('insert into core.tenants (slug) values ($1)', ['acme-kk']);
          return { outcome: 'commit', value: 'x' };
        },
        { createClient: () => client, assertLocalUrl: () => LOCAL_DB_TARGET },
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, COMMIT_INDETERMINATE_MESSAGE);
      assert.ok(!err.message.includes('postgres://'), 'connection URL leaked');
      return true;
    },
  );

  // A commit was attempted, so the wrapper must NOT also issue a rollback.
  assert.ok(!client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'no rollback after a commit attempt');
  assert.equal(client.events[client.events.length - 1], 'end', 'connection must still close');
});

// ===========================================================================
// runOnboardingCommitTransactionFromEnv — gates / ordering (no real DB)
// ===========================================================================

test('runOnboardingCommitTransactionFromEnv: invalid backup → no connection', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lbos-commit-'));
  try {
    const client = new FakeCommitClient();
    let guarded = false;
    await withDatabaseUrl(LOCAL_DB_URL, async () => {
      await assert.rejects(
        () =>
          runOnboardingCommitTransactionFromEnv(
            parsedInput({ ownerEmail: undefined }),
            { backupArtifactPath: path.join(dir, VALID_BACKUP_NAME) },
            {
              createClient: () => client,
              assertLocalUrl: () => {
                guarded = true;
                return LOCAL_DB_TARGET;
              },
            },
          ),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(/not found/i.test(err.message), 'backup not-found message expected');
          return true;
        },
      );
    });
    assert.equal(client.connected, false, 'must not connect when the backup is invalid');
    assert.equal(guarded, false, 'must not even guard the URL when the backup is invalid');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runOnboardingCommitTransactionFromEnv: missing DATABASE_URL → safe error, no connection', async () => {
  const client = new FakeCommitClient();
  await withDatabaseUrl(undefined, async () => {
    await assert.rejects(
      () =>
        runOnboardingCommitTransactionFromEnv(
          parsedInput({ ownerEmail: undefined }),
          { backupArtifactPath: '/tmp/ignored.dump.enc' },
          { createClient: () => client, validateBackupArtifact: okBackup },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(/DATABASE_URL/.test(err.message), 'must name the missing variable');
        return true;
      },
    );
    assert.equal(client.connected, false, 'must not connect without DATABASE_URL');
  });
});

test('runOnboardingCommitTransactionFromEnv: non-local DATABASE_URL → safe error, no connection', async () => {
  const client = new FakeCommitClient();
  await withDatabaseUrl(CLOUD_DB_URL, async () => {
    await assert.rejects(
      () =>
        runOnboardingCommitTransactionFromEnv(
          parsedInput({ ownerEmail: undefined }),
          { backupArtifactPath: '/tmp/ignored.dump.enc' },
          { createClient: () => client, validateBackupArtifact: okBackup },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(!err.message.includes('supabase.co'), 'must not echo the host');
        assert.ok(!err.message.includes('postgresql://'), 'must not echo the URL');
        return true;
      },
    );
    assert.equal(client.connected, false, 'must not connect for a non-local URL');
  });
});

test('runOnboardingCommitTransactionFromEnv: owner email + missing PII env → no connection', async () => {
  const client = new FakeCommitClient();
  const prevKey = process.env.PII_ENCRYPTION_KEY;
  const prevPepper = process.env.PII_HASH_PEPPER;
  delete process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_HASH_PEPPER;
  try {
    await withDatabaseUrl(LOCAL_DB_URL, async () => {
      await assert.rejects(
        () =>
          runOnboardingCommitTransactionFromEnv(
            parsedInput({ ownerEmail: FAKE_OWNER_EMAIL }),
            { backupArtifactPath: '/tmp/ignored.dump.enc' },
            { createClient: () => client, validateBackupArtifact: okBackup },
          ),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(/PII_ENCRYPTION_KEY/.test(err.message), 'must name the missing PII env var');
          assert.ok(!err.message.includes('@'), 'must not echo the email');
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

// ===========================================================================
// runOnboardingCommitTransactionFromEnv — commit / idempotency (fake client)
// ===========================================================================

test('runOnboardingCommitTransactionFromEnv: a changed plan commits exactly once and persists', async () => {
  const client = new FakeCommitClient({ responses: oneChangeDbResponses() });
  const result = await withDatabaseUrl(LOCAL_DB_URL, () =>
    runOnboardingCommitTransactionFromEnv(
      parsedInput({ ownerEmail: undefined }),
      { backupArtifactPath: '/tmp/ignored.dump.enc' },
      { createClient: () => client, validateBackupArtifact: okBackup },
    ),
  );

  assert.equal(result.stage, 'phase-1h-stage-3c4b');
  assert.equal(result.mode, 'commit');
  assert.equal(result.committed, true);
  assert.equal(result.persisted, true);
  assert.equal(result.noop, false);
  assert.equal(result.transaction, 'committed');
  assert.equal(result.dbConnection, 'local-write-commit');
  assert.equal(result.target, 'local');
  assert.ok(result.changedOperationCount >= 1, 'at least one change');
  // changed-only audit: one summary row per changed op set + a summary row.
  assert.equal(result.auditRowCount, result.changedOperationCount + 1);
  assert.deepEqual(result.dbTarget, LOCAL_DB_TARGET);

  // COMMIT issued exactly once and only after the audit inserts.
  const commitCalls = client.events.filter((e) => e === `query:${ONBOARD_COMMIT_TX_SQL.commit}`);
  assert.equal(commitCalls.length, 1, 'exactly one COMMIT');
  const lastAuditIdx = client.events.lastIndexOf(`query:${ONBOARD_WRITE_SQL.insertAudit}`);
  const commitIdx = client.events.indexOf(`query:${ONBOARD_COMMIT_TX_SQL.commit}`);
  assert.ok(lastAuditIdx >= 0, 'audit rows were written');
  assert.ok(commitIdx > lastAuditIdx, 'COMMIT only after audit rows');

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!serialized.includes(FAKE_TENANT_UUID), 'tenant uuid leaked');
  assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');
  assert.ok(!serialized.includes(LOCAL_DB_URL), 'the connection string leaked');
});

test('runOnboardingCommitTransactionFromEnv: a pure all-reuse plan is a no-op (no COMMIT, no audit rows)', async () => {
  const client = new FakeCommitClient({ responses: reuseDbResponses() });
  const result = await withDatabaseUrl(LOCAL_DB_URL, () =>
    runOnboardingCommitTransactionFromEnv(
      parsedInput({ ownerEmail: undefined }),
      { backupArtifactPath: '/tmp/ignored.dump.enc' },
      { createClient: () => client, validateBackupArtifact: okBackup },
    ),
  );

  assert.equal(result.committed, false);
  assert.equal(result.persisted, false);
  assert.equal(result.noop, true);
  assert.equal(result.transaction, 'rolled-back-noop');
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0, 'no audit pollution on a pure reuse run');

  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'no COMMIT for a no-op');
  assert.ok(client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'ROLLBACK for a no-op');
  assert.equal(
    client.events.filter((e) => e === `query:${ONBOARD_WRITE_SQL.insertAudit}`).length,
    0,
    'no audit rows written for a pure reuse run',
  );
});

test('runOnboardingCommitTransactionFromEnv: audit metadata carries no owner id / email / UUID', async () => {
  const client = new FakeCommitClient({ responses: oneChangeDbResponses() });
  await withDatabaseUrl(LOCAL_DB_URL, () =>
    runOnboardingCommitTransactionFromEnv(
      parsedInput({ ownerEmail: undefined }),
      { backupArtifactPath: '/tmp/ignored.dump.enc' },
      { createClient: () => client, validateBackupArtifact: okBackup },
    ),
  );

  const auditCalls = client.queries.filter((q) => q.text === ONBOARD_WRITE_SQL.insertAudit);
  assert.ok(auditCalls.length > 0, 'audit rows were written');
  for (const call of auditCalls) {
    const serialized = JSON.stringify(call.values[7]);
    assert.ok(!serialized.includes('@'), 'email-like token in audit metadata');
    assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner id in audit metadata');
    assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string in audit metadata');
  }
});

// ===========================================================================
// runOnboardingCommitTransactionFromEnv — safe error mapping (fake client)
// ===========================================================================

test('runOnboardingCommitTransactionFromEnv: tenant conflict fails safely (rollback, no leak)', async () => {
  const client = new FakeCommitClient({
    responses: {
      ...reuseDbResponses(),
      [ONBOARD_DB_QUERIES.tenantBySlug]: [
        { id: FAKE_TENANT_UUID, name: 'A Different Name', kind: 'client' },
      ],
    },
  });
  await withDatabaseUrl(LOCAL_DB_URL, async () => {
    await assert.rejects(
      () =>
        runOnboardingCommitTransactionFromEnv(
          parsedInput({ ownerEmail: undefined }),
          { backupArtifactPath: '/tmp/ignored.dump.enc' },
          { createClient: () => client, validateBackupArtifact: okBackup },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(/conflict/i.test(err.message));
        assert.ok(!UUID_LIKE.test(err.message), 'UUID leaked');
        assert.ok(!err.message.includes('@'), 'email leaked');
        return true;
      },
    );
  });
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'must not COMMIT on conflict');
  assert.ok(client.events.includes(`query:${ONBOARD_COMMIT_TX_SQL.rollback}`), 'ROLLBACK on conflict');
});

test('runOnboardingCommitTransactionFromEnv: suspended membership fails safely', async () => {
  const client = new FakeCommitClient({
    responses: { ...reuseDbResponses(), [ONBOARD_DB_QUERIES.membership]: [{ status: 'suspended' }] },
  });
  await withDatabaseUrl(LOCAL_DB_URL, async () => {
    await assert.rejects(
      () =>
        runOnboardingCommitTransactionFromEnv(
          parsedInput({ ownerEmail: undefined }),
          { backupArtifactPath: '/tmp/ignored.dump.enc' },
          { createClient: () => client, validateBackupArtifact: okBackup },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(/suspended/i.test(err.message));
        assert.ok(!UUID_LIKE.test(err.message));
        return true;
      },
    );
  });
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'must not COMMIT for a suspended membership');
});

test('runOnboardingCommitTransactionFromEnv: ambiguous location fails safely', async () => {
  const client = new FakeCommitClient({
    responses: {
      ...reuseDbResponses(),
      [ONBOARD_DB_QUERIES.locations]: [{ name: 'Main Store' }, { name: 'main  store' }],
    },
  });
  await withDatabaseUrl(LOCAL_DB_URL, async () => {
    await assert.rejects(
      () =>
        runOnboardingCommitTransactionFromEnv(
          parsedInput({ ownerEmail: undefined }),
          { backupArtifactPath: '/tmp/ignored.dump.enc' },
          { createClient: () => client, validateBackupArtifact: okBackup },
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(/multiple existing locations/i.test(err.message));
        return true;
      },
    );
  });
  assert.ok(!client.events.some((e) => /query:commit/i.test(e)), 'must not COMMIT on ambiguity');
});

test('mapCommitTransactionErrorToSafeMessage returns static, secret-free messages', () => {
  const leaky = {
    code: 'ECONNREFUSED',
    message: 'connect ECONNREFUSED postgres://secretuser:sup3rsecretpw@127.0.0.1:54322/postgres',
  };
  const messages = [
    mapCommitTransactionErrorToSafeMessage(leaky),
    mapCommitTransactionErrorToSafeMessage({ code: '23503' }),
    mapCommitTransactionErrorToSafeMessage({ code: '23505' }),
    mapCommitTransactionErrorToSafeMessage({ code: '57014' }),
    mapCommitTransactionErrorToSafeMessage(new Error('some raw driver text')),
    mapCommitTransactionErrorToSafeMessage('weird'),
  ];
  for (const message of messages) {
    assert.ok(message.length > 0);
    assert.ok(!message.includes('secretuser'), 'username leaked');
    assert.ok(!message.includes('sup3rsecretpw'), 'password leaked');
    assert.ok(!message.includes('postgres://'), 'connection URL leaked');
    assert.ok(!message.includes('127.0.0.1'), 'host leaked');
    assert.ok(!message.includes('@'), 'host/credential token leaked');
    assert.ok(!UUID_LIKE.test(message), 'a UUID-like string leaked');
  }
});