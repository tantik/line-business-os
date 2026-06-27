/**
 * Onboarding WRITE-side SQL builders + executor + local dry-run transaction
 * (Phase 1H Stage 3c-3b).
 *
 * SCOPE — this is the ONLY onboarding file allowed to contain write SQL and
 * transaction-control SQL (`begin` / `rollback`). It is the WRITE-side driver
 * file; the read-side state loader (`onboard-db.ts`) stays SELECT-only.
 *
 * Stage 3c-3a shipped the parameterized write SQL builders and an executor that
 * runs against an INJECTED {@link QueryRunner} (fully unit-testable with a fake
 * runner). **Stage 3c-3b** adds a LOCAL-ONLY dry-run transaction wrapper:
 *   - it reads `DATABASE_URL` ONLY inside the transaction runner, runs it
 *     through the pure local guard (`assertLocalDatabaseUrl`) BEFORE opening any
 *     connection, then opens ONE `pg.Client` (never a pool),
 *   - it executes `begin` → load state → plan → validate → execute writes, then
 *     ALWAYS issues `rollback`; it NEVER commits — no transaction-finalizing
 *     statement appears in this file. Writes execute (so the plan is exercised
 *     against the real schema) and are then discarded; nothing is ever persisted,
 *   - on any error after `begin` it best-effort rolls back, always closes the
 *     connection in a `finally`, and only ever throws short, static,
 *     secret-free errors (no DB URL, credentials, SQL values, UUIDs, or email),
 *   - it does NOT log (no console output at all); it returns a redacted, no-PII
 *     summary and builds audit rows whose metadata carries only safe values
 *     (tenant slug, operation labels, module codes, counts) — never the owner
 *     email, the owner auth user id, secrets, or UUIDs.
 *
 * Identity comes ONLY from `input.ownerAuthUserId`; the owner email is never
 * used for identity lookup. Owner email, when provided, is written exclusively
 * as encrypted blob + blind-index hash via `@line-os/db` crypto.
 *
 * No connection pool, no privileged service-role key, no Supabase client, no
 * Data API, no Cloud. The committed (durable) onboarding routine and
 * any transaction-finalizing write remain a separate, later, approved stage.
 */
import { Client } from 'pg';
import { protectSearchablePII } from '../src/crypto.js';
import {
  MEMBERSHIP_STATUS_ACTIVE,
  TENANT_KIND_CLIENT,
  assertLocalDatabaseUrl,
  buildOnboardingPlan,
  normalizeLocationName,
} from './onboard-tenant.js';
import type {
  ExistingOnboardingState,
  ModuleCode,
  OnboardingInput,
  OnboardingPlan,
  PlanEntity,
  SafeDbTarget,
} from './onboard-tenant.js';
import { loadExistingOnboardingState } from './onboard-db.js';
import type { QueryRunner } from './onboard-db.js';

/** System role key (migration 0008) granted to a tenant's owner membership. */
const TENANT_OWNER_ROLE_KEY = 'tenant_owner';

/**
 * Write SQL catalog. Every statement is fully parameterized (values are bound,
 * never interpolated). Exported so tests can assert their exact shape (e.g. the
 * role assignment uses `where not exists` + `location_id is null`, the module
 * upsert never touches `config`, and no transaction-finalizing statement exists
 * anywhere).
 *
 * NOTE: transaction-control SQL (`begin` / `rollback`) lives in
 * {@link ONBOARD_TX_SQL} below; there is intentionally no transaction-finalizing
 * write anywhere in this file. The Stage 3c-3b dry-run wrapper always rolls back
 * — no change is ever persisted; durable onboarding is a separate, later,
 * approved stage.
 */
