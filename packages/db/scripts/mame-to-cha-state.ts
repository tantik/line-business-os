/**
 * Read-only local state loading for the Mame To Cha fixture (Phase 1N-4C
 * Slice C1 completion).
 *
 * SCOPE — SELECT-only, mirroring `onboard-db.ts`'s existing discipline: this
 * file (and `mame-to-cha-verify.ts`, `mame-to-cha-schema-check.ts`) are the
 * only files in this tool that read business-table rows, and none of them
 * ever write. It is used both standalone (a read-only inspection) and from
 * inside the write transaction in `mame-to-cha-write.ts` (loaded fresh
 * inside `BEGIN`, exactly like `loadExistingOnboardingState`).
 */
import type { QueryRunner } from './onboard-db.js';
import type { FixtureRoleKey, MameToChaFixtureManifest } from './mame-to-cha-fixture.js';
import type { ExistingMameToChaFixtureState } from './mame-to-cha-plan.js';
import { localDateTimeToUtcIso, resolveFixtureAnchorNow, resolveIsoDate } from './mame-to-cha-dates.js';

/** SELECT-only query catalog for the fixture's read-only state. */
export const MAME_TO_CHA_STATE_SQL = {
  tenantBySlug: 'select id, name, kind, created_at from core.tenants where slug = $1',
  locationsByTenant: 'select id, name, is_active from core.locations where tenant_id = $1',
  enabledModules: 'select module from core.tenant_modules where tenant_id = $1 and is_enabled = true',
  roleByKey: 'select id from core.roles where tenant_id is null and key = $1',
  membershipStatus:
    'select status from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  roleAssignmentExists:
    'select exists (select 1 from core.role_assignments where tenant_id = $1 and user_id = $2 and role_id = $3 and location_id is null) as exists',
  employeeByUser:
    'select id, location_id, is_active from workforce.employees where tenant_id = $1 and user_id = $2',
  /**
   * Whether a `core.users` mirror row exists for a given auth user id.
   * Deliberately NOT tenant-scoped: `core.users` mirrors an `auth.users`
   * identity platform-wide, independent of any tenant membership.
   */
  userMirrorExists: 'select exists (select 1 from core.users where id = $1) as exists',
  shiftTypeCodes: 'select code from workforce.shift_types where tenant_id = $1 and location_id = $2',
  recipeCategoryLabels: 'select label_ja from workforce.recipe_categories where tenant_id = $1',
  recipeTitles: 'select title_ja from workforce.recipes where tenant_id = $1',
  shiftAssignmentExists:
    'select exists (select 1 from workforce.shifts where tenant_id = $1 and employee_id = $2 and starts_at = $3) as exists',
  shiftPreferenceExists:
    "select exists (select 1 from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'preference' and work_date = $3) as exists",
  workReportExists:
    'select exists (select 1 from workforce.attendance where tenant_id = $1 and employee_id = $2 and work_date = $3) as exists',
  correctionRequestExists:
    "select exists (select 1 from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'correction' and work_date = $3) as exists",
} as const;

interface IdRow {
  id: string;
}
interface TenantRow {
  id: string;
  name: string;
  kind: string;
  created_at?: Date | string;
}
interface LocationRow {
  id: string;
  name: string;
  is_active: boolean;
}
interface ModuleRow {
  module: string;
}
interface StatusRow {
  status: string;
}
interface ExistsRow {
  exists: boolean;
}
interface EmployeeRow {
  id: string;
  location_id: string | null;
  is_active: boolean;
}
interface CodeRow {
  code: string;
}
interface LabelRow {
  label_ja: string;
}
interface TitleRow {
  title_ja: string;
}

/** IDs resolved from the live database, needed by the write/verify paths. */
export interface ResolvedMameToChaFixtureIds {
  tenantId: string | null;
  /** The single active location matching the fixture's location name, if any. */
  locationId: string | null;
  roleIdByKey: Partial<Record<FixtureRoleKey, string>>;
  /** The staff fixture's bound employee row id, if a binding already exists. */
  staffEmployeeId: string | null;
}

export interface MameToChaFixtureIdentity {
  managerUserId: string;
  staffUserId: string;
}

/**
 * Reject an identity where the manager and staff auth user ids are
 * identical, BEFORE any query is issued. The fixture requires two distinct
 * identities (one manager membership/role assignment, one staff employee
 * binding); a single shared user id would silently conflate the two,
 * corrupting the plan's per-logical-id bookkeeping (membership/role-
 * assignment/employee-binding state for "manager-1" and "staff-1" would
 * both resolve to the same underlying row).
 */
