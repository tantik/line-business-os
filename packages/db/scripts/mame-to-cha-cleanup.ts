/**
 * Mame To Cha fixture CLEANUP implementation (Phase 1N-4C Slice C1
 * completion).
 *
 * SCOPE — this is the ONLY file in this tool allowed to contain fixture
 * DELETE SQL. Every statement is parameterized and scoped to BOTH the
 * resolved tenant id AND the fixture's own natural key (employee id + work
 * date/kind, shift-type code, recipe title, user id) -- never a wildcard
 * "delete everything for this tenant_id" statement, so cleanup can never
 * remove operator-added data this fixture didn't create.
 *
 * By default (matching `docs/operations/client-onboarding-runbook.md`
 * §12.K's existing convention for the generic onboarding tool), cleanup
 * removes only the fixture's ACCEPTANCE DATA, employee binding, role
 * assignments, memberships, shift types, and recipes/categories -- it
 * deliberately leaves the tenant, location, and tenant_modules rows in
 * place as a reusable local fixture. Tearing down the tenant itself is
 * intentionally out of scope for automatic cleanup (a higher-blast-radius
 * action reserved for an explicit, separately approved manual step).
 *
 * **`core.users` mirror rows and the underlying Supabase `auth.users`
 * identities are NEVER deleted by this module, in any mode.** There is no
 * `deleteUserMirror`/`deleteAuthUser` statement anywhere in this file (see
 * `MAME_TO_CHA_CLEANUP_SQL` -- no `core.users`/`auth.users` entry exists).
 * Cleanup always removes memberships and the employee binding FIRST (safe
 * dependency order, both scoped to the fixture's exact tenant + user id),
 * which is sufficient to detach the identity from the `mame-to-cha` fixture
 * -- there is no safe, fixture-owned way to decide whether a `core.users`/
 * `auth.users` row is used by anything else (other tenants, other local
 * fixtures), so leaving both intact is the deliberate, documented default.
 * Removing an Auth user, if ever needed, is a separate, explicit, manual
 * step outside this tool's automatic cleanup scope.
 *
 * Reuses the already-hardened local transaction wrappers
 * (`withLocalDryRunTransaction`/`withLocalCommitTransaction`) rather than
 * re-implementing transaction control.
 */
import { assertLocalDatabaseUrl } from './onboard-tenant.js';
import type { SafeDbTarget } from './onboard-tenant.js';
import type { QueryRunner } from './onboard-db.js';
import { withLocalDryRunTransaction, type DryRunTransactionDeps } from './onboard-write.js';
import { withLocalCommitTransaction, type CommitDecision, type CommitTransactionDeps } from './onboard-commit.js';
import { FIXTURE_TENANT_SLUG, PROTECTED_TENANT_SLUGS } from './mame-to-cha-fixture.js';
import type { FixtureRoleKey, MameToChaFixtureManifest } from './mame-to-cha-fixture.js';
import { loadExistingMameToChaFixtureState, validateMameToChaIdentityOrThrow } from './mame-to-cha-state.js';
import type { MameToChaFixtureIdentity, LoadedMameToChaFixtureState } from './mame-to-cha-state.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';

export const MAME_TO_CHA_CLEANUP_SQL = {
  deleteCorrectionRequest:
    "delete from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'correction' and work_date = $3",
  deleteShiftPreferenceRequest:
    "delete from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'preference' and work_date = $3",
  deleteWorkReport: 'delete from workforce.attendance where tenant_id = $1 and employee_id = $2 and work_date = $3',
  deleteShiftAssignment:
    'delete from workforce.shifts where tenant_id = $1 and employee_id = $2 and starts_at = $3',
  deleteEmployeeBinding: 'delete from workforce.employees where tenant_id = $1 and user_id = $2',
  deleteRoleAssignment:
    'delete from core.role_assignments where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null',
  deleteMembership: 'delete from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  deleteShiftType:
    'delete from workforce.shift_types where tenant_id = $1 and location_id = $2 and code = $3',
  deleteRecipe: 'delete from workforce.recipes where tenant_id = $1 and title_ja = $2',
  deleteRecipeCategoryIfUnused:
    'delete from workforce.recipe_categories where tenant_id = $1 and label_ja = $2 ' +
    'and not exists (select 1 from workforce.recipes where tenant_id = $1 and recipe_category_id = workforce.recipe_categories.id)',
} as const;

