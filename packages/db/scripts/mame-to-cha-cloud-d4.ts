/**
 * Gate D4 executor: create only core user mirrors, tenant memberships, and
 * tenant-wide role assignments for the two D3 synthetic Auth identities.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { ONBOARD_WRITE_SQL } from './onboard-write.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import type { PlanAction, PlanOperation } from './mame-to-cha-plan.js';
import type { MameToChaFixtureIdentity } from './mame-to-cha-state.js';
import { validateMameToChaIdentityOrThrow } from './mame-to-cha-state.js';
import { buildMameToChaAuditRows, MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  type CloudDatabaseTarget,
} from './mame-to-cha-cloud-d1.js';
import {
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D4_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  lockTenant: 'select pg_advisory_xact_lock(hashtext($1))',
  selectTenant: 'select id, name, kind from core.tenants where slug = $1',
  selectModule:
    'select is_enabled from core.tenant_modules where tenant_id = $1 and module = $2',
  selectUserMirror: 'select id from core.users where id = $1',
  selectMembership:
    'select status from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  selectRole: 'select id from core.roles where tenant_id is null and key = $1',
  selectRoleAssignment:
    'select id from core.role_assignments where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null',
  commit: 'commit',
  rollback: 'rollback',
} as const;

interface D4State {
  logicalId: string;
  role: 'manager' | 'employee';
  userId: string;
  mirrorExists: boolean;
  membershipStatus: string | null;
  roleId: string;
  roleAssignmentExists: boolean;
}

export interface MameToChaCloudD4Summary {
  gate: 'D4';
  tenantSlug: 'mame-to-cha';
  changedOperationCount: number;
  auditRowCount: number;
}

function membershipAction(status: string | null): PlanAction {
  if (status === null) return 'create';
  if (status === 'active') return 'reuse';
  if (status === 'invited') return 'activate';
  throw new Error('D4 found a blocked membership status; refusing to write.');
}

export async function executeMameToChaCloudD4(
  runner: QueryRunner,
  identity: MameToChaFixtureIdentity,
): Promise<MameToChaCloudD4Summary> {
  validateMameToChaIdentityOrThrow(identity);
  const fixture = MAME_TO_CHA_FIXTURE;
  await runner.query(MAME_TO_CHA_CLOUD_D4_SQL.lockTenant, [fixture.tenant.slug]);
  const tenant = await runner.query<{ id: string; name: string; kind: string }>(
    MAME_TO_CHA_CLOUD_D4_SQL.selectTenant,
    [fixture.tenant.slug],
  );
  if (tenant.rows.length !== 1) throw new Error('D4 requires exactly one existing D1 tenant.');
  const tenantRow = tenant.rows[0]!;
  if (tenantRow.name !== fixture.tenant.displayName || tenantRow.kind !== fixture.tenant.kind) {
    throw new Error('D4 found a conflicting tenant row; refusing to write.');
  }
  const moduleResult = await runner.query<{ is_enabled: boolean }>(
    MAME_TO_CHA_CLOUD_D4_SQL.selectModule,
    [tenantRow.id, 'workforce'],
  );
  if (moduleResult.rows.length !== 1 || moduleResult.rows[0]?.is_enabled !== true) {
    throw new Error('D4 requires the D2 Workforce module to be enabled.');
  }

  const states: D4State[] = [];
  for (const role of fixture.roles) {
    const userId = role.role === 'manager' ? identity.managerUserId : identity.staffUserId;
    const [mirror, membership, platformRole] = await Promise.all([
      runner.query<{ id: string }>(MAME_TO_CHA_CLOUD_D4_SQL.selectUserMirror, [userId]),
      runner.query<{ status: string }>(MAME_TO_CHA_CLOUD_D4_SQL.selectMembership, [tenantRow.id, userId]),
      runner.query<{ id: string }>(MAME_TO_CHA_CLOUD_D4_SQL.selectRole, [role.role]),
    ]);
    if (mirror.rows.length > 1 || membership.rows.length > 1 || platformRole.rows.length !== 1) {
      throw new Error('D4 found ambiguous prerequisite rows; refusing to write.');
    }
    const status = membership.rows[0]?.status ?? null;
    membershipAction(status);
    const roleId = platformRole.rows[0]!.id;
    const assignment = await runner.query<{ id: string }>(
      MAME_TO_CHA_CLOUD_D4_SQL.selectRoleAssignment,
      [tenantRow.id, userId, roleId],
    );
    if (assignment.rows.length > 1) throw new Error('D4 found duplicate role assignments.');
    states.push({
      logicalId: role.logicalId,
      role: role.role,
      userId,
      mirrorExists: mirror.rows.length === 1,
      membershipStatus: status,
      roleId,
      roleAssignmentExists: assignment.rows.length === 1,
    });
  }

  const operations: PlanOperation[] = [];
  for (const state of states) {
    const mirrorAction: PlanAction = state.mirrorExists ? 'reuse' : 'create';
    if (!state.mirrorExists) await runner.query(ONBOARD_WRITE_SQL.insertUser, [state.userId]);
    operations.push({ entity: 'user_mirror', action: mirrorAction, key: state.logicalId });

    const memberAction = membershipAction(state.membershipStatus);
    if (memberAction === 'create') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertMembership, [tenantRow.id, state.userId]);
    } else if (memberAction === 'activate') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.activateMembership, [tenantRow.id, state.userId]);
    }
    operations.push({ entity: 'membership', action: memberAction, key: state.logicalId });

    const assignmentAction: PlanAction = state.roleAssignmentExists ? 'reuse' : 'create';
    if (!state.roleAssignmentExists) {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertRoleAssignment, [
        tenantRow.id,
        state.userId,
        state.roleId,
      ]);
    }
    operations.push({
      entity: 'role_assignment',
      action: assignmentAction,
      key: `${state.logicalId}:${state.role}`,
    });
  }

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
    gate: 'D4',
    tenantSlug: fixture.tenant.slug,
    changedOperationCount: operations.filter((op) => op.action !== 'reuse').length,
    auditRowCount: auditRows.length,
  };
}

export interface CloudD4Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD4Deps {
  createClient?: (connectionString: string) => CloudD4Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
}

function createDefaultClient(connectionString: string): CloudD4Client {
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

export async function runMameToChaCloudD4FromEnv(
  gateInput: MameToChaCloudGateInput,
  identity: MameToChaFixtureIdentity,
  env: { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD4Deps = {},
): Promise<MameToChaCloudD4Summary & { committed: boolean; noop: boolean; target: CloudDatabaseTarget }> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D4') throw new Error('This executor accepts D4 only.');
  validateMameToChaIdentityOrThrow(identity);
  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (!databaseUrl) throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D4.');
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
    await runner.query(MAME_TO_CHA_CLOUD_D4_SQL.statementTimeout);
    await runner.query(MAME_TO_CHA_CLOUD_D4_SQL.begin);
    began = true;
    const summary = await executeMameToChaCloudD4(runner, identity);
    const committed = summary.changedOperationCount > 0;
    if (committed) {
      commitAttempted = true;
      try {
        await client.query(MAME_TO_CHA_CLOUD_D4_SQL.commit);
      } catch {
        throw new Error('Cloud D4 commit outcome is unknown; verify D4 state before retrying.');
      }
    } else {
      await runner.query(MAME_TO_CHA_CLOUD_D4_SQL.rollback);
    }
    return { ...summary, committed, noop: !committed, target };
  } catch (error) {
    if (began && !commitAttempted) await client.query(MAME_TO_CHA_CLOUD_D4_SQL.rollback).catch(() => undefined);
    if (commitAttempted) throw error;
    if (error instanceof Error && error.message.startsWith('D4 ')) throw error;
    throw new Error('Cloud D4 transaction failed and was rolled back.');
  } finally {
    await client.end().catch(() => undefined);
  }
}
