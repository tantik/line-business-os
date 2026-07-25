/**
 * Gate D6 executor: apply only deterministic acceptance content after D1-D5
 * are present exactly. No identity, PII, module, or schema writes.
 */
import { Client } from 'pg';
import type { QueryRunner } from './onboard-db.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import {
  buildMameToChaFixturePlan,
  type PlanEntity,
  type PlanOperation,
} from './mame-to-cha-plan.js';
import {
  loadExistingMameToChaFixtureState,
  validateMameToChaIdentityOrThrow,
  type MameToChaFixtureIdentity,
} from './mame-to-cha-state.js';
import { buildMameToChaAuditRows, MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  type CloudDatabaseTarget,
} from './mame-to-cha-cloud-d1.js';
import {
  type MameToChaCloudGateInput,
  validateMameToChaCloudGate,
} from './mame-to-cha-cloud-gates.js';

export const MAME_TO_CHA_CLOUD_D6_SQL = {
  statementTimeout: "set statement_timeout = '10s'",
  begin: 'begin',
  lockTenant: 'select pg_advisory_xact_lock(hashtext($1))',
  selectTenant:
    'select id, name, kind from core.tenants where slug = $1',
  selectLocation:
    'select id, timezone, is_active from core.locations where tenant_id = $1 and name = $2',
  selectEmployee:
    'select id, location_id, is_active from workforce.employees where tenant_id = $1 and user_id = $2',
  commit: 'commit',
  rollback: 'rollback',
} as const;

const D6_ENTITIES: ReadonlySet<PlanEntity> = new Set([
  'shift_type',
  'recipe_category',
  'recipe',
  'shift_assignment',
  'shift_preference_request',
  'work_report',
  'correction_request',
]);

export interface MameToChaCloudD6Summary {
  gate: 'D6';
  tenantSlug: 'mame-to-cha';
  changedOperationCount: number;
  auditRowCount: number;
  operationCounts: Record<string, number>;
}

function actionFor(operations: readonly PlanOperation[], entity: PlanEntity, key: string) {
  const operation = operations.find((candidate) => candidate.entity === entity && candidate.key === key);
  if (!operation) throw new Error(`D6 plan is missing ${entity}.`);
  if (operation.action !== 'create' && operation.action !== 'reuse') {
    throw new Error(`D6 plan contains a forbidden ${entity} action.`);
  }
  return operation.action;
}

function validateD1ThroughD5Reuse(operations: readonly PlanOperation[]): void {
  const prerequisites = operations.filter((operation) => !D6_ENTITIES.has(operation.entity));
  if (prerequisites.length === 0 || prerequisites.some((operation) => operation.action !== 'reuse')) {
    throw new Error('D6 requires exact completed D1-D5 prerequisites; refusing to write.');
  }
}