export type CleanupEntity =
  | 'correction_request'
  | 'shift_preference_request'
  | 'work_report'
  | 'shift_assignment'
  | 'employee_binding'
  | 'role_assignment'
  | 'membership'
  | 'shift_type'
  | 'recipe'
  | 'recipe_category';

export interface CleanupOperation {
  entity: CleanupEntity;
  key: string;
  /** Whether the row was found to exist (and would be/was removed). */
  present: boolean;
}

/**
 * Pre-cleanup safety gate. Throws BEFORE any delete for any condition that
 * must never proceed: empty/wildcard/wrong/protected tenant slug.
 */
export function validateMameToChaCleanupOrThrow(fixture: MameToChaFixtureManifest): void {
  if (!fixture.tenant.slug || fixture.tenant.slug.trim() === '') {
    throw new Error('Fixture tenant slug must not be empty; refusing to clean up (wildcard delete rejected).');
  }
  if (fixture.tenant.slug !== FIXTURE_TENANT_SLUG) {
    throw new Error(`Fixture tenant slug must be exactly "${FIXTURE_TENANT_SLUG}"; refusing to clean up.`);
  }
  if ((PROTECTED_TENANT_SLUGS as readonly string[]).includes(fixture.tenant.slug)) {
    throw new Error('Fixture tenant slug collides with a protected tenant; refusing to clean up.');
  }
}

/**
 * Build the cleanup plan (pure) from already-loaded state: which rows exist
 * and would be removed, in safe dependency order (acceptance data first,
 * shared/structural fixture rows last). Never includes the tenant, the
 * location, or `core.tenant_modules` -- those are left in place by design
 * (see module doc).
 */
export function buildMameToChaCleanupPlan(
  fixture: MameToChaFixtureManifest,
  loaded: LoadedMameToChaFixtureState,
): CleanupOperation[] {
  validateMameToChaCleanupOrThrow(fixture);
  const ops: CleanupOperation[] = [];
  const acceptance = loaded.state.acceptanceDataPresent ?? {};

  ops.push({
    entity: 'correction_request',
    key: `staff-1:day${fixture.acceptanceData.correctionRequestDayOffset}`,
    present: acceptance.correctionRequest === true,
  });
  ops.push({
    entity: 'shift_preference_request',
    key: `staff-1:day+${fixture.acceptanceData.shiftPreferenceDayOffset}`,
    present: acceptance.shiftPreferenceRequest === true,
  });
  ops.push({
    entity: 'work_report',
    key: `staff-1:day${fixture.acceptanceData.workReportDayOffset}`,
    present: acceptance.workReport === true,
  });
  ops.push({
    entity: 'shift_assignment',
    key: `staff-1:day+${fixture.acceptanceData.shiftAssignmentDayOffset}`,
    present: acceptance.shiftAssignment === true,
  });

  for (const role of fixture.roles) {
    if (role.requiresEmployeeBinding) {
      ops.push({
        entity: 'employee_binding',
        key: role.logicalId,
        present: loaded.state.employeeBindingsByLogicalId?.[role.logicalId] === true,
      });
    }
  }
  for (const role of fixture.roles) {
    ops.push({
      entity: 'role_assignment',
      key: `${role.logicalId}:${role.role}`,
      present: loaded.state.roleAssignmentsByLogicalId?.[role.logicalId] === true,
    });
  }
  for (const role of fixture.roles) {
    ops.push({
      entity: 'membership',
      key: role.logicalId,
      present: loaded.state.membershipsByLogicalId?.[role.logicalId] !== undefined,
    });
  }
  for (const shiftType of fixture.shiftTypes) {
    ops.push({
      entity: 'shift_type',
      key: shiftType.code,
      present: (loaded.state.shiftTypeCodesPresent ?? []).includes(shiftType.code),
    });
  }
  for (const recipe of fixture.recipes) {
    ops.push({
      entity: 'recipe',
      key: recipe.titleJa,
      present: (loaded.state.recipeTitlesPresent ?? []).includes(recipe.titleJa),
    });
  }
  const seenCategories = new Set<string>();
  for (const recipe of fixture.recipes) {
    if (seenCategories.has(recipe.categoryLabelJa)) continue;
    seenCategories.add(recipe.categoryLabelJa);
    ops.push({
      entity: 'recipe_category',
      key: recipe.categoryLabelJa,
      present: (loaded.state.recipeCategoryLabelsPresent ?? []).includes(recipe.categoryLabelJa),
    });
  }

  return ops;
}

