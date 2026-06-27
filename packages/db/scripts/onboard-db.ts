/**
 * Read-only local DB state loading for onboarding (Phase 1H Stage 3c-2).
 *
 * SCOPE — this is the ONLY onboarding file that imports a database driver
 * (`pg`). It is deliberately READ-ONLY and LOCAL-ONLY:
 *   - it connects to the LOCAL Supabase Postgres only, gated by the existing
 *     pure `assertLocalDatabaseUrl` guard (loopback host + port 54322),
 *   - it opens ONE `pg.Client` (never a pool) and closes it in a `finally`,
 *     after pinning the session to read-only (`default_transaction_read_only`),
 *   - it runs SELECT-only queries to build the pure {@link ExistingOnboardingState}
 *     consumed by the planner — it performs NO writes of any kind, opens no
 *     explicit transaction, and never resolves identity from the Supabase auth
 *     schema or from the owner email,
 *   - it never logs `DATABASE_URL`, credentials, owner identity, or raw driver
 *     errors; failures are mapped to short, static, secret-free messages.
 *
 * No Supabase client, no privileged service key, no Data API. Live onboarding
 * writes remain a later, separately approved stage.
 */
import { Client } from 'pg';
import { assertLocalDatabaseUrl } from './onboard-tenant.js';
import type { ExistingOnboardingState, OnboardingInput } from './onboard-tenant.js';

/** System role key (migration 0008) granted to a tenant's owner membership. */
const TENANT_OWNER_ROLE_KEY = 'tenant_owner';

/** Pins the session to read-only so any stray write is rejected by the DB. */
export const READ_ONLY_SESSION_SQL = 'set default_transaction_read_only = on';

/** Bounds each query so a slow/stuck read cannot hang the CLI indefinitely. */
export const STATEMENT_TIMEOUT_SQL = "set statement_timeout = '10s'";

/**
 * SELECT-only query catalog. Every entry is a read; none mutate data. Exported
 * so tests can assert (a) they are all reads and (b) they are parameterized.
 */
export const ONBOARD_DB_QUERIES = {
  tenantBySlug: 'select id, name, kind from core.tenants where slug = $1',
  ownerMirror: 'select 1 as exists from core.users where id = $1',
  locations: 'select name from core.locations where tenant_id = $1',
  membership:
    'select status from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  tenantOwnerRole: `select id from core.roles where tenant_id is null and key = '${TENANT_OWNER_ROLE_KEY}'`,
  roleAssignment:
    'select 1 as exists from core.role_assignments where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null',
  enabledModules:
    'select module from core.tenant_modules where tenant_id = $1 and is_enabled = true',
} as const;

/**
 * Minimal query abstraction so the state loader is driver-agnostic and fully
 * unit-testable with a fake runner (no real database in tests).
 */
export interface QueryRunner {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

/** An open, read-only local connection plus a way to close it. */
export interface LocalReadConnection {
  runner: QueryRunner;
  close: () => Promise<void>;
}

interface TenantRow {
  id: string;
  name: string;
  kind: string;
}
interface ExistsRow {
  exists: number;
}
interface LocationRow {
  name: string;
}
interface MembershipRow {
  status: string;
}
interface RoleRow {
  id: string;
}
interface ModuleRow {
  module: string;
}

/**
 * Map a driver/connection failure to a short, static, secret-free message.
 * NEVER echoes the raw error, connection URL, host, username, or password.
 */
export function mapPgErrorToSafeMessage(error: unknown): string {
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
    case '3F000':
      return 'Onboarding schema not found; run local migrations first.';
    case '25006':
      return 'Read-only session rejected a write; no writes are performed.';
    case '57014':
      return 'Read-only state query timed out.';
    default:
      return 'Failed to read onboarding state from the local database.';
  }
}

/**
 * Open a single read-only connection to the LOCAL database.
 *
 * Reads `process.env.DATABASE_URL` here (never logs it), runs it through the
 * pure local guard BEFORE constructing the client, then pins the session to
 * read-only. The wrapped runner converts any driver error into a safe message.
 */
