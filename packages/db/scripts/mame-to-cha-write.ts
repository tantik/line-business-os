/**
 * Mame To Cha fixture WRITE-side SQL builders + executor (Phase 1N-4C Slice
 * C1 completion).
 *
 * SCOPE — this is the ONLY file in this tool allowed to contain fixture
 * write SQL (mirrors `onboard-write.ts`'s "only write file" discipline).
 * Every statement is fully parameterized. It never invents a column or
 * permission name -- every table/column referenced here was confirmed
 * directly against `supabase/migrations/0002`, `0008`, `0009`, `0020`,
 * `0021`, `0025`-`0028` (see `docs/phase-1n-4c-local-onboarding-rehearsal.md`
 * Section 4). It executes against an INJECTED `QueryRunner`
 * (fully unit-testable with a fake runner; no real connection here) and
 * reuses the ALREADY-HARDENED, already-tested local transaction wrappers
 * (`withLocalDryRunTransaction`/`withLocalCommitTransaction`) from
 * `onboard-write.ts`/`onboard-commit.ts` rather than re-implementing
 * transaction control -- this file adds no new BEGIN/COMMIT/ROLLBACK SQL of
 * its own.
 *
 * Identity comes ONLY from the two explicit auth user ids the caller
 * supplies (`MameToChaFixtureIdentity`); this module never resolves an
 * identity from an email (same MVP Option A discipline as
 * `onboard-write.ts`'s owner). Employee PII (the staff fixture's display
 * name) is written exclusively as encrypted blob + blind-index hash via
 * `@line-os/db/crypto`, exactly like `onboard-write.ts`'s owner-email path
 * -- never a new plaintext storage path.
 */
import { protectSearchablePII } from '../src/crypto.js';
import { assertLocalDatabaseUrl, normalizeLocationName } from './onboard-tenant.js';
import type { SafeDbTarget } from './onboard-tenant.js';
import type { QueryRunner } from './onboard-db.js';
import {
  withLocalCommitTransaction,
  ONBOARD_COMMIT_TX_SQL,
  type CommitDecision,
  type CommitTransactionDeps,
} from './onboard-commit.js';
import { withLocalDryRunTransaction, ONBOARD_TX_SQL, type DryRunTransactionDeps } from './onboard-write.js';
import type { MameToChaFixtureManifest, FixtureRoleKey } from './mame-to-cha-fixture.js';
import { FIXTURE_TENANT_SLUG, PROTECTED_TENANT_SLUGS } from './mame-to-cha-fixture.js';
import {
  buildMameToChaFixturePlan,
  type MameToChaFixturePlan,
  type PlanEntity,
  type PlanAction,
} from './mame-to-cha-plan.js';
import { MAME_TO_CHA_STATE_SQL, loadExistingMameToChaFixtureState } from './mame-to-cha-state.js';
import type { MameToChaFixtureIdentity, ResolvedMameToChaFixtureIds } from './mame-to-cha-state.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';