export const ONBOARD_WRITE_SQL = {
  insertTenant:
    'insert into core.tenants (slug, name, kind) values ($1, $2, $3) on conflict (slug) do nothing',
  selectTenant: 'select id, name, kind from core.tenants where slug = $1',
  insertUser: 'insert into core.users (id) values ($1) on conflict (id) do nothing',
  insertUserWithPII:
    'insert into core.users (id, email_encrypted, email_hash) values ($1, $2, $3) on conflict (id) do nothing',
  selectUserPII: 'select email_encrypted, email_hash from core.users where id = $1',
  backfillUserPII:
    'update core.users set email_encrypted = $2, email_hash = $3 where id = $1 and email_encrypted is null and email_hash is null',
  selectLocations: 'select id, name from core.locations where tenant_id = $1',
  insertLocation:
    'insert into core.locations (tenant_id, name, timezone) values ($1, $2, $3)',
  insertMembership:
    "insert into core.tenant_memberships (tenant_id, user_id, status) values ($1, $2, 'active') on conflict (tenant_id, user_id) do nothing",
  activateMembership:
    "update core.tenant_memberships set status = 'active' where tenant_id = $1 and user_id = $2 and status = 'invited'",
  selectTenantOwnerRole: `select id from core.roles where tenant_id is null and key = '${TENANT_OWNER_ROLE_KEY}'`,
  // NULL location_id is treated as distinct by the unique index, so the
  // tenant-wide owner role insert uses INSERT … SELECT … WHERE NOT EXISTS
  // instead of ON CONFLICT (which cannot dedupe NULL location_id rows).
  insertRoleAssignment:
    'insert into core.role_assignments (tenant_id, user_id, role_id, location_id) ' +
    'select $1, $2, $3, null where not exists (' +
    'select 1 from core.role_assignments ' +
    'where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null)',
  // Re-enable a disabled module; never overwrite an enabled row and never touch
  // `config` (the WHERE on the conflict action makes an enabled row a no-op).
  upsertTenantModule:
    'insert into core.tenant_modules (tenant_id, module, is_enabled) values ($1, $2, true) ' +
    'on conflict (tenant_id, module) do update set is_enabled = true ' +
    'where core.tenant_modules.is_enabled = false',
  insertAudit:
    'insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, metadata) ' +
    'values ($1, $2, $3, $4, $5, $6, $7, $8)',
} as const;

/** Action labels recorded per executed operation (safe for logs). */
export type OnboardingWriteAction =
  | 'create'
  | 'create_with_pii'
  | 'reuse'
  | 'pii_backfill'
  | 'activate'
  | 'enable';

/** A single executed write step, captured with log-safe labels only. */
export interface OnboardingWriteOperation {
  entity: PlanEntity;
  action: OnboardingWriteAction;
  module?: ModuleCode;
}

/** Owner-email PII material (never the raw email). */
export interface PreparedOwnerEmailPII {
  emailEncrypted: Buffer;
  emailHash: string;
}

/** Minimal env shape for PII preparation (no DB connection string, no driver). */
export interface OnboardingPIIEnv {
  PII_ENCRYPTION_KEY?: string;
  PII_HASH_PEPPER?: string;
}

/** Policy knobs for the write path. Defaults are the safe, fail-closed values. */
export interface OnboardingWritePolicy {
  /** Reactivate a suspended owner membership instead of failing. Default false. */
  allowSuspendedReactivation?: boolean;
  /** Reactivate a revoked owner membership instead of failing. Default false. */
  allowRevokedReactivation?: boolean;
}

const DEFAULT_WRITE_POLICY: Required<OnboardingWritePolicy> = {
  allowSuspendedReactivation: false,
  allowRevokedReactivation: false,
};

/** Inputs bundled for a single write run (no connection, no driver). */
export interface OnboardingWriteContext {
  input: OnboardingInput;
  plan: OnboardingPlan;
  state: ExistingOnboardingState;
  ownerEmailPII: PreparedOwnerEmailPII | null;
  policy: Required<OnboardingWritePolicy>;
}

/** Options accepted by {@link executeOnboardingWritePlan}. */
export interface ExecuteOnboardingWriteOptions {
  /** Prepared owner-email PII (required when the owner email is provided). */
  ownerEmailPII?: PreparedOwnerEmailPII | null;
  policy?: OnboardingWritePolicy;
}

/** An audit row built for an executed/reused operation (system actor, no PII). */
export interface OnboardingAuditRow {
  tenantId: string;
  actorId: null;
  actorKind: 'system';
  module: 'core';
  entity: string;
  entityId: string | null;
  action: string;
  metadata: Record<string, unknown>;
}

