/**
 * Gate D1 executor: acceptance tenant + location only.
 *
 * No other onboarding entity is reachable from this module. The target and
 * exact D1 confirmation are validated before the database URL is read and
 * before a client is constructed. Tests inject a fake client and never use
 * the network.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { normalizeLocationName } from './onboard-tenant.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { buildMameToChaAuditRows, MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import {
  MAME_TO_CHA_ACCEPTANCE_TARGET,
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D1_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  lockTenant: 'select pg_advisory_xact_lock(hashtext($1))',
  selectTenant: 'select id, name, kind from core.tenants where slug = $1',
  selectLocations: 'select id, name, timezone, is_active from core.locations where tenant_id = $1',
  commit: 'commit',
  rollback: 'rollback',
} as const;

export interface CloudDatabaseTarget {
  projectRef: typeof MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
  environment: 'acceptance';
  connectionMode: 'direct' | 'pooler';
}

/** Validate only the reviewed project, postgres database, and TLS connection. */
export function assertMameToChaAcceptanceDatabaseUrl(databaseUrl: string): CloudDatabaseTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is not a valid URL.');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Cloud database URL must use the postgres protocol.');
  }
  if (url.pathname !== '/postgres') {
    throw new Error('Cloud database URL must target the postgres database.');
  }
  if (url.password === '') {
    throw new Error('Cloud database URL must include credentials.');
  }
  if (url.searchParams.get('sslmode') !== 'require') {
    throw new Error('Cloud database URL must require TLS.');
  }

  const ref = MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
  const host = url.hostname.toLowerCase();
  const username = decodeURIComponent(url.username).toLowerCase();
  const direct = host === `db.${ref}.supabase.co` && username === 'postgres';
  const pooler =
    host.endsWith('.pooler.supabase.com') &&
    username === `postgres.${ref}` &&
    (url.port === '5432' || url.port === '6543');
  if (!direct && !pooler) {
    throw new Error('Cloud database URL does not resolve to the reviewed acceptance project.');
  }
  return {
    projectRef: ref,
    environment: 'acceptance',
    connectionMode: direct ? 'direct' : 'pooler',
  };
}

interface TenantRow {
  id: string;
  name: string;
  kind: string;
}

interface LocationRow {
  id: string;
  name: string;
  timezone: string;
  is_active: boolean;
}

export interface MameToChaCloudD1Summary {
  gate: 'D1';
  tenantSlug: 'mame-to-cha';
  operations: readonly [
    { entity: 'tenant'; action: 'create' | 'reuse'; key: 'mame-to-cha' },
    { entity: 'location'; action: 'create' | 'reuse'; key: string },
  ];
  changedOperationCount: number;
  auditRowCount: number;
}

/**
 * Execute only D1 through an injected runner. Existing conflicting or
 * ambiguous state fails closed before an insert.
 */
export async function executeMameToChaCloudD1(runner: QueryRunner): Promise<MameToChaCloudD1Summary> {
  const fixture = MAME_TO_CHA_FIXTURE;
  await runner.query(MAME_TO_CHA_CLOUD_D1_SQL.lockTenant, [fixture.tenant.slug]);

  const initialTenant = await runner.query<TenantRow>(MAME_TO_CHA_CLOUD_D1_SQL.selectTenant, [
    fixture.tenant.slug,
  ]);
  if (initialTenant.rows.length > 1) throw new Error('D1 found duplicate tenant rows; refusing to write.');

  let tenantAction: 'create' | 'reuse' = 'reuse';
  const existingTenant = initialTenant.rows[0];
  if (existingTenant !== undefined) {
    if (existingTenant.name !== fixture.tenant.displayName || existingTenant.kind !== fixture.tenant.kind) {
      throw new Error('D1 found a conflicting tenant row; refusing to write.');
    }
  } else {
    tenantAction = 'create';
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertTenant, [
      fixture.tenant.slug,
      fixture.tenant.displayName,
      fixture.tenant.kind,
    ]);
  }

  const resolvedTenant = await runner.query<TenantRow>(MAME_TO_CHA_CLOUD_D1_SQL.selectTenant, [
    fixture.tenant.slug,
  ]);
  if (resolvedTenant.rows.length !== 1) {
    throw new Error('D1 could not resolve exactly one tenant after the tenant step.');
  }
  const tenantId = resolvedTenant.rows[0]!.id;

  const locations = await runner.query<LocationRow>(MAME_TO_CHA_CLOUD_D1_SQL.selectLocations, [tenantId]);
  const matching = locations.rows.filter(
    (row) => normalizeLocationName(row.name) === normalizeLocationName(fixture.location.name),
  );
  if (matching.length > 1) throw new Error('D1 found ambiguous fixture locations; refusing to write.');

  let locationAction: 'create' | 'reuse' = 'reuse';
  const existingLocation = matching[0];
  if (existingLocation !== undefined) {
    if (!existingLocation.is_active || existingLocation.timezone !== fixture.location.timezone) {
      throw new Error('D1 found a conflicting fixture location; refusing to write.');
    }
  } else {
    locationAction = 'create';
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertLocation, [
      tenantId,
      fixture.location.name,
      fixture.location.timezone,
    ]);
  }

  const operations: MameToChaCloudD1Summary['operations'] = [
    { entity: 'tenant', action: tenantAction, key: fixture.tenant.slug },
    { entity: 'location', action: locationAction, key: fixture.location.logicalId },
  ];
  const auditRows = buildMameToChaAuditRows(
    { tenantId, tenantSlug: fixture.tenant.slug, operations: [...operations] },
    { auditMode: 'changed-only' },
  );
  for (const row of auditRows) {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertAudit, [
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
    gate: 'D1',
    tenantSlug: fixture.tenant.slug,
    operations,
    changedOperationCount: operations.filter((operation) => operation.action === 'create').length,
    auditRowCount: auditRows.length,
  };
}