export interface ExecutedMameToChaCleanupSummary {
  tenantSlug: string;
  operations: CleanupOperation[];
  removedCount: number;
}

/**
 * Execute the cleanup plan against an injected {@link QueryRunner}. Every
 * delete is scoped to the resolved tenant id AND the fixture's own natural
 * key. A row not present (`present: false`) is skipped -- no delete is
 * issued for it, so re-running cleanup after it already ran is a safe no-op.
 */
export async function executeMameToChaCleanupPlan(
  runner: QueryRunner,
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  loaded: LoadedMameToChaFixtureState,
  now: Date = new Date(),
): Promise<ExecutedMameToChaCleanupSummary> {
  validateMameToChaCleanupOrThrow(fixture);
  validateMameToChaIdentityOrThrow(identity);

  const tenantId = loaded.ids.tenantId;
  if (tenantId === null) {
    // Nothing to clean up: the fixture tenant does not exist.
    return { tenantSlug: fixture.tenant.slug, operations: [], removedCount: 0 };
  }
  const locationId = loaded.ids.locationId;
  const staffEmployeeId = loaded.ids.staffEmployeeId;
  const plan = buildMameToChaCleanupPlan(fixture, loaded);
  let removedCount = 0;

  const primaryShiftType = fixture.shiftTypes[0];

  for (const op of plan) {
    if (!op.present) continue;

    switch (op.entity) {
      case 'correction_request': {
        if (staffEmployeeId === null) break;
        const date = resolveIsoDate(now, fixture.acceptanceData.correctionRequestDayOffset);
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteCorrectionRequest, [tenantId, staffEmployeeId, date]);
        removedCount += 1;
        break;
      }
      case 'shift_preference_request': {
        if (staffEmployeeId === null) break;
        const date = resolveIsoDate(now, fixture.acceptanceData.shiftPreferenceDayOffset);
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteShiftPreferenceRequest, [tenantId, staffEmployeeId, date]);
        removedCount += 1;
        break;
      }
      case 'work_report': {
        if (staffEmployeeId === null) break;
        const date = resolveIsoDate(now, fixture.acceptanceData.workReportDayOffset);
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteWorkReport, [tenantId, staffEmployeeId, date]);
        removedCount += 1;
        break;
      }
      case 'shift_assignment': {
        if (staffEmployeeId === null || primaryShiftType === undefined) break;
        const date = resolveIsoDate(now, fixture.acceptanceData.shiftAssignmentDayOffset);
        const startsAtIso = localDateTimeToUtcIso(date, primaryShiftType.startsAtLocal, fixture.location.timezone);
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteShiftAssignment, [tenantId, staffEmployeeId, startsAtIso]);
        removedCount += 1;
        break;
      }
      case 'employee_binding': {
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteEmployeeBinding, [tenantId, identity.staffUserId]);
        removedCount += 1;
        break;
      }
      case 'role_assignment': {
        const [, roleKey] = op.key.split(':') as [string, FixtureRoleKey];
        const roleId = loaded.ids.roleIdByKey[roleKey];
        const userId = roleKey === 'manager' ? identity.managerUserId : identity.staffUserId;
        if (roleId === undefined) break;
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteRoleAssignment, [tenantId, userId, roleId]);
        removedCount += 1;
        break;
      }
      case 'membership': {
        const role = fixture.roles.find((r) => r.logicalId === op.key);
        const userId = role?.role === 'manager' ? identity.managerUserId : identity.staffUserId;
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteMembership, [tenantId, userId]);
        removedCount += 1;
        break;
      }
      case 'shift_type': {
        if (locationId === null) break;
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteShiftType, [tenantId, locationId, op.key]);
        removedCount += 1;
        break;
      }
      case 'recipe': {
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteRecipe, [tenantId, op.key]);
        removedCount += 1;
        break;
      }
      case 'recipe_category': {
        await runner.query(MAME_TO_CHA_CLEANUP_SQL.deleteRecipeCategoryIfUnused, [tenantId, op.key]);
        removedCount += 1;
        break;
      }
    }
  }

  return { tenantSlug: fixture.tenant.slug, operations: plan, removedCount };
}