export function validateMameToChaIdentityOrThrow(identity: MameToChaFixtureIdentity): void {
  if (identity.managerUserId === identity.staffUserId) {
    throw new Error(
      'Manager and staff auth user ids must be distinct; refusing to proceed with a single shared identity.',
    );
  }
}

export interface LoadedMameToChaFixtureState {
  ids: ResolvedMameToChaFixtureIds;
  state: ExistingMameToChaFixtureState;
  /** Stable date anchor for acceptance rows; tenant creation time once present. */
  anchorNow: Date;
}

/**
 * Load the fixture's current state from the database via an injected
 * {@link QueryRunner} (fully unit-testable with a fake runner; no real
 * connection in tests). SELECT-only -- never writes. Deterministic acceptance-
 * data matching reuses the exact same date/timezone resolution the write path
 * uses (`mame-to-cha-dates.ts`), so "does this row already exist" and "what
 * would this row's key be" never drift apart.
 */
export async function loadExistingMameToChaFixtureState(
  runner: QueryRunner,
  fixture: MameToChaFixtureManifest,
  identity: MameToChaFixtureIdentity,
  now: Date = new Date(),
): Promise<LoadedMameToChaFixtureState> {
  validateMameToChaIdentityOrThrow(identity);

  const tenantResult = await runner.query<TenantRow>(MAME_TO_CHA_STATE_SQL.tenantBySlug, [
    fixture.tenant.slug,
  ]);
  const tenantRow = tenantResult.rows[0];
  const tenantId = tenantRow?.id ?? null;
  const anchorNow = resolveFixtureAnchorNow(tenantRow?.created_at, now);

  let locationId: string | null = null;
  const enabledModules: string[] = [];
  const userMirrorsByLogicalId: ExistingMameToChaFixtureState['userMirrorsByLogicalId'] = {};
  const membershipsByLogicalId: ExistingMameToChaFixtureState['membershipsByLogicalId'] = {};
  const roleAssignmentsByLogicalId: ExistingMameToChaFixtureState['roleAssignmentsByLogicalId'] = {};
  const employeeBindingsByLogicalId: ExistingMameToChaFixtureState['employeeBindingsByLogicalId'] = {};
  const roleIdByKey: Partial<Record<FixtureRoleKey, string>> = {};
  let staffEmployeeId: string | null = null;
  let shiftTypeCodesPresent: string[] = [];
  let recipeCategoryLabelsPresent: string[] = [];
  let recipeTitlesPresent: string[] = [];
  const acceptanceDataPresent: NonNullable<ExistingMameToChaFixtureState['acceptanceDataPresent']> = {};

  const userIdByLogicalId: Record<string, string> = {};
  for (const role of fixture.roles) {
    userIdByLogicalId[role.logicalId] = role.role === 'manager' ? identity.managerUserId : identity.staffUserId;
  }

  // Role ids (platform-level; independent of the tenant existing yet).
  for (const role of fixture.roles) {
    if (roleIdByKey[role.role] !== undefined) continue;
    const roleResult = await runner.query<IdRow>(MAME_TO_CHA_STATE_SQL.roleByKey, [role.role]);
    const roleId = roleResult.rows[0]?.id;
    if (roleId !== undefined) roleIdByKey[role.role] = roleId;
  }

  // core.users mirrors (platform-level; independent of the tenant existing
  // yet -- a mirror row is not tenant-scoped). Required BEFORE membership/
  // employee_binding can be planned as "create", since both FK to
  // core.users(id) and there is no auto-mirror trigger from auth.users.
  for (const role of fixture.roles) {
    const userId = userIdByLogicalId[role.logicalId];
    const mirrorResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.userMirrorExists, [userId]);
    userMirrorsByLogicalId[role.logicalId] = mirrorResult.rows[0]?.exists === true;
  }

  if (tenantId !== null) {
    const locationsResult = await runner.query<LocationRow>(MAME_TO_CHA_STATE_SQL.locationsByTenant, [
      tenantId,
    ]);
    const activeMatch = locationsResult.rows.find(
      (row) => row.is_active && row.name.trim().toLowerCase() === fixture.location.name.trim().toLowerCase(),
    );
    locationId = activeMatch?.id ?? null;

    const modulesResult = await runner.query<ModuleRow>(MAME_TO_CHA_STATE_SQL.enabledModules, [
      tenantId,
    ]);
    enabledModules.push(...modulesResult.rows.map((r) => r.module));

    for (const role of fixture.roles) {
      const userId = userIdByLogicalId[role.logicalId];
      const membershipResult = await runner.query<StatusRow>(MAME_TO_CHA_STATE_SQL.membershipStatus, [
        tenantId,
        userId,
      ]);
      const status = membershipResult.rows[0]?.status;
      if (status !== undefined) {
        membershipsByLogicalId[role.logicalId] = status as 'active' | 'invited' | 'suspended' | 'revoked';
      }

      const roleId = roleIdByKey[role.role];
      if (roleId !== undefined) {
        const raResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.roleAssignmentExists, [
          tenantId,
          userId,
          roleId,
        ]);
        roleAssignmentsByLogicalId[role.logicalId] = raResult.rows[0]?.exists === true;
      }

      if (role.requiresEmployeeBinding) {
        const empResult = await runner.query<EmployeeRow>(MAME_TO_CHA_STATE_SQL.employeeByUser, [
          tenantId,
          userId,
        ]);
        const empRow = empResult.rows[0];
        employeeBindingsByLogicalId[role.logicalId] = empRow !== undefined;
        if (empRow !== undefined) staffEmployeeId = empRow.id;
      }
    }

    if (locationId !== null) {
      const shiftTypesResult = await runner.query<CodeRow>(MAME_TO_CHA_STATE_SQL.shiftTypeCodes, [
        tenantId,
        locationId,
      ]);
      shiftTypeCodesPresent = shiftTypesResult.rows.map((r) => r.code);
    }

    const categoriesResult = await runner.query<LabelRow>(MAME_TO_CHA_STATE_SQL.recipeCategoryLabels, [
      tenantId,
    ]);
    recipeCategoryLabelsPresent = categoriesResult.rows.map((r) => r.label_ja);

    const recipesResult = await runner.query<TitleRow>(MAME_TO_CHA_STATE_SQL.recipeTitles, [tenantId]);
    recipeTitlesPresent = recipesResult.rows.map((r) => r.title_ja);

    if (staffEmployeeId !== null) {
      const shiftDate = resolveIsoDate(anchorNow, fixture.acceptanceData.shiftAssignmentDayOffset);
      const shiftType = fixture.shiftTypes[0];
      if (shiftType !== undefined) {
        const startsAtIso = localDateTimeToUtcIso(shiftDate, shiftType.startsAtLocal, fixture.location.timezone);
        const shiftResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.shiftAssignmentExists, [
          tenantId,
          staffEmployeeId,
          startsAtIso,
        ]);
        acceptanceDataPresent.shiftAssignment = shiftResult.rows[0]?.exists === true;
      }

      const preferenceDate = resolveIsoDate(anchorNow, fixture.acceptanceData.shiftPreferenceDayOffset);
      const preferenceResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.shiftPreferenceExists, [
        tenantId,
        staffEmployeeId,
        preferenceDate,
      ]);
      acceptanceDataPresent.shiftPreferenceRequest = preferenceResult.rows[0]?.exists === true;

      const workReportDate = resolveIsoDate(anchorNow, fixture.acceptanceData.workReportDayOffset);
      const workReportResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.workReportExists, [
        tenantId,
        staffEmployeeId,
        workReportDate,
      ]);
      acceptanceDataPresent.workReport = workReportResult.rows[0]?.exists === true;

      const correctionDate = resolveIsoDate(anchorNow, fixture.acceptanceData.correctionRequestDayOffset);
      const correctionResult = await runner.query<ExistsRow>(MAME_TO_CHA_STATE_SQL.correctionRequestExists, [
        tenantId,
        staffEmployeeId,
        correctionDate,
      ]);
      acceptanceDataPresent.correctionRequest = correctionResult.rows[0]?.exists === true;
    }
  }

  return {
    anchorNow,
    ids: {
      tenantId,
      locationId,
      roleIdByKey,
      staffEmployeeId,
    },
    state: {
      tenantExists: tenantId !== null,
      userMirrorsByLogicalId,
      locationExists: locationId !== null,
      enabledModules,
      membershipsByLogicalId,
      roleAssignmentsByLogicalId,
      employeeBindingsByLogicalId,
      shiftTypeCodesPresent,
      recipeCategoryLabelsPresent,
      recipeTitlesPresent,
      acceptanceDataPresent,
    },
  };
}