/** Parameterized write SQL. Every statement binds values; none interpolates. */
export const MAME_TO_CHA_WRITE_SQL = {
  insertTenant:
    'insert into core.tenants (slug, name, kind) values ($1, $2, $3) on conflict (slug) do nothing',
  insertLocation: 'insert into core.locations (tenant_id, name, timezone) values ($1, $2, $3)',
  upsertTenantModule:
    'insert into core.tenant_modules (tenant_id, module, is_enabled) values ($1, $2, true) ' +
    'on conflict (tenant_id, module) do update set is_enabled = true ' +
    'where core.tenant_modules.is_enabled = false',
  insertMembership:
    "insert into core.tenant_memberships (tenant_id, user_id, status) values ($1, $2, 'active') on conflict (tenant_id, user_id) do nothing",
  activateMembership:
    "update core.tenant_memberships set status = 'active' where tenant_id = $1 and user_id = $2 and status = 'invited'",
  insertRoleAssignment:
    'insert into core.role_assignments (tenant_id, user_id, role_id, location_id) ' +
    'select $1, $2, $3, null where not exists (' +
    'select 1 from core.role_assignments ' +
    'where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null)',
  insertEmployee:
    'insert into workforce.employees ' +
    '(tenant_id, location_id, user_id, name_encrypted, name_hash, position_label, employment_type, is_active) ' +
    'values ($1, $2, $3, $4, $5, $6, $7, true)',
  insertShiftType:
    'insert into workforce.shift_types ' +
    '(tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local, break_minutes, is_custom, sort_order, is_active) ' +
    'values ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, true) ' +
    'on conflict (tenant_id, location_id, code) do nothing',
  selectShiftTypeIdByCode:
    'select id from workforce.shift_types where tenant_id = $1 and location_id = $2 and code = $3',
  insertRecipeCategory:
    'insert into workforce.recipe_categories (tenant_id, label_ja, sort_order, is_active) values ($1, $2, $3, true)',
  selectRecipeCategoryIdByLabel:
    'select id from workforce.recipe_categories where tenant_id = $1 and label_ja = $2',
  insertRecipe:
    'insert into workforce.recipes (tenant_id, location_id, recipe_category_id, title_ja, status) ' +
    "values ($1, null, $2, $3, 'published')",
  insertShiftAssignment:
    'insert into workforce.shifts ' +
    '(tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) ' +
    'values ($1, $2, $3, $4, $5, $6, $7, true)',
  insertShiftPreferenceRequest:
    'insert into workforce.shift_requests ' +
    "(tenant_id, location_id, employee_id, kind, status, work_date, shift_type_id, details) " +
    "values ($1, $2, $3, 'preference', 'pending', $4, $5, '{}'::jsonb)",
  insertWorkReport:
    'insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in, clock_out, status) ' +
    "values ($1, $2, $3, $4, $5, $6, 'present')",
  selectWorkReportId:
    'select id from workforce.attendance where tenant_id = $1 and employee_id = $2 and work_date = $3',
  insertCorrectionRequest:
    'insert into workforce.shift_requests ' +
    "(tenant_id, location_id, employee_id, kind, status, work_date, attendance_id, details) " +
    "values ($1, $2, $3, 'correction', 'pending', $4, $5, '{}'::jsonb)",
  insertAudit:
    'insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, metadata) ' +
    'values ($1, $2, $3, $4, $5, $6, $7, $8)',
} as const;

/** Minimal env shape for the employee-name PII preparation (no connection string). */
export interface MameToChaPIIEnv {
  PII_ENCRYPTION_KEY?: string;
  PII_HASH_PEPPER?: string;
}

export interface PreparedEmployeeNamePII {
  nameEncrypted: Buffer;
  nameHash: string;
}

/**
 * Prepare the staff fixture's synthetic employee-name PII (never a real
 * client name). Requires `PII_ENCRYPTION_KEY`/`PII_HASH_PEPPER` -- the same
 * env vars the generic onboarding tool already requires for owner email --
 * so no new secret-handling convention is introduced.
 */
export function prepareEmployeeNamePII(
  displayName: string,
  env: MameToChaPIIEnv = process.env,
): PreparedEmployeeNamePII {
  const encryptionKey = env.PII_ENCRYPTION_KEY;
  const pepper = env.PII_HASH_PEPPER;
  if (encryptionKey === undefined || encryptionKey.trim() === '') {
    throw new Error('PII_ENCRYPTION_KEY is required to write the fixture employee name.');
  }
  if (pepper === undefined || pepper.trim() === '') {
    throw new Error('PII_HASH_PEPPER is required to write the fixture employee name.');
  }
  const { encrypted, hash } = protectSearchablePII(displayName, { encryptionKey, pepper, kind: 'raw' });
  return { nameEncrypted: encrypted, nameHash: hash };
}

/** A single executed write step (log-safe: entity/action/fixture-key only). */
export interface MameToChaWriteOperation {
  entity: PlanEntity;
  action: PlanAction;
  key: string;
}

export type MameToChaAuditMode = 'all' | 'changed-only';

