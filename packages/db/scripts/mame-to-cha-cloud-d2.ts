/**
 * Gate D2 executor: enable only the Workforce tenant module.
 *
 * The gate and exact target are validated before the secret URL is read.
 * Tests inject a fake client; no network is used during verification.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { buildMameToChaAuditRows, MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  type CloudDatabaseTarget,
} from './mame-to-cha-cloud-d1.js';
import {
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D2_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  lockTenant: 'select pg_advisory_xact_lock(hashtext($1))',
  selectTenant: 'select id, name, kind from core.tenants where slug = $1',
  selectModule:
    'select module, is_enabled from core.tenant_modules where tenant_id = $1 and module = $2',
  commit: 'commit',
  rollback: 'rollback',
} as const;

interface TenantRow {
  id: string;
  name: string;
  kind: string;
}

interface ModuleRow {
  module: string;
  is_enabled: boolean;
}

export interface MameToChaCloudD2Summary {
  gate: 'D2';
  tenantSlug: 'mame-to-cha';
  module: 'workforce';
  action: 'enable' | 'reuse';
  changedOperationCount: number;
  auditRowCount: number;
}

export async function executeMameToChaCloudD2(runner: QueryRunner): Promise<MameToChaCloudD2Summary> {
  const fixture = MAME_TO_CHA_FIXTURE;
  await runner.query(MAME_TO_CHA_CLOUD_D2_SQL.lockTenant, [fixture.tenant.slug]);

  const tenant = await runner.query<TenantRow>(MAME_TO_CHA_CLOUD_D2_SQL.selectTenant, [
    fixture.tenant.slug,
  ]);
  if (tenant.rows.length !== 1) {
    throw new Error('D2 requires exactly one existing D1 tenant; refusing to write.');
  }
  const tenantRow = tenant.rows[0]!;
  if (tenantRow.name !== fixture.tenant.displayName || tenantRow.kind !== fixture.tenant.kind) {
    throw new Error('D2 found a conflicting tenant row; refusing to write.');
  }

  const moduleResult = await runner.query<ModuleRow>(MAME_TO_CHA_CLOUD_D2_SQL.selectModule, [
    tenantRow.id,
    'workforce',
  ]);
  if (moduleResult.rows.length > 1) {
    throw new Error('D2 found duplicate Workforce module rows; refusing to write.');
  }

  const action: 'enable' | 'reuse' =
    moduleResult.rows[0]?.is_enabled === true ? 'reuse' : 'enable';
  if (action === 'enable') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.upsertTenantModule, [
      tenantRow.id,
      'workforce',
    ]);
  }

  const operations = [
    { entity: 'tenant_module' as const, action, key: 'workforce' },
  ];
  const auditRows = buildMameToChaAuditRows(
    { tenantId: tenantRow.id, tenantSlug: fixture.tenant.slug, operations },
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
    gate: 'D2',
    tenantSlug: fixture.tenant.slug,
    module: 'workforce',
    action,
    changedOperationCount: action === 'enable' ? 1 : 0,
    auditRowCount: auditRows.length,
  };
}

export interface CloudD2Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD2Deps {
  createClient?: (connectionString: string) => CloudD2Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
}

function createDefaultClient(connectionString: string): CloudD2Client {
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

export interface RunMameToChaCloudD2Result extends MameToChaCloudD2Summary {
  committed: boolean;
  noop: boolean;
  target: CloudDatabaseTarget;
}

export async function runMameToChaCloudD2FromEnv(
  gateInput: MameToChaCloudGateInput,
  env: { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD2Deps = {},
): Promise<RunMameToChaCloudD2Result> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D2') throw new Error('This executor accepts D2 only.');

  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (!databaseUrl) throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D2.');
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
        throw new Error('Cloud D2 query failed.');
      }
    },
  };
  let began = false;
  let commitAttempted = false;
  try {
    await runner.query(MAME_TO_CHA_CLOUD_D2_SQL.statementTimeout);
    await runner.query(MAME_TO_CHA_CLOUD_D2_SQL.begin);
    began = true;
    const summary = await executeMameToChaCloudD2(runner);
    const committed = summary.changedOperationCount > 0;
    if (committed) {
      commitAttempted = true;
      try {
        await client.query(MAME_TO_CHA_CLOUD_D2_SQL.commit);
      } catch {
        throw new Error('Cloud D2 commit outcome is unknown; verify D2 state before retrying.');
      }
    } else {
      await runner.query(MAME_TO_CHA_CLOUD_D2_SQL.rollback);
    }
    return { ...summary, committed, noop: !committed, target };
  } catch (error) {
    if (began && !commitAttempted) {
      await client.query(MAME_TO_CHA_CLOUD_D2_SQL.rollback).catch(() => undefined);
    }
    if (commitAttempted) throw error;
    if (error instanceof Error && error.message.startsWith('D2 ')) throw error;
    throw new Error('Cloud D2 transaction failed and was rolled back.');
  } finally {
    await client.end().catch(() => undefined);
  }
}