/**
 * Log-safe summary of a write run. Carries NO owner identity and NO UUIDs: only
 * the tenant slug, operation labels/counts, a boolean for whether an email was
 * supplied, and explicit flags proving nothing was persisted.
 */
export interface ExecutedOnboardingWriteSummary {
  stage: 'phase-1h-stage-3c3a';
  persisted: false;
  transactionControl: 'deferred-to-stage-3c-3b';
  dbConnection: 'caller-provided-runner';
  ownerEmailProvided: boolean;
  tenantSlug: string;
  operations: OnboardingWriteOperation[];
  operationCounts: Record<string, number>;
  auditRowCount: number;
}

/** Stable, log-safe label for an operation (entity.action[.module]). */
function operationLabel(op: OnboardingWriteOperation): string {
  return op.module ? `${op.entity}.${op.action}.${op.module}` : `${op.entity}.${op.action}`;
}

/** Tally operations into a `{ label: count }` map (safe for logs/metadata). */
function countOperations(operations: OnboardingWriteOperation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const op of operations) {
    const key = operationLabel(op);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Resolve owner-email PII material, or `null` when no email is provided.
 *
 * Requires `PII_ENCRYPTION_KEY` and `PII_HASH_PEPPER` ONLY when an email is
 * present (i.e. would be written/backfilled). Errors name the missing env
 * variable but NEVER include its value or the raw email. Reads the supplied
 * env object (defaults to `process.env`); it never reads any DB connection
 * string.
 */
export function prepareOwnerEmailPII(
  ownerEmail: string | null,
  env: OnboardingPIIEnv = process.env,
): PreparedOwnerEmailPII | null {
  if (ownerEmail === null) {
    return null;
  }
  const encryptionKey = env.PII_ENCRYPTION_KEY;
  const pepper = env.PII_HASH_PEPPER;
  if (encryptionKey === undefined || encryptionKey.trim() === '') {
    throw new Error('PII_ENCRYPTION_KEY is required to write the owner email.');
  }
  if (pepper === undefined || pepper.trim() === '') {
    throw new Error('PII_HASH_PEPPER is required to write the owner email.');
  }
  const { encrypted, hash } = protectSearchablePII(ownerEmail, {
    encryptionKey,
    pepper,
    kind: 'email',
  });
  return { emailEncrypted: encrypted, emailHash: hash };
}

/**
 * Pre-write safety gate. Throws a short, static, secret-free error (no UUID, no
 * email) for any condition that must fail BEFORE a single write is issued:
 *   - tenant slug conflict (same slug, different name/kind),
 *   - suspended / revoked owner membership (fail by default),
 *   - ambiguous location (more than one existing normalized-name match).
 */
export function validateWritablePlanOrThrow(
  input: OnboardingInput,
  plan: OnboardingPlan,
  state: ExistingOnboardingState = {},
  policy: OnboardingWritePolicy = {},
): void {
  const resolved = { ...DEFAULT_WRITE_POLICY, ...policy };

  const tenantConflict =
    !plan.ok || plan.operations.some((op) => op.entity === 'tenant' && op.action === 'conflict');
  if (tenantConflict) {
    throw new Error(
      'Tenant slug conflict: an existing tenant has a different name or kind; refusing to write.',
    );
  }

  if (state.membershipExists === true) {
    const status = state.membershipStatus ?? null;
    if (status === 'suspended' && !resolved.allowSuspendedReactivation) {
      throw new Error('Owner membership is suspended; refusing to onboard by default.');
    }
    if (status === 'revoked' && !resolved.allowRevokedReactivation) {
      throw new Error('Owner membership is revoked; refusing to onboard by default.');
    }
    if (
      status !== MEMBERSHIP_STATUS_ACTIVE &&
      status !== 'invited' &&
      status !== 'suspended' &&
      status !== 'revoked'
    ) {
      throw new Error('Owner membership is in an unrecognized state; refusing to write.');
    }
  }

  const matches = (state.locationNames ?? []).filter(
    (name) => normalizeLocationName(name) === input.locationNameKey,
  );
  if (matches.length > 1) {
    throw new Error(
      'Multiple existing locations match the normalized name; refusing to choose automatically.',
    );
  }
}

/**
 * Build audit rows for the executed operations. Every row uses the SYSTEM actor
 * (`actor_kind = 'system'`, `actor_id = null`) and `module = 'core'`. Metadata
 * carries ONLY safe values — tenant slug, operation labels, module codes, and
 * counts — never the owner email, the owner auth user id, secrets, or UUIDs.
 * `entityId` is intentionally `null` so no runtime UUID leaks into the trail.
 */
export function buildAuditRows(params: {
  tenantId: string;
  tenantSlug: string;
  operations: OnboardingWriteOperation[];
}): OnboardingAuditRow[] {
  const { tenantId, tenantSlug, operations } = params;

  const rows: OnboardingAuditRow[] = operations.map((op) => ({
    tenantId,
    actorId: null,
    actorKind: 'system',
    module: 'core',
    entity: op.entity,
    entityId: null,
    action: op.action,
    metadata: {
      tenant_slug: tenantSlug,
      operation: operationLabel(op),
      ...(op.module ? { module: op.module } : {}),
    },
  }));

  rows.push({
    tenantId,
    actorId: null,
    actorKind: 'system',
    module: 'core',
    entity: 'onboarding',
    entityId: null,
    action: 'summary',
    metadata: {
      tenant_slug: tenantSlug,
      counts: countOperations(operations),
    },
  });

  return rows;
}

interface IdRow {
  id: string;
}
interface UserPIIRow {
  email_encrypted: unknown;
  email_hash: unknown;
}
interface LocationNameRow {
  id: string;
  name: string;
}

/**
 * Execute the onboarding write plan against an INJECTED {@link QueryRunner}.
 *
 * This never connects to a database and never persists: in Stage 3c-3a the only
 * caller is the fake-runner test suite. It issues fully parameterized writes
 * (and the reads needed to resolve ids / decide PII backfill), records log-safe
 * operation labels, builds + inserts audit rows, and returns a redacted summary.
 *
 * Identity is `input.ownerAuthUserId` only; the owner email is never used as a
 * lookup key and is written solely as encrypted blob + hash.
 */
export async function executeOnboardingWritePlan(
  runner: QueryRunner,
  input: OnboardingInput,
  plan: OnboardingPlan,
  state: ExistingOnboardingState = {},
  options: ExecuteOnboardingWriteOptions = {},
): Promise<ExecutedOnboardingWriteSummary> {
  const policy = { ...DEFAULT_WRITE_POLICY, ...(options.policy ?? {}) };

  // Fail BEFORE any write on conflict / suspended / revoked / ambiguous state.
  validateWritablePlanOrThrow(input, plan, state, policy);

  const ownerEmailProvided = input.ownerEmail !== null;
  const ownerEmailPII = options.ownerEmailPII ?? null;
  if (ownerEmailProvided && ownerEmailPII === null) {
    // The email would be written/backfilled, so its PII material is mandatory.
    throw new Error(
      'Owner email provided but no PII material was prepared; PII_ENCRYPTION_KEY and PII_HASH_PEPPER are required.',
    );
  }

  const operations: OnboardingWriteOperation[] = [];

  // --- Tenant -------------------------------------------------------------
  const tenantAction = plan.operations.find((op) => op.entity === 'tenant')?.action;
  if (tenantAction === 'create') {
    await runner.query(ONBOARD_WRITE_SQL.insertTenant, [
      input.tenantSlug,
      input.tenantName,
      TENANT_KIND_CLIENT,
    ]);
    operations.push({ entity: 'tenant', action: 'create' });
  } else {
    operations.push({ entity: 'tenant', action: 'reuse' });
  }
  // Resolve the tenant id for both create and reuse (no tenant overwrite).
  const tenantResult = await runner.query<IdRow>(ONBOARD_WRITE_SQL.selectTenant, [input.tenantSlug]);
  const tenantId = tenantResult.rows[0]?.id;
  if (tenantId === undefined) {
    throw new Error('Tenant row was not found after the write; refusing to continue.');
  }

  // --- User mirror --------------------------------------------------------
  const userAction = plan.operations.find((op) => op.entity === 'user')?.action;
  if (userAction === 'create') {
    if (ownerEmailProvided && ownerEmailPII) {
      await runner.query(ONBOARD_WRITE_SQL.insertUserWithPII, [
        input.ownerAuthUserId,
        ownerEmailPII.emailEncrypted,
        ownerEmailPII.emailHash,
      ]);
      operations.push({ entity: 'user', action: 'create_with_pii' });
    } else {
      await runner.query(ONBOARD_WRITE_SQL.insertUser, [input.ownerAuthUserId]);
      operations.push({ entity: 'user', action: 'create' });
    }
  } else if (ownerEmailProvided && ownerEmailPII) {
    // Existing mirror: backfill ONLY when both PII columns are currently null.
    const piiResult = await runner.query<UserPIIRow>(ONBOARD_WRITE_SQL.selectUserPII, [
      input.ownerAuthUserId,
    ]);
    const existing = piiResult.rows[0];
    const lacksPII =
      existing !== undefined && existing.email_encrypted == null && existing.email_hash == null;
    if (lacksPII) {
      await runner.query(ONBOARD_WRITE_SQL.backfillUserPII, [
        input.ownerAuthUserId,
        ownerEmailPII.emailEncrypted,
        ownerEmailPII.emailHash,
      ]);
      operations.push({ entity: 'user', action: 'pii_backfill' });
    } else {
      operations.push({ entity: 'user', action: 'reuse' });
    }
  } else {
    operations.push({ entity: 'user', action: 'reuse' });
  }

  // --- Location -----------------------------------------------------------
  // Re-read at write time and match by normalized name; safe-fail on ambiguity.
  const locationResult = await runner.query<LocationNameRow>(ONBOARD_WRITE_SQL.selectLocations, [
    tenantId,
  ]);
  const locationMatches = locationResult.rows.filter(
    (row) => normalizeLocationName(row.name) === input.locationNameKey,
  );
  if (locationMatches.length > 1) {
    throw new Error(
      'Multiple existing locations match the normalized name; refusing to choose automatically.',
    );
  }
  if (locationMatches.length === 0) {
    await runner.query(ONBOARD_WRITE_SQL.insertLocation, [
      tenantId,
      input.locationName,
      input.timezone,
    ]);
    operations.push({ entity: 'location', action: 'create' });
  } else {
    operations.push({ entity: 'location', action: 'reuse' });
  }

  // --- Membership ---------------------------------------------------------
  const membershipStatus = state.membershipStatus ?? null;
  if (state.membershipExists !== true) {
    await runner.query(ONBOARD_WRITE_SQL.insertMembership, [tenantId, input.ownerAuthUserId]);
    operations.push({ entity: 'membership', action: 'create' });
  } else if (membershipStatus === MEMBERSHIP_STATUS_ACTIVE) {
    operations.push({ entity: 'membership', action: 'reuse' });
  } else if (membershipStatus === 'invited') {
    await runner.query(ONBOARD_WRITE_SQL.activateMembership, [tenantId, input.ownerAuthUserId]);
    operations.push({ entity: 'membership', action: 'activate' });
  } else {
    // suspended / revoked / unknown are rejected by the pre-write gate above.
    throw new Error('Owner membership is not in an onboardable state; refusing to write.');
  }

  // --- Role assignment (tenant-wide, location_id IS NULL) -----------------
  const roleResult = await runner.query<IdRow>(ONBOARD_WRITE_SQL.selectTenantOwnerRole, []);
  const roleId = roleResult.rows[0]?.id;
  if (roleId === undefined) {
    throw new Error('Required system role tenant_owner is missing; refusing to write.');
  }
  await runner.query(ONBOARD_WRITE_SQL.insertRoleAssignment, [
    tenantId,
    input.ownerAuthUserId,
    roleId,
  ]);
  operations.push({
    entity: 'role_assignment',
    action: state.roleAssignmentExists === true ? 'reuse' : 'create',
  });

  // --- Tenant modules -----------------------------------------------------
  for (const moduleEntry of plan.modules) {
    await runner.query(ONBOARD_WRITE_SQL.upsertTenantModule, [tenantId, moduleEntry.module]);
    operations.push({
      entity: 'tenant_module',
      action: moduleEntry.action === 'reuse' ? 'reuse' : 'enable',
      module: moduleEntry.module,
    });
  }

  // --- Audit --------------------------------------------------------------
  const auditRows = buildAuditRows({ tenantId, tenantSlug: input.tenantSlug, operations });
  for (const row of auditRows) {
    await runner.query(ONBOARD_WRITE_SQL.insertAudit, [
      row.tenantId,
      row.actorId,
      row.actorKind,
      row.module,
      row.entity,
      row.entityId,
      row.action,
      row.metadata,
    ]);
  }

  return {
    stage: 'phase-1h-stage-3c3a',
    persisted: false,
    transactionControl: 'deferred-to-stage-3c-3b',
    dbConnection: 'caller-provided-runner',
    ownerEmailProvided,
    tenantSlug: input.tenantSlug,
    operations,
    operationCounts: countOperations(operations),
    auditRowCount: auditRows.length,
  };
}

// ===========================================================================
// Stage 3c-3b: local-only dry-run transaction wrapper (ALWAYS ROLLBACK)
// ===========================================================================

/**
 * Transaction-control + session SQL for the LOCAL dry-run only. There is
 * deliberately no transaction-finalizing write: the dry-run always discards its
 * work via `rollback`.
 */
export const ONBOARD_TX_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  rollback: 'rollback',
} as const;