const STATE_CHANGING_ACTIONS: ReadonlySet<PlanAction> = new Set(['create', 'activate', 'enable']);

function isStateChanging(action: PlanAction): boolean {
  return STATE_CHANGING_ACTIONS.has(action);
}

export interface MameToChaAuditRow {
  tenantId: string;
  actorId: null;
  actorKind: 'system';
  module: 'workforce';
  entity: string;
  entityId: null;
  action: string;
  metadata: Record<string, unknown>;
}

function operationLabel(op: MameToChaWriteOperation): string {
  return `${op.entity}.${op.action}`;
}

function countOperations(operations: MameToChaWriteOperation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const op of operations) {
    const key = operationLabel(op);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Build audit rows for the executed operations. System actor, no PII, no
 * UUID in `entityId` (always null) -- metadata carries only the tenant slug,
 * the operation label, and the fixture-owned key (a slug/code/label, never a
 * secret). `changed-only` mirrors the committed onboarding path: a pure
 * all-reuse run writes zero audit rows.
 */
export function buildMameToChaAuditRows(
  params: { tenantId: string; tenantSlug: string; operations: MameToChaWriteOperation[] },
  options: { auditMode?: MameToChaAuditMode } = {},
): MameToChaAuditRow[] {
  const auditMode = options.auditMode ?? 'all';
  const relevant =
    auditMode === 'changed-only' ? params.operations.filter((op) => isStateChanging(op.action)) : params.operations;
  if (relevant.length === 0) return [];

  const rows: MameToChaAuditRow[] = relevant.map((op) => ({
    tenantId: params.tenantId,
    actorId: null,
    actorKind: 'system',
    module: 'workforce',
    entity: op.entity,
    entityId: null,
    action: op.action,
    metadata: { tenant_slug: params.tenantSlug, operation: operationLabel(op), fixture_key: op.key },
  }));

  rows.push({
    tenantId: params.tenantId,
    actorId: null,
    actorKind: 'system',
    module: 'workforce',
    entity: 'mame_to_cha_rehearsal',
    entityId: null,
    action: 'summary',
    metadata: { tenant_slug: params.tenantSlug, counts: countOperations(relevant) },
  });

  return rows;
}

/**
 * Pre-write safety gate. Throws BEFORE any write for any condition that must
 * never proceed: wrong/empty/protected tenant slug, a plan conflict (e.g. a
 * suspended membership), or ambiguous location.
 */
export function validateMameToChaWritePlanOrThrow(
  fixture: MameToChaFixtureManifest,
  plan: MameToChaFixturePlan,
): void {
  if (!fixture.tenant.slug || fixture.tenant.slug.trim() === '') {
    throw new Error('Fixture tenant slug must not be empty; refusing to write.');
  }
  if (fixture.tenant.slug !== FIXTURE_TENANT_SLUG) {
    throw new Error(`Fixture tenant slug must be exactly "${FIXTURE_TENANT_SLUG}"; refusing to write.`);
  }
  if ((PROTECTED_TENANT_SLUGS as readonly string[]).includes(fixture.tenant.slug)) {
    throw new Error('Fixture tenant slug collides with a protected tenant; refusing to write.');
  }
  if (!plan.ok || plan.conflicts.length > 0) {
    throw new Error(`Fixture plan has unresolved conflicts; refusing to write: ${plan.conflicts.join('; ')}`);
  }
}

export interface ExecutedMameToChaWriteSummary {
  persisted: false;
  tenantSlug: string;
  operations: MameToChaWriteOperation[];
  operationCounts: Record<string, number>;
  changedOperationCount: number;
  auditRowCount: number;
}

/**
 * Execute the fixture write plan against an injected {@link QueryRunner}.
 * Idempotent by construction: every step either matches the plan's `reuse`
 * action (no write) or inserts using `on conflict do nothing`/`where not
 * exists` guards, so a re-run over the same fixture-owned rows never
 * duplicates them and never touches a row outside this fixture's own
 * natural keys. Never touches `mame-to-cha-tokyo` or any other tenant --
 * every statement is scoped to the tenant id resolved from the exact
 * `mame-to-cha` slug.
 */
export async function executeMameToChaFixtureWritePlan(
  runner: QueryRunner,
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  plan: MameToChaFixturePlan,
  ids: ResolvedMameToChaFixtureIds,
  options: { auditMode?: MameToChaAuditMode; now?: Date; piiEnv?: MameToChaPIIEnv } = {},
): Promise<ExecutedMameToChaWriteSummary> {
  validateMameToChaWritePlanOrThrow(fixture, plan);

  const now = options.now ?? new Date();
  const operations: MameToChaWriteOperation[] = [];
  const opAction = (entity: PlanEntity, key: string): PlanAction =>
    plan.operations.find((op) => op.entity === entity && op.key === key)?.action ?? 'create';

  // --- Tenant ---------------------------------------------------------------
  const tenantAction = opAction('tenant', fixture.tenant.slug);
  if (tenantAction === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertTenant, [
      fixture.tenant.slug,
      fixture.tenant.displayName,
      fixture.tenant.kind,
    ]);
  }
  operations.push({ entity: 'tenant', action: tenantAction, key: fixture.tenant.slug });
  const tenantResult = await runner.query<{ id: string }>(MAME_TO_CHA_STATE_SQL.tenantBySlug, [
    fixture.tenant.slug,
  ]);
  const tenantId = tenantResult.rows[0]?.id;
  if (tenantId === undefined) throw new Error('Fixture tenant row was not found after the write; refusing to continue.');

  // --- Location ---------------------------------------------------------------
  const locationAction = opAction('location', fixture.location.logicalId);
  if (locationAction === 'create') {
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertLocation, [tenantId, fixture.location.name, fixture.location.timezone]);
  }
  operations.push({ entity: 'location', action: locationAction, key: fixture.location.logicalId });
  const locationsResult = await runner.query<{ id: string; name: string; is_active: boolean }>(
    MAME_TO_CHA_STATE_SQL.locationsByTenant,
    [tenantId],
  );
  const locationMatches = locationsResult.rows.filter(
    (row) => row.is_active && normalizeLocationName(row.name) === normalizeLocationName(fixture.location.name),
  );
  if (locationMatches.length > 1) {
    throw new Error('Multiple active locations match the fixture location name; refusing to choose automatically.');
  }
  const locationId = locationMatches[0]?.id;
  if (locationId === undefined) throw new Error('Fixture location row was not found after the write; refusing to continue.');

  // --- Tenant modules -----------------------------------------------------
  for (const module of ['core', ...fixture.modules]) {
    const action = opAction('tenant_module', module);
    await runner.query(MAME_TO_CHA_WRITE_SQL.upsertTenantModule, [tenantId, module]);
    operations.push({ entity: 'tenant_module', action, key: module });
  }

  // --- Roles: membership + role assignment (+ employee binding for staff) --
  const roleIdByKey: Partial<Record<FixtureRoleKey, string>> = { ...ids.roleIdByKey };
  let staffEmployeeId: string | null = ids.staffEmployeeId;

  for (const role of fixture.roles) {
    const userId = role.role === 'manager' ? identity.managerUserId : identity.staffUserId;

    const membershipAction = opAction('membership', role.logicalId);
    if (membershipAction === 'create') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertMembership, [tenantId, userId]);
    } else if (membershipAction === 'activate') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.activateMembership, [tenantId, userId]);
    } else if (membershipAction === 'conflict') {
      throw new Error(`Membership for "${role.logicalId}" is in a non-onboardable state; refusing to write.`);
    }
    operations.push({ entity: 'membership', action: membershipAction, key: role.logicalId });

    const roleId = roleIdByKey[role.role];
    if (roleId === undefined) {
      throw new Error(`Required system role "${role.role}" is missing; refusing to write.`);
    }
    const roleAssignmentAction = opAction('role_assignment', `${role.logicalId}:${role.role}`);
    await runner.query(MAME_TO_CHA_WRITE_SQL.insertRoleAssignment, [tenantId, userId, roleId]);
    operations.push({ entity: 'role_assignment', action: roleAssignmentAction, key: `${role.logicalId}:${role.role}` });

    if (role.requiresEmployeeBinding) {
      const bindingAction = opAction('employee_binding', role.logicalId);
      if (bindingAction === 'create') {
        const displayName = role.employeeDisplayName ?? `Acceptance ${role.logicalId}`;
        const pii = prepareEmployeeNamePII(displayName, options.piiEnv);
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertEmployee, [
          tenantId,
          locationId,
          userId,
          pii.nameEncrypted,
          pii.nameHash,
          role.employeePositionLabel ?? null,
          role.employeeEmploymentType ?? null,
        ]);
        const employeeResult = await runner.query<{ id: string; location_id: string | null; is_active: boolean }>(
          MAME_TO_CHA_STATE_SQL.employeeByUser,
          [tenantId, userId],
        );
        staffEmployeeId = employeeResult.rows[0]?.id ?? staffEmployeeId;
      }
      operations.push({ entity: 'employee_binding', action: bindingAction, key: role.logicalId });
    }
  }

  // --- Shift types ----------------------------------------------------------
  const shiftTypeIdByCode: Record<string, string> = {};
  for (const shiftType of fixture.shiftTypes) {
    const action = opAction('shift_type', shiftType.code);
    if (action === 'create') {
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftType, [
        tenantId,
        locationId,
        shiftType.code,
        shiftType.labelJa,
        shiftType.labelEn ?? null,
        shiftType.startsAtLocal,
        shiftType.endsAtLocal,
        shiftType.breakMinutes,
        shiftType.sortOrder,
      ]);
    }
    operations.push({ entity: 'shift_type', action, key: shiftType.code });
    const shiftTypeResult = await runner.query<{ id: string }>(MAME_TO_CHA_WRITE_SQL.selectShiftTypeIdByCode, [
      tenantId,
      locationId,
      shiftType.code,
    ]);
    const shiftTypeId = shiftTypeResult.rows[0]?.id;
    if (shiftTypeId !== undefined) shiftTypeIdByCode[shiftType.code] = shiftTypeId;
  }

  // --- Recipes ----------------------------------------------------------------
  const categoryIdByLabel: Record<string, string> = {};
  let categorySortOrder = 0;
  for (const recipe of fixture.recipes) {
    if (categoryIdByLabel[recipe.categoryLabelJa] === undefined) {
      const action = opAction('recipe_category', recipe.categoryLabelJa);
      if (action === 'create') {
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertRecipeCategory, [tenantId, recipe.categoryLabelJa, categorySortOrder]);
      }
      operations.push({ entity: 'recipe_category', action, key: recipe.categoryLabelJa });
      const categoryResult = await runner.query<{ id: string }>(MAME_TO_CHA_WRITE_SQL.selectRecipeCategoryIdByLabel, [
        tenantId,
        recipe.categoryLabelJa,
      ]);
      const categoryId = categoryResult.rows[0]?.id;
      if (categoryId !== undefined) categoryIdByLabel[recipe.categoryLabelJa] = categoryId;
      categorySortOrder += 1;
    }

    const recipeAction = opAction('recipe', recipe.titleJa);
    if (recipeAction === 'create') {
      const categoryId = categoryIdByLabel[recipe.categoryLabelJa];
      await runner.query(MAME_TO_CHA_WRITE_SQL.insertRecipe, [tenantId, categoryId ?? null, recipe.titleJa]);
    }
    operations.push({ entity: 'recipe', action: recipeAction, key: recipe.titleJa });
  }

  // --- Acceptance data (requires the staff employee binding) -----------------
  if (staffEmployeeId !== null) {
    const primaryShiftType = fixture.shiftTypes[0];
    if (primaryShiftType !== undefined) {
      const shiftTypeId = shiftTypeIdByCode[primaryShiftType.code];
      const shiftDate = resolveIsoDate(now, fixture.acceptanceData.shiftAssignmentDayOffset);
      const startsAtIso = localDateTimeToUtcIso(shiftDate, primaryShiftType.startsAtLocal, fixture.location.timezone);
      const endsAtIso = localDateTimeToUtcIso(shiftDate, primaryShiftType.endsAtLocal, fixture.location.timezone);
      const shiftAssignmentKey = `staff-1:day+${fixture.acceptanceData.shiftAssignmentDayOffset}`;
      const shiftAssignmentAction = opAction('shift_assignment', shiftAssignmentKey);
      if (shiftAssignmentAction === 'create' && shiftTypeId !== undefined) {
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftAssignment, [
          tenantId,
          locationId,
          staffEmployeeId,
          shiftTypeId,
          startsAtIso,
          endsAtIso,
          primaryShiftType.breakMinutes,
        ]);
      }
      operations.push({ entity: 'shift_assignment', action: shiftAssignmentAction, key: shiftAssignmentKey });

      const preferenceDate = resolveIsoDate(now, fixture.acceptanceData.shiftPreferenceDayOffset);
      const preferenceKey = `staff-1:day+${fixture.acceptanceData.shiftPreferenceDayOffset}`;
      const preferenceAction = opAction('shift_preference_request', preferenceKey);
      if (preferenceAction === 'create') {
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertShiftPreferenceRequest, [
          tenantId,
          locationId,
          staffEmployeeId,
          preferenceDate,
          shiftTypeId ?? null,
        ]);
      }
      operations.push({ entity: 'shift_preference_request', action: preferenceAction, key: preferenceKey });

      const workReportDate = resolveIsoDate(now, fixture.acceptanceData.workReportDayOffset);
      const workReportKey = `staff-1:day${fixture.acceptanceData.workReportDayOffset}`;
      const workReportAction = opAction('work_report', workReportKey);
      const clockInIso = localDateTimeToUtcIso(workReportDate, primaryShiftType.startsAtLocal, fixture.location.timezone);
      const clockOutIso = localDateTimeToUtcIso(workReportDate, primaryShiftType.endsAtLocal, fixture.location.timezone);
      if (workReportAction === 'create') {
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertWorkReport, [
          tenantId,
          locationId,
          staffEmployeeId,
          workReportDate,
          clockInIso,
          clockOutIso,
        ]);
      }
      operations.push({ entity: 'work_report', action: workReportAction, key: workReportKey });

      const correctionDate = resolveIsoDate(now, fixture.acceptanceData.correctionRequestDayOffset);
      const correctionKey = `staff-1:day${fixture.acceptanceData.correctionRequestDayOffset}`;
      const correctionAction = opAction('correction_request', correctionKey);
      if (correctionAction === 'create') {
        const workReportRow = await runner.query<{ id: string }>(MAME_TO_CHA_WRITE_SQL.selectWorkReportId, [
          tenantId,
          staffEmployeeId,
          workReportDate,
        ]);
        const attendanceId = workReportRow.rows[0]?.id ?? null;
        await runner.query(MAME_TO_CHA_WRITE_SQL.insertCorrectionRequest, [
          tenantId,
          locationId,
          staffEmployeeId,
          correctionDate,
          attendanceId,
        ]);
      }
      operations.push({ entity: 'correction_request', action: correctionAction, key: correctionKey });
    }
  }

  // --- Audit -----------------------------------------------------------------
  const auditMode = options.auditMode ?? 'all';
  const auditRows = buildMameToChaAuditRows({ tenantId, tenantSlug: fixture.tenant.slug, operations }, { auditMode });
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

  const changedOperationCount = operations.filter((op) => isStateChanging(op.action)).length;

  return {
    persisted: false,
    tenantSlug: fixture.tenant.slug,
    operations,
    operationCounts: countOperations(operations),
    changedOperationCount,
    auditRowCount: auditRows.length,
  };
}

