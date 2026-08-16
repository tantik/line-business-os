/**
 * Onboarding COMMIT-side transaction wrapper (Phase 1H Stage 3c-4b).
 *
 * SCOPE — this is the ONLY onboarding file permitted to issue the transaction-
 * finalizing `commit` statement, and it does so LOCAL-ONLY and STRICTLY GATED:
 *   - the caller (the CLI) must already have validated every Stage 3c-4a gate
 *     (`--commit --yes --i-understand-this-writes-local-db --target local
 *     --backup-artifact <path>`) before this path is reached,
 *   - this runner re-validates the backup artifact (metadata only) BEFORE it
 *     reads `DATABASE_URL` or opens any connection, then runs the URL through the
 *     pure local guard (`assertLocalDatabaseUrl`: loopback host + port 54322)
 *     BEFORE constructing/connecting a single `pg.Client` (never a pool),
 *   - it opens exactly one transaction: `set statement_timeout` → `begin` → load
 *     state → build plan → validate writable plan → execute the write path (which
 *     writes CHANGED-ONLY audit rows) → `commit` ONLY after every write/audit
 *     succeeds. On any error before commit it best-effort `rollback`s; it always
 *     closes the client in `finally`,
 *   - IDEMPOTENCY: a pure all-reuse plan changes nothing, so it is `rollback`ed
 *     (NOT committed) and reported as a no-op — no audit rows and no `commit`,
 *   - if the `commit` itself fails the outcome is UNKNOWN; this never claims a
 *     rollback and surfaces a short, static, secret-free indeterminate error,
 *   - it NEVER logs, and every result/error is redacted: no `DATABASE_URL`, no
 *     credentials, no SQL values, no UUIDs, no owner auth user id, no email.
 *
 * Identity comes ONLY from `input.ownerAuthUserId`; the owner email is never used
 * for lookup and is written solely as encrypted blob + blind-index hash. No
 * connection pool, no privileged service-role key, no Supabase client, no Data
 * API, no Cloud,
 * no auth-admin. Reuses the write/plan/state/PII/audit logic verbatim from the
 * existing modules; this file adds only the local commit transaction control.
 */
import { Client } from 'pg';
import { assertLocalDatabaseUrl, buildOnboardingPlan } from './onboard-tenant.js';
import type { OnboardingInput, SafeDbTarget } from './onboard-tenant.js';
import { loadExistingOnboardingState } from './onboard-db.js';
import type { QueryRunner } from './onboard-db.js';
import {
  executeOnboardingWritePlan,
  prepareOwnerEmailPII,
  safeOwnerPiiPrepMessage,
  validateWritablePlanOrThrow,
} from './onboard-write.js';
import type {
  ExecutedOnboardingWriteSummary,
  OnboardingWritePolicy,
  PreparedOwnerEmailPII,
} from './onboard-write.js';
import { validateBackupArtifactForCommit } from './onboard-backup-gate.js';
import type { BackupArtifactValidationResult } from './onboard-backup-gate.js';

/**
 * Transaction-control + session SQL for the LOCAL commit path. This is the only
 * onboarding location that carries the transaction-finalizing `commit` token.
 */
export const ONBOARD_COMMIT_TX_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  commit: 'commit',
  rollback: 'rollback',
} as const;

/** Short, static, secret-free message used when a `commit` outcome is unknown. */
export const COMMIT_INDETERMINATE_MESSAGE =
  'The commit outcome is unknown; verify the local database state before retrying.';

/**
 * Minimal `pg` client surface used by the commit transaction. Kept small so the
 * wrapper is fully unit-testable with a FAKE client (no real database in tests);
 * the default implementation adapts a real `pg.Client`.
 */