/**
 * Minimal `pg` client surface used by the dry-run transaction. Keeping it small
 * makes the wrapper fully unit-testable with a FAKE client (no real database in
 * tests) while the default implementation adapts a real `pg.Client`.
 */
export interface DryRunPgClient {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

/** Injectable dependencies for the dry-run transaction (defaults use `pg`). */
export interface DryRunTransactionDeps {
  /** Construct the (writable) local client. Defaults to a real `pg.Client`. */
  createClient?: (connectionString: string) => DryRunPgClient;
  /** Local-only URL guard. Defaults to {@link assertLocalDatabaseUrl}. */
  assertLocalUrl?: (databaseUrl: string) => SafeDbTarget;
  /** Map a driver error to a safe message. Defaults to the safe mapper below. */
  mapError?: (error: unknown) => string;
}

/**
 * Redacted result of a local dry-run transaction. Carries NO owner identity and
 * NO UUIDs: only the tenant slug, the safe local DB target, the nested redacted
 * write summary, and explicit flags proving the work was rolled back and that
 * nothing was persisted (and that nothing was committed).
 */
export interface DryRunTransactionResult {
  stage: 'phase-1h-stage-3c3b';
  mode: 'dry-run';
  dbConnection: 'local-write-dry-run';
  transaction: 'rolled-back';
  rolledBack: true;
  committed: false;
  persisted: false;
  liveOnboarding: 'not-implemented';
  stateSource: 'local-read-write-dry-run';
  ownerEmailProvided: boolean;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  write: ExecutedOnboardingWriteSummary;
}

/**
 * Map a driver / transaction failure to a short, static, secret-free message.
 * NEVER echoes the raw error, connection URL, host, credentials, SQL values,
 * UUIDs, or the owner email. Every write-time failure is reported as having been
 * rolled back, because the wrapper always discards its work.
 */
export function mapDryRunTransactionErrorToSafeMessage(error: unknown): string {
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
      return 'Onboarding schema mismatch; run local migrations first. The dry-run was rolled back.';
    case '23503':
      return 'A required related row was missing (foreign key); the dry-run was rolled back.';
    case '23505':
      return 'A unique constraint blocked the write; the dry-run was rolled back.';
    case '23502':
      return 'A required value was missing (not-null); the dry-run was rolled back.';
    case '22P02':
    case '23514':
      return 'A value failed validation (enum/check); the dry-run was rolled back.';
    case '25006':
      return 'The session rejected a write; no rows were persisted.';
    case '57014':
      return 'The dry-run transaction timed out and was rolled back.';
    default:
      return 'The local onboarding dry-run transaction failed and was rolled back.';
  }
}

