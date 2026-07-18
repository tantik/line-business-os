/**
 * Read-only local schema-existence check for the Mame To Cha onboarding
 * rehearsal dry-run (Phase 1N-4C Slice C1).
 *
 * SCOPE — this is the ONLY file in the rehearsal tool that imports a
 * database driver (`pg`), mirroring `onboard-db.ts`'s existing discipline.
 * It is READ-ONLY and LOCAL-ONLY:
 *   - gated by the existing `assertLocalDatabaseUrl` guard before connecting,
 *   - opens ONE `pg.Client` (never a pool), pins the session read-only
 *     (`set default_transaction_read_only = on`) before running any query,
 *     and always closes the connection in a `finally`,
 *   - queries only `information_schema` (table/view/routine existence) --
 *     never a business table's rows, never `auth.users`,
 *   - never logs `DATABASE_URL`, credentials, or a raw driver error; all
 *     failures map to short, static, secret-free messages.
 *
 * This exists to satisfy the dry-run requirement "required tables/views/
 * functions exist" and "no migration is needed" with real evidence, without
 * ever writing anything.
 */
import { Client } from 'pg';
import { assertLocalDatabaseUrl } from './onboard-tenant.js';

export const READ_ONLY_SESSION_SQL = 'set default_transaction_read_only = on';
export const STATEMENT_TIMEOUT_SQL = "set statement_timeout = '10s'";

/** `(schema, name)` pairs this rehearsal depends on. Read-only existence check only. */
export const REQUIRED_RELATIONS: readonly { schema: string; name: string; kind: 'table' | 'view' }[] = [
  { schema: 'core', name: 'tenants', kind: 'table' },
  { schema: 'core', name: 'locations', kind: 'table' },
  { schema: 'core', name: 'tenant_memberships', kind: 'table' },
  { schema: 'core', name: 'tenant_modules', kind: 'table' },
  { schema: 'core', name: 'role_assignments', kind: 'table' },
  { schema: 'core', name: 'roles', kind: 'table' },
  { schema: 'workforce', name: 'employees', kind: 'table' },
  { schema: 'workforce', name: 'shift_types', kind: 'table' },
  { schema: 'workforce', name: 'shifts', kind: 'table' },
  { schema: 'workforce', name: 'shift_requests', kind: 'table' },
  { schema: 'workforce', name: 'attendance', kind: 'table' },
  { schema: 'workforce', name: 'recipe_categories', kind: 'table' },
  { schema: 'workforce', name: 'recipes', kind: 'table' },
  { schema: 'api', name: 'my_tenant_memberships', kind: 'view' },
  { schema: 'api', name: 'my_tenant_locations', kind: 'view' },
  { schema: 'api', name: 'my_tenant_modules', kind: 'view' },
  { schema: 'api', name: 'workforce_my_staff_profile', kind: 'view' },
  { schema: 'api', name: 'workforce_staff_directory', kind: 'view' },
  { schema: 'api', name: 'workforce_shift_types', kind: 'view' },
] as const;

/** `(schema, name)` functions/RPCs this rehearsal depends on. */
export const REQUIRED_FUNCTIONS: readonly { schema: string; name: string }[] = [
  { schema: 'core', name: 'has_permission' },
  { schema: 'api', name: 'has_permission' },
] as const;

export interface QueryRunner {
  query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface RelationCheckResult {
  schema: string;
  name: string;
  kind: 'table' | 'view';
  exists: boolean;
}

export interface FunctionCheckResult {
  schema: string;
  name: string;
  exists: boolean;
}

export interface SchemaCheckReport {
  ok: boolean;
  relations: RelationCheckResult[];
  functions: FunctionCheckResult[];
  missing: string[];
}

/** Map a driver/connection failure to a short, static, secret-free message. */
export function mapPgErrorToSafeMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined;
  if (code === 'ECONNREFUSED') return 'Could not connect to the local database (connection refused).';
  if (code === '28P01') return 'Local database authentication failed.';
  if (code === '3D000') return 'Local database does not exist.';
  return 'Local database read-only check failed.';
}

/**
 * Run the read-only relation/function existence checks against a supplied
 * `QueryRunner` (unit-testable with a fake runner; no real connection in
 * tests). PURE relative to the runner: issues only SELECT-shaped
 * `information_schema` reads.
 */
export async function runSchemaExistenceChecks(runner: QueryRunner): Promise<SchemaCheckReport> {
  const relations: RelationCheckResult[] = [];
  for (const rel of REQUIRED_RELATIONS) {
    const { rows } = await runner.query<{ exists: boolean }>(
      'select exists (select 1 from information_schema.tables where table_schema = $1 and table_name = $2) as exists',
      [rel.schema, rel.name],
    );
    relations.push({ ...rel, exists: rows[0]?.exists === true });
  }

  const functions: FunctionCheckResult[] = [];
  for (const fn of REQUIRED_FUNCTIONS) {
    const { rows } = await runner.query<{ exists: boolean }>(
      'select exists (select 1 from information_schema.routines where routine_schema = $1 and routine_name = $2) as exists',
      [fn.schema, fn.name],
    );
    functions.push({ ...fn, exists: rows[0]?.exists === true });
  }

  const missing = [
    ...relations.filter((r) => !r.exists).map((r) => `${r.schema}.${r.name} (${r.kind})`),
    ...functions.filter((f) => !f.exists).map((f) => `${f.schema}.${f.name} (function)`),
  ];

  return { ok: missing.length === 0, relations, functions, missing };
}

/**
 * Open ONE local, read-only `pg.Client` (guarded by `assertLocalDatabaseUrl`
 * before connecting), run the existence checks, and always close the
 * connection. Never used against Cloud; never issues a write.
 */
export async function runLocalReadOnlySchemaCheck(databaseUrl: string): Promise<SchemaCheckReport> {
  assertLocalDatabaseUrl(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(STATEMENT_TIMEOUT_SQL);
    await client.query(READ_ONLY_SESSION_SQL);
    return await runSchemaExistenceChecks(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