export interface MameToChaCleanupDryRunResult {
  mode: 'cleanup-dry-run';
  rolledBack: true;
  removed: false;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  plan: CleanupOperation[];
}

/**
 * Read-only-safe preview: load state, build the plan, execute the deletes
 * inside a transaction that ALWAYS rolls back (reusing
 * `withLocalDryRunTransaction`). Nothing is removed. Safe to run repeatedly.
 */
export async function runMameToChaCleanupDryRunFromEnv(
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  now: Date = new Date(),
  deps: DryRunTransactionDeps = {},
): Promise<MameToChaCleanupDryRunResult> {
  validateMameToChaCleanupOrThrow(fixture);
  validateMameToChaIdentityOrThrow(identity);
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local cleanup dry-run.');
  }
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const dbTarget = assertLocalUrl(databaseUrl);

  const plan = await withLocalDryRunTransaction(
    databaseUrl,
    async (runner) => {
      const loaded = await loadExistingMameToChaFixtureState(runner, fixture, identity, now);
      const summary = await executeMameToChaCleanupPlan(runner, fixture, identity, loaded, now);
      return summary.operations;
    },
    deps,
  );

  return { mode: 'cleanup-dry-run', rolledBack: true, removed: false, tenantSlug: fixture.tenant.slug, dbTarget, plan };
}

export interface MameToChaCleanupCommitResult {
  mode: 'cleanup';
  committed: boolean;
  removed: boolean;
  noop: boolean;
  tenantSlug: string;
  dbTarget: SafeDbTarget;
  removedCount: number;
  operations: CleanupOperation[];
}

/**
 * Execute the cleanup plan for real inside a local transaction that commits
 * ONLY when at least one row was removed (reusing
 * `withLocalCommitTransaction`); a fixture with nothing left to remove is a
 * rolled-back no-op. This function is fully implemented and unit-tested
 * (fake runner/client) but is NEVER invoked in this task -- the CLI's
 * `cleanup` subcommand requires the local guard plus an explicit
 * `--confirm-cleanup` flag, and this task's own restrictions forbid
 * running it.
 */
export async function runMameToChaCleanupCommitFromEnv(
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  now: Date = new Date(),
  deps: CommitTransactionDeps = {},
): Promise<MameToChaCleanupCommitResult> {
  validateMameToChaCleanupOrThrow(fixture);
  validateMameToChaIdentityOrThrow(identity);
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for the local cleanup commit.');
  }
  const assertLocalUrl = deps.assertLocalUrl ?? assertLocalDatabaseUrl;
  const dbTarget = assertLocalUrl(databaseUrl);

  const { value: summary, committed } = await withLocalCommitTransaction(
    databaseUrl,
    async (runner): Promise<CommitDecision<ExecutedMameToChaCleanupSummary>> => {
      const loaded = await loadExistingMameToChaFixtureState(runner, fixture, identity, now);
      const result = await executeMameToChaCleanupPlan(runner, fixture, identity, loaded, now);
      return { outcome: result.removedCount > 0 ? 'commit' : 'rollback', value: result };
    },
    deps,
  );

  return {
    mode: 'cleanup',
    committed,
    removed: committed,
    noop: !committed,
    tenantSlug: fixture.tenant.slug,
    dbTarget,
    removedCount: summary.removedCount,
    operations: summary.operations,
  };
}