/** Adapt a real `pg.Client` to the {@link DryRunPgClient} surface. */
function defaultCreateDryRunClient(connectionString: string): DryRunPgClient {
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
 * Open ONE local writable connection, run `fn` inside a `begin` … `rollback`
 * transaction, and ALWAYS roll back, then close the connection. It NEVER
 * commits (no transaction-finalizing write is issued). The local-only guard runs
 * BEFORE any connection is opened. Writes execute (so the plan is exercised
 * against the real schema) and are then discarded — nothing is persisted. No
 * pool, no privileged service-role key, no Supabase client, no Data API.
 */
export async function withLocalDryRunTransaction<T>(
  databaseUrl: string,
  fn: (runner: QueryRunner) => Promise<T>,
  deps: DryRunTransactionDeps = {},
): Promise<T> {
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const createClient = deps.createClient ?? defaultCreateDryRunClient;
  const mapError = deps.mapError ?? mapDryRunTransactionErrorToSafeMessage;

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
  try {
    await runner.query(ONBOARD_TX_SQL.statementTimeout);
    await runner.query(ONBOARD_TX_SQL.begin);
    began = true;

    const value = await fn(runner);

    // Always discard the work — the dry-run persists nothing.
    await runner.query(ONBOARD_TX_SQL.rollback);
    return value;
  } catch (error) {
    if (began) {
      // Best-effort rollback: never let a rollback failure mask the original
      // error, and never surface raw driver text. The connection is closed in
      // `finally`, so an aborted transaction persists nothing regardless.
      try {
        await client.query(ONBOARD_TX_SQL.rollback);
      } catch {
        // Intentionally ignored — see above.
      }
    }
    throw error instanceof Error ? error : new Error(mapError(error));
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Reduce an owner-email PII preparation failure to a short, static message that
 * never echoes the email or any key material. Missing-env failures keep naming
 * only the relevant variable; anything else is collapsed to a generic message.
 */
function safeOwnerPiiPrepMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('PII_ENCRYPTION_KEY')) {
    return message.includes('32 bytes')
      ? 'PII_ENCRYPTION_KEY is invalid (it must decode to exactly 32 bytes for AES-256).'
      : 'PII_ENCRYPTION_KEY is required to write the owner email.';
  }
  if (message.includes('PII_HASH_PEPPER')) {
    return 'PII_HASH_PEPPER is required to write the owner email.';
  }
  return 'Failed to prepare owner email PII; no value is ever logged.';
}

/**
 * Read `DATABASE_URL` from the environment, guard it as LOCAL-only, then run the
 * onboarding write path inside a single local dry-run transaction that ALWAYS
 * rolls back. Returns a redacted, no-PII, no-UUID result proving nothing was
 * persisted. It NEVER commits — no transaction-finalizing write is issued in
 * this path — and never touches Supabase Cloud. `DATABASE_URL` is read here
 * only; it is never logged.
 */
export async function runOnboardingDryRunTransactionFromEnv(
  input: OnboardingInput,
  deps: DryRunTransactionDeps = {},
): Promise<DryRunTransactionResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local onboarding dry-run transaction.');
  }

  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  // Guard (and capture a safe target) before any connection is opened.
  const dbTarget = assertLocalUrl(databaseUrl);

  // Prepare owner-email PII (if any) BEFORE connecting; map any failure to a
  // static message that never echoes the email or key material.
  let ownerEmailPII: PreparedOwnerEmailPII | null;
  try {
    ownerEmailPII = prepareOwnerEmailPII(input.ownerEmail);
  } catch (error) {
    throw new Error(safeOwnerPiiPrepMessage(error));
  }

  const write = await withLocalDryRunTransaction(
    databaseUrl,
    async (runner) => {
      const state = await loadExistingOnboardingState(runner, input);
      const plan = buildOnboardingPlan(input, state);
      validateWritablePlanOrThrow(input, plan, state);
      return executeOnboardingWritePlan(runner, input, plan, state, { ownerEmailPII });
    },
    deps,
  );

  return {
    stage: 'phase-1h-stage-3c3b',
    mode: 'dry-run',
    dbConnection: 'local-write-dry-run',
    transaction: 'rolled-back',
    rolledBack: true,
    committed: false,
    persisted: false,
    liveOnboarding: 'not-implemented',
    stateSource: 'local-read-write-dry-run',
    ownerEmailProvided: input.ownerEmail !== null,
    tenantSlug: input.tenantSlug,
    dbTarget,
    write,
  };
}