export async function openLocalReadConnection(): Promise<LocalReadConnection> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for read-only onboarding state loading.');
  }

  // Throws a static, secret-free error for non-local / Cloud-like targets.
  assertLocalDatabaseUrl(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(READ_ONLY_SESSION_SQL);
    await client.query(STATEMENT_TIMEOUT_SQL);
  } catch (error) {
    await client.end().catch(() => undefined);
    throw new Error(mapPgErrorToSafeMessage(error));
  }

  const runner: QueryRunner = {
    async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
      try {
        const result = await client.query(text, values ? Array.from(values) : undefined);
        return { rows: result.rows as T[] };
      } catch (error) {
        throw new Error(mapPgErrorToSafeMessage(error));
      }
    },
  };

  return {
    runner,
    close: async () => {
      await client.end();
    },
  };
}

/**
 * Run `fn` with a read-only local connection, always closing it afterward.
 */
export async function withLocalReadConnection<T>(
  fn: (runner: QueryRunner) => Promise<T>,
): Promise<T> {
  const connection = await openLocalReadConnection();
  try {
    return await fn(connection.runner);
  } finally {
    await connection.close();
  }
}

/**
 * Build the pure {@link ExistingOnboardingState} from SELECT-only reads.
 *
 * Identity comes ONLY from `input.ownerAuthUserId` (the auth user id, which is
 * also `core.users.id`); the owner email is never used for lookup. Real UUIDs
 * (tenant / role ids) are held in memory solely to scope follow-up reads and
 * are NOT placed into the returned state, so the redacted summary stays clean.
 */
export async function loadExistingOnboardingState(
  runner: QueryRunner,
  input: OnboardingInput,
): Promise<ExistingOnboardingState> {
  // Owner mirror existence is independent of the tenant, so check it first —
  // it is meaningful even when the tenant does not yet exist.
  const ownerResult = await runner.query<ExistsRow>(ONBOARD_DB_QUERIES.ownerMirror, [
    input.ownerAuthUserId,
  ]);
  const userMirrorExists = ownerResult.rows.length > 0;

  const tenantResult = await runner.query<TenantRow>(ONBOARD_DB_QUERIES.tenantBySlug, [
    input.tenantSlug,
  ]);
  const tenantRow = tenantResult.rows[0];

  if (tenantRow === undefined) {
    // No tenant yet → no tenant-scoped follow-up reads.
    return { tenant: null, userMirrorExists };
  }

  const tenantId = tenantRow.id;

  const locationResult = await runner.query<LocationRow>(ONBOARD_DB_QUERIES.locations, [tenantId]);
  const membershipResult = await runner.query<MembershipRow>(ONBOARD_DB_QUERIES.membership, [
    tenantId,
    input.ownerAuthUserId,
  ]);

  const roleResult = await runner.query<RoleRow>(ONBOARD_DB_QUERIES.tenantOwnerRole, []);
  const ownerRoleId = roleResult.rows[0]?.id;
  if (ownerRoleId === undefined) {
    throw new Error('Required system role tenant_owner is missing.');
  }

  const assignmentResult = await runner.query<ExistsRow>(ONBOARD_DB_QUERIES.roleAssignment, [
    tenantId,
    input.ownerAuthUserId,
    ownerRoleId,
  ]);
  const moduleResult = await runner.query<ModuleRow>(ONBOARD_DB_QUERIES.enabledModules, [tenantId]);

  const membershipRow = membershipResult.rows[0];

  return {
    tenant: {
      // Matched by slug, so the input slug is authoritative; no UUID is exposed.
      slug: input.tenantSlug,
      name: tenantRow.name,
      kind: tenantRow.kind,
    },
    userMirrorExists,
    locationNames: locationResult.rows.map((row) => row.name),
    membershipExists: membershipRow !== undefined,
    membershipStatus: membershipRow?.status ?? null,
    roleAssignmentExists: assignmentResult.rows.length > 0,
    enabledModules: moduleResult.rows.map((row) => row.module),
  };
}

/**
 * Convenience wrapper: open a read-only local connection from the environment,
 * load the existing onboarding state, and always close the connection.
 */
export async function loadExistingOnboardingStateFromEnv(
  input: OnboardingInput,
): Promise<ExistingOnboardingState> {
  return withLocalReadConnection((runner) => loadExistingOnboardingState(runner, input));
}