function countOperations(operations: readonly PlanOperation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const operation of operations) {
    const key = `${operation.entity}.${operation.action}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export async function executeMameToChaCloudD6(
  runner: QueryRunner,
  identity: MameToChaFixtureIdentity,
  now: Date = new Date(),
): Promise<MameToChaCloudD6Summary> {
  validateMameToChaIdentityOrThrow(identity);
  const fixture = MAME_TO_CHA_FIXTURE;
  await runner.query(MAME_TO_CHA_CLOUD_D6_SQL.lockTenant, [fixture.tenant.slug]);
  const tenant = await runner.query<{ id: string; name: string; kind: string }>(
    MAME_TO_CHA_CLOUD_D6_SQL.selectTenant,
    [fixture.tenant.slug],
  );
  if (
    tenant.rows.length !== 1 ||
    tenant.rows[0]?.name !== fixture.tenant.displayName ||
    tenant.rows[0]?.kind !== fixture.tenant.kind
  ) {
    throw new Error('D6 requires the exact D1 tenant.');
  }
  const location = await runner.query<{ id: string; timezone: string; is_active: boolean }>(
    MAME_TO_CHA_CLOUD_D6_SQL.selectLocation,
    [tenant.rows[0]!.id, fixture.location.name],
  );
  if (
    location.rows.length !== 1 ||
    location.rows[0]?.timezone !== fixture.location.timezone ||
    location.rows[0]?.is_active !== true
  ) {
    throw new Error('D6 requires the exact active D1 location.');
  }
  const employee = await runner.query<{ id: string; location_id: string | null; is_active: boolean }>(
    MAME_TO_CHA_CLOUD_D6_SQL.selectEmployee,
    [tenant.rows[0]!.id, identity.staffUserId],
  );
  if (
    employee.rows.length !== 1 ||
    employee.rows[0]?.location_id !== location.rows[0]!.id ||
    employee.rows[0]?.is_active !== true
  ) {
    throw new Error('D6 requires the exact active D5 employee binding.');
  }
  const loaded = await loadExistingMameToChaFixtureState(runner, fixture, identity, now);
  const plan = buildMameToChaFixturePlan(fixture, loaded.state);
  if (!plan.ok) throw new Error('D6 fixture plan contains conflicts; refusing to write.');
  validateD1ThroughD5Reuse(plan.operations);

  const tenantId = loaded.ids.tenantId;
  const locationId = loaded.ids.locationId;
  const staffEmployeeId = loaded.ids.staffEmployeeId;
  if (!tenantId || !locationId || !staffEmployeeId) {
    throw new Error('D6 could not resolve exact tenant, location, and employee prerequisites.');
  }
  if (
    tenantId !== tenant.rows[0]!.id ||
    locationId !== location.rows[0]!.id ||
    staffEmployeeId !== employee.rows[0]!.id
  ) {
    throw new Error('D6 prerequisite resolution is inconsistent; refusing to write.');
  }

  const operations = plan.operations.filter((operation) => D6_ENTITIES.has(operation.entity));
  const shiftTypeIdByCode: Record<string, string> = {};
  for (const shiftType of fixture.shiftTypes) {
    const action = actionFor(operations, 'shift_type', shiftType.code);
    if (action === 'create') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftType, [
        tenantId, locationId, shiftType.code, shiftType.labelJa,
        shiftType.labelEn ?? null, shiftType.startsAtLocal, shiftType.endsAtLocal,
        shiftType.breakMinutes, shiftType.sortOrder,
      ]);
    }
    const result = await runner.query<{ id: string }>(
      MAME_TO_CHA_WRITE_SQL.selectShiftTypeIdByCode,
      [tenantId, locationId, shiftType.code],
    );
    if (result.rows.length !== 1) throw new Error('D6 could not resolve exactly one fixture shift type.');
    shiftTypeIdByCode[shiftType.code] = result.rows[0]!.id;
  }

  const categoryIdByLabel: Record<string, string> = {};
  let categorySortOrder = 0;
  for (const recipe of fixture.recipes) {
    if (categoryIdByLabel[recipe.categoryLabelJa] === undefined) {
      const action = actionFor(operations, 'recipe_category', recipe.categoryLabelJa);
      if (action === 'create') {
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertRecipeCategory, [
          tenantId, recipe.categoryLabelJa, categorySortOrder,
        ]);
      }
      const result = await runner.query<{ id: string }>(
        MAME_TO_CHA_WRITE_SQL.selectRecipeCategoryIdByLabel,
        [tenantId, recipe.categoryLabelJa],
      );
      if (result.rows.length !== 1) throw new Error('D6 could not resolve exactly one fixture recipe category.');
      categoryIdByLabel[recipe.categoryLabelJa] = result.rows[0]!.id;
      categorySortOrder += 1;
    }
    const action = actionFor(operations, 'recipe', recipe.titleJa);
    if (action === 'create') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertRecipe, [
        tenantId, categoryIdByLabel[recipe.categoryLabelJa]!, recipe.titleJa,
      ]);
    }
  }

  const primaryShiftType = fixture.shiftTypes[0];
  if (!primaryShiftType) throw new Error('D6 fixture has no primary shift type.');
  const shiftTypeId = shiftTypeIdByCode[primaryShiftType.code];
  if (!shiftTypeId) throw new Error('D6 could not resolve the primary shift type.');
  const anchorNow = loaded.anchorNow;

  const shiftDate = resolveIsoDate(anchorNow, fixture.acceptanceData.shiftAssignmentDayOffset);
  const shiftKey = `staff-1:day+${fixture.acceptanceData.shiftAssignmentDayOffset}`;
  if (actionFor(operations, 'shift_assignment', shiftKey) === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftAssignment, [
      tenantId, locationId, staffEmployeeId, shiftTypeId,
      localDateTimeToUtcIso(shiftDate, primaryShiftType.startsAtLocal, fixture.location.timezone),
      localDateTimeToUtcIso(shiftDate, primaryShiftType.endsAtLocal, fixture.location.timezone),
      primaryShiftType.breakMinutes,
    ]);
  }

  const preferenceDate = resolveIsoDate(anchorNow, fixture.acceptanceData.shiftPreferenceDayOffset);
  const preferenceKey = `staff-1:day+${fixture.acceptanceData.shiftPreferenceDayOffset}`;
  if (actionFor(operations, 'shift_preference_request', preferenceKey) === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftPreferenceRequest, [
      tenantId, locationId, staffEmployeeId, preferenceDate, shiftTypeId,
    ]);
  }

  const workReportDate = resolveIsoDate(anchorNow, fixture.acceptanceData.workReportDayOffset);
  const workReportKey = `staff-1:day${fixture.acceptanceData.workReportDayOffset}`;
  if (actionFor(operations, 'work_report', workReportKey) === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertWorkReport, [
      tenantId, locationId, staffEmployeeId, workReportDate,
      localDateTimeToUtcIso(workReportDate, primaryShiftType.startsAtLocal, fixture.location.timezone),
      localDateTimeToUtcIso(workReportDate, primaryShiftType.endsAtLocal, fixture.location.timezone),
    ]);
  }

  const correctionDate = resolveIsoDate(anchorNow, fixture.acceptanceData.correctionRequestDayOffset);
  const correctionKey = `staff-1:day${fixture.acceptanceData.correctionRequestDayOffset}`;
  if (actionFor(operations, 'correction_request', correctionKey) === 'create') {
    const attendance = await runner.query<{ id: string }>(
      MAME_TO_CHA_WRITE_SQL.selectWorkReportId,
      [tenantId, staffEmployeeId, workReportDate],
    );
    if (attendance.rows.length !== 1) throw new Error('D6 could not resolve exactly one fixture work report.');
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertCorrectionRequest, [
      tenantId, locationId, staffEmployeeId, correctionDate, attendance.rows[0]!.id,
    ]);
  }

  const auditRows = buildMameToChaAuditRows(
    { tenantId, tenantSlug: fixture.tenant.slug, operations },
    { auditMode: 'changed-only' },
  );
  for (const row of auditRows) {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertAudit, [
      row.tenantId, row.actorId, row.actorKind, row.module, row.entity,
      row.entityId, row.action, row.metadata,
    ]);
  }
  return {
    gate: 'D6',
    tenantSlug: fixture.tenant.slug,
    changedOperationCount: operations.filter((operation) => operation.action === 'create').length,
    auditRowCount: auditRows.length,
    operationCounts: countOperations(operations),
  };
}

export interface CloudD6Client {
  connect(): Promise<void>;
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export interface CloudD6Deps {
  createClient?: (connectionString: string) => CloudD6Client;
  assertDatabaseUrl?: (databaseUrl: string) => CloudDatabaseTarget;
}

function createDefaultClient(connectionString: string): CloudD6Client {
  const client = new Client({ connectionString });
  return {
    connect: async () => { await client.connect(); },
    query: async (text, values) => {
      const result = await client.query(text, values ? Array.from(values) : undefined);
      return { rows: result.rows };
    },
    end: async () => client.end(),
  };
}

export async function runMameToChaCloudD6FromEnv(
  gateInput: MameToChaCloudGateInput,
  identity: MameToChaFixtureIdentity,
  env: { MAME_TO_CHA_CLOUD_DATABASE_URL?: string } = process.env,
  deps: CloudD6Deps = {},
): Promise<MameToChaCloudD6Summary & { committed: boolean; noop: boolean; target: CloudDatabaseTarget }> {
  const gate = validateMameToChaCloudGate({ ...gateInput, mode: 'execute' });
  if (gate.definition.gate !== 'D6') throw new Error('This executor accepts D6 only.');
  validateMameToChaIdentityOrThrow(identity);
  const databaseUrl = env.MAME_TO_CHA_CLOUD_DATABASE_URL;
  if (!databaseUrl) throw new Error('MAME_TO_CHA_CLOUD_DATABASE_URL is required for D6.');
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
    await runner.query(MAME_TO_CHA_CLOUD_D6_SQL.statementTimeout);
    await runner.query(MAME_TO_CHA_CLOUD_D6_SQL.begin);
    began = true;
    const summary = await executeMameToChaCloudD6(runner, identity);
    const committed = summary.changedOperationCount > 0;
    if (committed) {
      commitAttempted = true;
      try {
        await client.query(MAME_TO_CHA_CLOUD_D6_SQL.commit);
      } catch {
        throw new Error('Cloud D6 commit outcome is unknown; verify D6 state before retrying.');
      }
    } else {
      await runner.query(MAME_TO_CHA_CLOUD_D6_SQL.rollback);
    }
    return { ...summary, committed, noop: !committed, target };
  } catch (error) {
    if (began && !commitAttempted) await client.query(MAME_TO_CHA_CLOUD_D6_SQL.rollback).catch(() => undefined);
    if (commitAttempted) throw error;
    if (error instanceof Error && error.message.startsWith('D6 ')) throw error;
    throw new Error('Cloud D6 transaction failed and was rolled back.');
  } finally {
    await client.end().catch(() => undefined);
  }
}