export interface CloudD1Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD1Deps {
  createClient?: (connectionString: string) => CloudD1Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
}

function createDefaultClient(connectionString: string): CloudD1Client {
  const client = new Client({ connectionString });
  return {
    connect: async () => {
      await client.connect();
    },
    query: async (text, values) => {
      const result = await client.query(text, values ? Array.from(values) : undefined);
      return { rows: result.rows };
    },
    end: async () => client.end(),
  };
}

function safeD1Error(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('D1 ')) return error;
  return new Error('Cloud D1 transaction failed and was rolled back.');
}

export interface RunMameToChaCloudD1Result extends MameToChaCloudD1Summary {
  committed: boolean;
  noop: boolean;
  target: CloudDatabaseTarget;
}

/**
 * Validate the gate before reading the secret URL, validate the URL before
 * constructing a client, then commit only D1 changes. An all-reuse run rolls
 * back as a no-op.
 */
export async function runMameToChaCloudD1FromEnv(
  gateInput: MameToChaCloudGateInput,
  env: { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD1Deps = {},
): Promise<RunMameToChaCloudD1Result> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D1') throw new Error('This executor accepts D1 only.');

  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D1.');
  }
  const target = (deps.assertDatabaseUrl ?? assertMameToChaAcceptanceDatabaseUrl)(databaseUrl);
  const client = (deps.createClient ?? createDefaultClient)(databaseUrl);

  try {
    await client.connect();
  } catch {
    await client.end().catch(() => undefined);
    throw new Error('Could not connect to the reviewed Cloud acceptance database.');
  }

  const runner: QueryRunner = {
    query: async <R = unknown>(text: string, values?: readonly unknown[]) => {
      try {
        const result = await client.query(text, values);
        return { rows: result.rows as R[] };
      } catch {
        throw new Error('Cloud D1 query failed.');
      }
    },
  };

  let began = false;
  let commitAttempted = false;
  try {
    await runner.query(MAME_TO_CHA_CLOUD_D1_SQL.statementTimeout);
    await runner.query(MAME_TO_CHA_CLOUD_D1_SQL.begin);
    began = true;
    const summary = await executeMameToChaCloudD1(runner);
    const committed = summary.changedOperationCount > 0;
    if (committed) {
      commitAttempted = true;
      try {
        await client.query(MAME_TO_CHA_CLOUD_D1_SQL.commit);
      } catch {
        throw new Error('Cloud D1 commit outcome is unknown; verify D1 state before retrying.');
      }
    } else {
      await runner.query(MAME_TO_CHA_CLOUD_D1_SQL.rollback);
    }
    return { ...summary, committed, noop: !committed, target };
  } catch (error) {
    if (began && !commitAttempted) {
      await client.query(MAME_TO_CHA_CLOUD_D1_SQL.rollback).catch(() => undefined);
    }
    if (commitAttempted) throw error;
    throw safeD1Error(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}
