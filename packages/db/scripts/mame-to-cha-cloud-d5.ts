/**
 * Gate D5 executor: create only the staff employee binding with encrypted
 * synthetic PII. D1-D4 access state must already exist exactly.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import {
  buildMameToChaAuditRows,
  MAME_TO_CHA_WRITE_SQL,
  prepareEmployeeNamePII,
  type MameToChaPIIEnv,
  type PreparedEmployeeNamePII,
} from './mame-to-cha-write.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  type CloudDatabaseTarget,
} from './mame-to-cha-cloud-d1.js';
import {
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MAME_TO_CHA_CLOUD_D5_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  lockTenant: 'select pg_advisory_xact_lock(hashtext($1))',
  selectTenant: 'select id, name, kind from core.tenants where slug = $1',
  selectLocations:
    'select id, name, timezone, is_active from core.locations where tenant_id = $1 and name = $2',
  selectModule:
    'select is_enabled from core.tenant_modules where tenant_id = $1 and module = $2',
  selectUserMirror: 'select id from core.users where id = $1',
  selectMembership:
    'select status from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  selectEmployeeRole:
    "select id from core.roles where tenant_id is null and key = 'employee'",
  selectRoleAssignment:
    'select id from core.role_assignments where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null',
  selectEmployee:
    'select id, location_id, name_hash, position_label, employment_type, is_active ' +
    'from workforce.employees where tenant_id = $1 and user_id = $2',
  commit: 'commit',
  rollback: 'rollback',
} as const;

interface EmployeeRow {
  id: string;
  location_id: string | null;
  name_hash: string;
  position_label: string | null;
  employment_type: string | null;
  is_active: boolean;
}

export interface MameToChaCloudD5Summary {
  gate: 'D5';
  tenantSlug: 'mame-to-cha';
  action: 'create' | 'reuse';
  changedOperationCount: number;
  auditRowCount: number;
}

function staffFixture() {
  const staff = MAME_TO_CHA_FIXTURE.roles.filter((role) => role.role === 'employee');
  if (staff.length !== 1 || staff[0]?.requiresEmployeeBinding !== true) {
    throw new Error('D5 fixture must define exactly one employee binding.');
  }
  return staff[0];
}

function validateStaffUserId(staffUserId: string): void {
  if (!UUID_PATTERN.test(staffUserId)) {
    throw new Error('D5 staff Auth user id must be a valid UUID.');
  }
}

export async function executeMameToChaCloudD5(
  runner: QueryRunner,
  staffUserId: string,
  pii: PreparedEmployeeNamePII,
): Promise<MameToChaCloudD5Summary> {
  validateStaffUserId(staffUserId);
  const fixture = MAME_TO_CHA_FIXTURE;
  const staff = staffFixture();
  await runner.query(MAME_TO_CHA_CLOUD_D5_SQL.lockTenant, [fixture.tenant.slug]);

  const tenant = await runner.query<{ id: string; name: string; kind: string }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectTenant,
    [fixture.tenant.slug],
  );
  if (tenant.rows.length !== 1) throw new Error('D5 requires exactly one existing D1 tenant.');
  const tenantRow = tenant.rows[0]!;
  if (tenantRow.name !== fixture.tenant.displayName || tenantRow.kind !== fixture.tenant.kind) {
    throw new Error('D5 found a conflicting tenant row; refusing to write.');
  }

  const locations = await runner.query<{ id: string; name: string; timezone: string; is_active: boolean }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectLocations,
    [tenantRow.id, fixture.location.name],
  );
  if (
    locations.rows.length !== 1 ||
    locations.rows[0]?.timezone !== fixture.location.timezone ||
    locations.rows[0]?.is_active !== true
  ) {
    throw new Error('D5 requires exactly one active D1 fixture location.');
  }
  const locationId = locations.rows[0]!.id;

  const moduleResult = await runner.query<{ is_enabled: boolean }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectModule,
    [tenantRow.id, 'workforce'],
  );
  const mirror = await runner.query<{ id: string }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectUserMirror,
    [staffUserId],
  );
  const membership = await runner.query<{ status: string }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectMembership,
    [tenantRow.id, staffUserId],
  );
  const employeeRole = await runner.query<{ id: string }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectEmployeeRole,
  );
  if (
    moduleResult.rows.length !== 1 ||
    moduleResult.rows[0]?.is_enabled !== true ||
    mirror.rows.length !== 1 ||
    membership.rows.length !== 1 ||
    membership.rows[0]?.status !== 'active' ||
    employeeRole.rows.length !== 1
  ) {
    throw new Error('D5 requires exact active D2-D4 staff prerequisites.');
  }
  const assignment = await runner.query<{ id: string }>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectRoleAssignment,
    [tenantRow.id, staffUserId, employeeRole.rows[0]!.id],
  );
  if (assignment.rows.length !== 1) {
    throw new Error('D5 requires exactly one tenant-wide employee role assignment.');
  }

  const employee = await runner.query<EmployeeRow>(
    MAME_TO_CHA_CLOUD_D5_SQL.selectEmployee,
    [tenantRow.id, staffUserId],
  );
  if (employee.rows.length > 1) throw new Error('D5 found duplicate staff employee bindings.');

  const expectedPosition = staff.employeePositionLabel ?? null;
  const expectedEmploymentType = staff.employeeEmploymentType ?? null;
  const existing = employee.rows[0];
  if (
    existing !== undefined &&
    (
      existing.location_id !== locationId ||
      existing.name_hash !== pii.nameHash ||
      existing.position_label !== expectedPosition ||
      existing.employment_type !== expectedEmploymentType ||
      existing.is_active !== true
    )
  ) {
    throw new Error('D5 found a conflicting staff employee binding; refusing to write.');
  }

  const action: 'create' | 'reuse' = existing === undefined ? 'create' : 'reuse';
  if (action === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertEmployee, [
      tenantRow.id,
      locationId,
      staffUserId,
      pii.nameEncrypted,
      pii.nameHash,
      expectedPosition,
      expectedEmploymentType,
    ]);
  }
  const operations = [{ entity: 'employee_binding' as const, action, key: staff.logicalId }];
  const auditRows = buildMameToChaAuditRows(
    { tenantId: tenantRow.id, tenantSlug: fixture.tenant.slug, operations },
    { auditMode: 'changed-only' },
  );
  for (const row of auditRows) {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertAudit, [
      row.tenantId, row.actorId, row.actorKind, row.module, row.entity,
      row.entityId, row.action, row.metadata,
    ]);
  }
  return {
    gate: 'D5',
    tenantSlug: fixture.tenant.slug,
    action,
    changedOperationCount: action === 'create' ? 1 : 0,
    auditRowCount: auditRows.length,
  };
}

export interface CloudD5Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD5Deps {
  createClient?: (connectionString: string) => CloudD5Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
}

function createDefaultClient(connectionString: string): CloudD5Client {
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

export async function runMameToChaCloudD5FromEnv(
  gateInput: MameToChaCloudGateInput,
  staffUserId: string,
  env: MameToChaPIIEnv & { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD5Deps = {},
): Promise<MameToChaCloudD5Summary & { committed: boolean; noop: boolean; target: CloudDatabaseTarget }> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D5') throw new Error('This executor accepts D5 only.');
  validateStaffUserId(staffUserId);
  const staff = staffFixture();
  const pii = prepareEmployeeNamePII(
    staff.employeeDisplayName ?? `Acceptance ${staff.logicalId}`,
    env,
  );
  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (!databaseUrl) throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D5.');
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
      const result = await client.query(text, values);
      return { rows: result.rows as R[] };
    },
  };
  let began = false;
  let commitAttempted = false;
  try {
    await runner.query(MAME_TO_CHA_CLOUD_D5_SQL.statementTimeout);
    await runner.query(MAME_TO_CHA_CLOUD_D5_SQL.begin);
    began = true;
    const summary = await executeMameToChaCloudD5(runner, staffUserId, pii);
    const committed = summary.changedOperationCount > 0;
    if (committed) {
      commitAttempted = true;
      try {
        await client.query(MAME_TO_CHA_CLOUD_D5_SQL.commit);
      } catch {
        throw new Error('Cloud D5 commit outcome is unknown; verify D5 state before retrying.');
      }
    } else {
      await runner.query(MAME_TO_CHA_CLOUD_D5_SQL.rollback);
    }
    return { ...summary, committed, noop: !committed, target };
  } catch (error) {
    if (began && !commitAttempted) await client.query(MAME_TO_CHA_CLOUD_D5_SQL.rollback).catch(() => undefined);
    if (commitAttempted) throw error;
    if (error instanceof Error && error.message.startsWith('D5 ')) throw error;
    throw new Error('Cloud D5 transaction failed and was rolled back.');
  } finally {
    await client.end().catch(() => undefined);
  }
}