// ===========================================================================
// Local dry-run / commit transaction entry points (reusing the already-
// hardened, already-tested wrappers from onboard-write.ts/onboard-commit.ts)
// ===========================================================================

export interface MameToChaDryRunResult {
  mode: 'dry-run';
  rolledBack: true;
  persisted: false;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  write: ExecutedMameToChaWriteSummary;
}

/**
 * Read `DATABASE_URL`, guard it LOCAL-only, then run the fixture write path
 * inside a local transaction that ALWAYS rolls back (reusing
 * `withLocalDryRunTransaction`). Persists nothing; safe to run repeatedly.
 */
export async function runMameToChaApplyDryRunTransactionFromEnv(
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  options: { now?: Date; piiEnv?: MameToChaPIIEnv } = {},
  deps: DryRunTransactionDeps = {},
): Promise<MameToChaDryRunResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local fixture dry-run transaction.');
  }
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const dbTarget = assertLocalUrl(databaseUrl);

  const write = await withLocalDryRunTransaction(
    databaseUrl,
    async (runner) => {
      const loaded = await loadExistingMameToChaFixtureState(runner, fixture, identity, options.now);
      const plan = buildMameToChaFixturePlan(fixture, loaded.state);
      validateMameToChaWritePlanOrThrow(fixture, plan);
      return executeMameToChaFixtureWritePlan(runner, fixture, identity, plan, loaded.ids, {
        now: options.now,
        piiEnv: options.piiEnv,
      });
    },
    deps,
  );

  return { mode: 'dry-run', rolledBack: true, persisted: false, tenantSlug: fixture.tenant.slug, dbTarget, write };
}