export interface CommitPgClient {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

/** Injectable dependencies for the commit transaction (defaults use `pg`). */
export interface CommitTransactionDeps {
  /** Construct the (writable) local client. Defaults to a real `pg.Client`. */
  createClient?: (connectionString: string) => CommitPgClient;
  /** Local-only URL guard. Defaults to {@link assertLocalDatabaseUrl}. */
  assertLocalUrl?: (databaseUrl: string) => SafeDbTarget;
  /** Map a driver error to a safe message. Defaults to the safe mapper below. */
  mapError?: (error: unknown) => string;
  /** Validate the backup artifact (metadata only). Defaults to the gate helper. */
  validateBackupArtifact?: (artifactPath: string | undefined) => BackupArtifactValidationResult;
}

/** Decision returned by the transaction body: whether to commit or roll back. */
export interface CommitDecision<T> {
  outcome: 'commit' | 'rollback';
  value: T;
}

/** Options for {@link runOnboardingCommitTransactionFromEnv}. */
export interface OnboardingCommitOptions {
  /** Path to the (already gate-validated) encrypted backup artifact. */
  backupArtifactPath: string;
  /** Optional write policy (e.g. reactivation toggles). Default: fail-closed. */
  policy?: OnboardingWritePolicy;
}

/**
 * Redacted result of a local commit transaction. Carries NO owner identity and
 * NO UUIDs: only the tenant slug, the safe local DB target, the nested redacted
 * write summary, counts, and explicit flags for whether anything was persisted.
 */
export interface CommitTransactionResult {
  stage: 'phase-1h-stage-3c4b';
  mode: 'commit';
  dbConnection: 'local-write-commit';
  target: 'local';
  transaction: 'committed' | 'rolled-back-noop';
  committed: boolean;
  persisted: boolean;
  noop: boolean;
  backupArtifactValidated: true;
  ownerEmailProvided: boolean;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  changedOperationCount: number;
  auditRowCount: number;
  write: ExecutedOnboardingWriteSummary;
}

/**
 * Map a driver / transaction failure to a short, static, secret-free message.
 * NEVER echoes the raw error, connection URL, host, credentials, SQL values,
 * UUIDs, or the owner email. Failures before `commit` are reported as rolled
 * back (the wrapper discards the work); a failed `commit` is handled separately
 * via {@link COMMIT_INDETERMINATE_MESSAGE}.
 */
export function mapCommitTransactionErrorToSafeMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  switch (code) {
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
    case 'EHOSTUNREACH':
      return 'Could not connect to the local database.';
    case '28P01':
    case '28000':
      return 'Local database access was rejected.';
    case '3D000':
      return 'Local database does not exist.';
    case '42P01':
    case '42703':
    case '42883':
    case '3F000':
      return 'Onboarding schema mismatch; run local migrations first. The commit was rolled back.';
    case '23503':
      return 'A required related row was missing (foreign key); the commit was rolled back.';
    case '23505':
      return 'A unique constraint blocked the write; the commit was rolled back.';
    case '23502':
      return 'A required value was missing (not-null); the commit was rolled back.';
    case '22P02':
    case '23514':
      return 'A value failed validation (enum/check); the commit was rolled back.';
    case '25006':
      return 'The session rejected a write; no rows were persisted.';
    case '57014':
      return 'The commit transaction timed out and was rolled back.';
    default:
      return 'The local onboarding commit transaction failed and was rolled back.';
  }
}

/** Adapt a real `pg.Client` to the {@link CommitPgClient} surface. */
function defaultCreateCommitClient(connectionString: string): CommitPgClient {
  const client = new Client({ connectionString });
  return {
    connect: async () => {
      await client.connect();
    },
    query: async (text: string, values?: readonly unknown[]) => {
      const result = await client.query(text, values ? Array.from(values) : undefined);
      return { rows: result.rows };
    },
    end: async () => {
      await client.end();
    },
  };
}

/**
 * Open ONE local writable connection, run `fn` inside a transaction, and either
 * `commit` (when `fn` returns `outcome: 'commit'`) or `rollback` (no-op), then
 * always close the connection. The local-only guard runs BEFORE any connection
 * is opened. On any error before the commit it best-effort rolls back; if the
 * `commit` itself fails the outcome is unknown and a static indeterminate error
 * is thrown (it never attempts a misleading rollback in that case). No pool, no
 * service-role key, no Supabase client, no Data API.
 */