export interface MameToChaCommitResult {
  mode: 'commit';
  committed: boolean;
  persisted: boolean;
  noop: boolean;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  changedOperationCount: number;
  auditRowCount: number;
  write: ExecutedMameToChaWriteSummary;
}

/**
 * Read `DATABASE_URL`, guard it LOCAL-only, then run the fixture write path
 * inside a local transaction that COMMITS only when something changed
 * (reusing `withLocalCommitTransaction`); an all-reuse re-run is rolled back
 * as a no-op, exactly like the generic onboarding commit path. This
 * function is fully implemented and unit-tested (fake runner/client) but is
 * NEVER invoked in this task -- the CLI's `apply` subcommand requires an
 * explicit `--confirm-apply` flag plus the local guard, and this task's own
 * restrictions forbid running it.
 */
export async function runMameToChaApplyCommitTransactionFromEnv(
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  options: { now?: Date; piiEnv?: MameToChaPIIEnv } = {},
  deps: CommitTransactionDeps = {},
): Promise<MameToChaCommitResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local fixture commit transaction.');
  }
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const dbTarget = assertLocalUrl(databaseUrl);

  const { value: write, committed } = await withLocalCommitTransaction(
    databaseUrl,
    async (runner): Promise<CommitDecision<ExecutedMameToChaWriteSummary>> => {
      const loaded = await loadExistingMameToChaFixtureState(runner, fixture, identity, options.now);
      const plan = buildMameToChaFixturePlan(fixture, loaded.state);
      validateMameToChaWritePlanOrThrow(fixture, plan);
      const summary = await executeMameToChaFixtureWritePlan(runner, fixture, identity, plan, loaded.ids, {
        now: options.now,
        piiEnv: options.piiEnv,
        auditMode: 'changed-only',
      });
      return { outcome: summary.changedOperationCount > 0 ? 'commit' : 'rollback', value: summary };
    },
    deps,
  );

  return {
    mode: 'commit',
    committed,
    persisted: committed,
    noop: !committed,
    tenantSlug: fixture.tenant.slug,
    dbTarget,
    changedOperationCount: write.changedOperationCount,
    auditRowCount: write.auditRowCount,
    write,
  };
}

// Re-export the transaction-control SQL constants for tests that want to
// assert this file issues no BEGIN/COMMIT/ROLLBACK of its own (they live
// only in onboard-write.ts/onboard-commit.ts, reused above, not duplicated).
export { ONBOARD_TX_SQL, ONBOARD_COMMIT_TX_SQL };