export async function withLocalCommitTransaction<T>(
  databaseUrl: string,
  fn: (runner: QueryRunner) => Promise<CommitDecision<T>>,
  deps: CommitTransactionDeps = {},
): Promise<{ value: T; committed: boolean }> {
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const createClient = deps.createClient ?? defaultCreateCommitClient;
  const mapError = deps.mapError ?? mapCommitTransactionErrorToSafeMessage;

  // Guard BEFORE constructing the client or opening any connection.
  assertLocalUrl(databaseUrl);

  const client = createClient(databaseUrl);

  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => undefined);
    throw new Error(mapError(error));
  }

  const runner: QueryRunner = {
    async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
      try {
        const result = await client.query(text, values);
        return { rows: result.rows as R[] };
      } catch (error) {
        throw new Error(mapError(error));
      }
    },
  };

  let began = false;
  let commitAttempted = false;
  let committed = false;
  try {
    await runner.query(ONBOARD_COMMIT_TX_SQL.statementTimeout);
    await runner.query(ONBOARD_COMMIT_TX_SQL.begin);
    began = true;

    const decision = await fn(runner);

    if (decision.outcome === 'commit') {
      commitAttempted = true;
      try {
        await client.query(ONBOARD_COMMIT_TX_SQL.commit);
      } catch {
        // The commit may or may not have persisted — never claim either way.
        throw new Error(COMMIT_INDETERMINATE_MESSAGE);
      }
      committed = true;
    } else {
      // Nothing changed: discard the (idempotent, no-op) work.
      await runner.query(ONBOARD_COMMIT_TX_SQL.rollback);
    }

    return { value: decision.value, committed };
  } catch (error) {
    // Best-effort rollback only when a commit was NOT attempted; never let a
    // rollback failure mask the original error, and never surface raw text.
    if (began && !commitAttempted) {
      try {
        await client.query(ONBOARD_COMMIT_TX_SQL.rollback);
      } catch {
        // Intentionally ignored — the connection is closed in `finally`.
      }
    }
    throw error instanceof Error ? error : new Error(mapError(error));
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Validate the backup artifact, read `DATABASE_URL` (LOCAL-only), prepare owner
 * PII, then run the onboarding write path inside a single local transaction that
 * commits ONLY when something changed. Returns a redacted, no-PII, no-UUID
 * result. The backup artifact is validated and the URL guarded BEFORE any
 * connection is opened; `DATABASE_URL` is read here only and is never logged.
 */
export async function runOnboardingCommitTransactionFromEnv(
  input: OnboardingInput,
  options: OnboardingCommitOptions,
  deps: CommitTransactionDeps = {},
): Promise<CommitTransactionResult> {
  // 1. Validate the backup artifact BEFORE reading DATABASE_URL or connecting.
  const validateBackupArtifact = deps.validateBackupArtifact ?? validateBackupArtifactForCommit;
  const backup = validateBackupArtifact(options.backupArtifactPath);
  if (!backup.ok) {
    throw new Error(backup.error);
  }

  // 2. Read DATABASE_URL here only; never log it.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local onboarding commit transaction.');
  }

  // 3. Local-only guard BEFORE connecting; capture a safe target for the result.
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const dbTarget = assertLocalUrl(databaseUrl);

  // 4. Prepare owner-email PII (if any) BEFORE connecting; safe error mapping.
  let ownerEmailPII: PreparedOwnerEmailPII | null;
  try {
    ownerEmailPII = prepareOwnerEmailPII(input.ownerEmail);
  } catch (error) {
    throw new Error(safeOwnerPiiPrepMessage(error));
  }

  // 5. Run the strictly-local commit transaction (commit only when changed).
  const { value: write, committed } = await withLocalCommitTransaction(
    databaseUrl,
    async (runner): Promise<CommitDecision<ExecutedOnboardingWriteSummary>> => {
      const state = await loadExistingOnboardingState(runner, input);
      const plan = buildOnboardingPlan(input, state);
      validateWritablePlanOrThrow(input, plan, state, options.policy);
      const summary = await executeOnboardingWritePlan(runner, input, plan, state, {
        ownerEmailPII,
        policy: options.policy,
        auditMode: 'changed-only',
      });
      return {
        outcome: summary.changedOperationCount > 0 ? 'commit' : 'rollback',
        value: summary,
      };
    },
    deps,
  );

  return {
    stage: 'phase-1h-stage-3c4b',
    mode: 'commit',
    dbConnection: 'local-write-commit',
    target: 'local',
    transaction: committed ? 'committed' : 'rolled-back-noop',
    committed,
    persisted: committed,
    noop: !committed,
    backupArtifactValidated: true,
    ownerEmailProvided: input.ownerEmail !== null,
    tenantSlug: input.tenantSlug,
    dbTarget,
    changedOperationCount: write.changedOperationCount,
    auditRowCount: write.auditRowCount,
    write,
  };
}
