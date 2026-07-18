/**
 * Read-only verification for the Mame To Cha fixture (Phase 1N-4C Slice C1
 * completion).
 *
 * SCOPE — SELECT-only, mirroring `mame-to-cha-state.ts`/`onboard-db.ts`'s
 * discipline: this file never writes. It runs a fixed, deterministic
 * checklist against an injected {@link QueryRunner} (fully unit-testable
 * with a fake runner) and returns a redacted pass/fail report -- no
 * password, token, service-role value, or raw UUID ever appears in a check
 * message (only booleans, counts, and fixture-owned labels).
 *
 * This module deliberately checks against the exact `mame-to-cha` tenant
 * slug only; it never issues a query for `mame-to-cha-tokyo` or any other
 * tenant (verified by `mame-to-cha-verify.test.ts`'s "never queries the
 * protected tenant" assertion over this file's own SQL catalog).
 */
import type { QueryRunner } from './onboard-db.js';
import { assertLocalDatabaseUrl } from './onboard-tenant.js';
import { FIXTURE_TENANT_SLUG, PROTECTED_TENANT_SLUGS } from './mame-to-cha-fixture.js';
import type { MameToChaFixtureManifest } from './mame-to-cha-fixture.js';
import type { MameToChaFixtureIdentity } from './mame-to-cha-state.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';

/** The exact permission keys every B2a manager wrapper requires (B2 writes plan Section 3.1a). */
export const REQUIRED_MANAGER_PERMISSIONS = [
  'workforce.staff.manage',
  'workforce.shift.write',
  'workforce.request.manage',
] as const;

export const MAME_TO_CHA_VERIFY_SQL = {
  tenantCount: 'select count(*)::int as count, id, kind from core.tenants where slug = $1 group by id, kind',
  /** core.users is not tenant-scoped: a mirror row's existence is checked by id alone. */
  userMirrorCount: 'select count(*)::int as count from core.users where id = $1',
  activeLocationCount:
    'select count(*)::int as count from core.locations where tenant_id = $1 and is_active = true',
  workforceModuleEnabled:
    "select is_enabled from core.tenant_modules where tenant_id = $1 and module = 'workforce'",
  membershipStatus: 'select status from core.tenant_memberships where tenant_id = $1 and user_id = $2',
  roleAssignmentRoleId:
    'select role_id from core.role_assignments where tenant_id = $1 and user_id = $2 and location_id is null',
  rolePermissions: 'select permission_key from core.role_permissions where role_id = $1',
  employeeRowsForUser:
    'select id, location_id, is_active from workforce.employees where tenant_id = $1 and user_id = $2',
  shiftTypeByCode:
    'select id, is_active, location_id from workforce.shift_types where tenant_id = $1 and location_id = $2 and code = $3',
  recipeCountByTitle: 'select count(*)::int as count from workforce.recipes where tenant_id = $1 and title_ja = $2',
  shiftAssignmentExists:
    'select 1 as exists from workforce.shifts where tenant_id = $1 and employee_id = $2 and starts_at = $3',
  shiftPreferenceExists:
    "select 1 as exists from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'preference' and work_date = $3",
  workReportExists:
    'select 1 as exists from workforce.attendance where tenant_id = $1 and employee_id = $2 and work_date = $3',
  correctionRequestExists:
    "select 1 as exists from workforce.shift_requests where tenant_id = $1 and employee_id = $2 and kind = 'correction' and work_date = $3",
} as const;

export type VerifyCheckStatus = 'pass' | 'fail' | 'not_checked';

export interface VerifyCheck {
  id: string;
  status: VerifyCheckStatus;
  message: string;
}

export interface MameToChaVerifyReport {
  ok: boolean;
  tenantSlug: string;
  checks: VerifyCheck[];
  failures: string[];
}

interface TenantCountRow {
  count: number;
  id: string;
  kind: string;
}
interface CountRow {
  count: number;
}
interface ModuleRow {
  is_enabled: boolean;
}
interface StatusRow {
  status: string;
}
interface RoleIdRow {
  role_id: string;
}
interface PermissionRow {
  permission_key: string;
}
interface EmployeeRow {
  id: string;
  location_id: string | null;
  is_active: boolean;
}
interface ShiftTypeRow {
  id: string;
  is_active: boolean;
  location_id: string;
}
interface ExistsRow {
  exists: boolean;
}

function pass(id: string, message: string): VerifyCheck {
  return { id, status: 'pass', message };
}
function fail(id: string, message: string): VerifyCheck {
  return { id, status: 'fail', message };
}
function notChecked(id: string, message: string): VerifyCheck {
  return { id, status: 'not_checked', message };
}

/**
 * Run the full read-only verification checklist against an injected
 * {@link QueryRunner}. Manager/staff identity is OPTIONAL: when omitted, the
 * identity-scoped checks (membership, permissions, employee binding) are
 * reported `not_checked` rather than failing the whole report, so a
 * structural (tenant/location/module/shift-type/recipe) verification can
 * still run without knowing the two Auth user ids yet.
 */
export async function runMameToChaVerifyChecks(
  runner: QueryRunner,
  fixture: MameToChaFixtureManifest,
  identity: Partial<MameToChaFixtureIdentity> = {},
  now: Date = new Date(),
): Promise<MameToChaVerifyReport> {
  const checks: VerifyCheck[] = [];

  // Defense-in-depth: refuse to verify anything but the exact acceptance slug.
  if (fixture.tenant.slug !== FIXTURE_TENANT_SLUG || (PROTECTED_TENANT_SLUGS as readonly string[]).includes(fixture.tenant.slug)) {
    return {
      ok: false,
      tenantSlug: fixture.tenant.slug,
      checks: [fail('tenant.slug', 'Fixture tenant slug is not the exact, non-protected acceptance slug; refusing to verify.')],
      failures: ['invalid or protected tenant slug'],
    };
  }

  // Defense-in-depth: the fixture requires two distinct identities. A shared
  // manager/staff id would make every identity-scoped check below ambiguous
  // (checking the same underlying row under two different logical ids).
  if (
    identity.managerUserId !== undefined &&
    identity.staffUserId !== undefined &&
    identity.managerUserId === identity.staffUserId
  ) {
    return {
      ok: false,
      tenantSlug: fixture.tenant.slug,
      checks: [fail('identity.distinct', 'Manager and staff auth user ids must be distinct.')],
      failures: ['manager and staff auth user ids must be distinct'],
    };
  }

  const tenantRows = await runner.query<TenantCountRow>(MAME_TO_CHA_VERIFY_SQL.tenantCount, [fixture.tenant.slug]);
  const tenantRow = tenantRows.rows[0];
  const tenantCount = tenantRows.rows.reduce((sum, r) => sum + r.count, 0);
  if (tenantCount === 1 && tenantRow !== undefined) {
    checks.push(pass('tenant.exists-exactly-once', 'Exactly one tenant row exists for the fixture slug.'));
    checks.push(
      tenantRow.kind === fixture.tenant.kind
        ? pass('tenant.kind', `Tenant kind is "${fixture.tenant.kind}".`)
        : fail('tenant.kind', `Tenant kind is not "${fixture.tenant.kind}".`),
    );
  } else {
    checks.push(fail('tenant.exists-exactly-once', `Expected exactly one tenant row, found ${tenantCount}.`));
    return { ok: false, tenantSlug: fixture.tenant.slug, checks, failures: checks.filter((c) => c.status === 'fail').map((c) => c.message) };
  }
  const tenantId = tenantRow.id;

  const activeLocationRows = await runner.query<CountRow>(MAME_TO_CHA_VERIFY_SQL.activeLocationCount, [tenantId]);
  const activeLocationCount = activeLocationRows.rows[0]?.count ?? 0;
  checks.push(
    activeLocationCount === 1
      ? pass('location.exactly-one-active', 'Exactly one active location exists.')
      : fail('location.exactly-one-active', `Expected exactly one active location, found ${activeLocationCount}.`),
  );

  const moduleRows = await runner.query<ModuleRow>(MAME_TO_CHA_VERIFY_SQL.workforceModuleEnabled, [tenantId]);
  const workforceEnabled = moduleRows.rows[0]?.is_enabled === true;
  checks.push(
    workforceEnabled
      ? pass('module.workforce-enabled', 'Workforce module is enabled.')
      : fail('module.workforce-enabled', 'Workforce module is not enabled.'),
  );

  const roleIdByRole = new Map<string, string>();
  for (const role of fixture.roles) {
    const userId = role.role === 'manager' ? identity.managerUserId : identity.staffUserId;
    if (userId === undefined) {
      checks.push(notChecked(`user_mirror.${role.logicalId}`, `No auth user id supplied for "${role.logicalId}"; skipped.`));
      checks.push(notChecked(`membership.${role.logicalId}`, `No auth user id supplied for "${role.logicalId}"; skipped.`));
      continue;
    }

    // core.users mirror: required before membership/employee_binding can
    // exist at all (both FK to core.users(id)); check it explicitly so a
    // missing mirror is reported by name, not just as a downstream FK/read
    // failure.
    const mirrorRows = await runner.query<CountRow>(MAME_TO_CHA_VERIFY_SQL.userMirrorCount, [userId]);
    const mirrorCount = mirrorRows.rows[0]?.count ?? 0;
    checks.push(
      mirrorCount === 1
        ? pass(`user_mirror.${role.logicalId}`, `core.users mirror exists exactly once for "${role.logicalId}".`)
        : fail(`user_mirror.${role.logicalId}`, `Expected exactly one core.users mirror row for "${role.logicalId}", found ${mirrorCount}.`),
    );

    const membershipRows = await runner.query<StatusRow>(MAME_TO_CHA_VERIFY_SQL.membershipStatus, [tenantId, userId]);
    const status = membershipRows.rows[0]?.status;
    checks.push(
      status === 'active'
        ? pass(`membership.${role.logicalId}`, `Membership for "${role.logicalId}" is active.`)
        : fail(`membership.${role.logicalId}`, `Membership for "${role.logicalId}" is not active (status: ${status ?? 'missing'}).`),
    );

    const roleAssignmentRows = await runner.query<RoleIdRow>(MAME_TO_CHA_VERIFY_SQL.roleAssignmentRoleId, [tenantId, userId]);
    const roleId = roleAssignmentRows.rows[0]?.role_id;
    if (roleId !== undefined) roleIdByRole.set(role.role, roleId);
    checks.push(
      roleId !== undefined
        ? pass(`role_assignment.${role.logicalId}`, `Role assignment exists for "${role.logicalId}".`)
        : fail(`role_assignment.${role.logicalId}`, `No role assignment found for "${role.logicalId}".`),
    );
  }

  // Manager permission coverage (all seven B2a wrappers rely on exactly these three keys).
  const managerRoleId = roleIdByRole.get('manager');
  if (managerRoleId === undefined) {
    checks.push(notChecked('permission.manager', 'Manager role assignment not resolved; permission check skipped.'));
  } else {
    const permissionRows = await runner.query<PermissionRow>(MAME_TO_CHA_VERIFY_SQL.rolePermissions, [managerRoleId]);
    const granted = new Set(permissionRows.rows.map((r) => r.permission_key));
    for (const permission of REQUIRED_MANAGER_PERMISSIONS) {
      checks.push(
        granted.has(permission)
          ? pass(`permission.manager.${permission}`, `Manager role holds "${permission}".`)
          : fail(`permission.manager.${permission}`, `Manager role is missing "${permission}".`),
      );
    }
  }

  // Staff employee binding.
  let staffEmployeeId: string | null = null;
  if (identity.staffUserId === undefined) {
    checks.push(notChecked('employee_binding.staff-1', 'No staff auth user id supplied; skipped.'));
  } else {
    const employeeRows = await runner.query<EmployeeRow>(MAME_TO_CHA_VERIFY_SQL.employeeRowsForUser, [
      tenantId,
      identity.staffUserId,
    ]);
    if (employeeRows.rows.length === 0) {
      checks.push(fail('employee_binding.staff-1', 'No employee row bound to the staff auth user.'));
    } else if (employeeRows.rows.length > 1) {
      checks.push(fail('employee_binding.staff-1', `Expected exactly one employee row, found ${employeeRows.rows.length} (duplicate).`));
    } else {
      const employee = employeeRows.rows[0]!;
      staffEmployeeId = employee.id;
      const locationOk = employee.location_id !== null && employee.is_active;
      checks.push(
        locationOk
          ? pass('employee_binding.staff-1', 'Staff employee binding is active and location-scoped.')
          : fail('employee_binding.staff-1', 'Staff employee binding is inactive or has no location.'),
      );
    }
  }

  // Shift types: active and scoped to the resolved location (uses the single
  // active location found above only when unambiguous).
  const resolvedLocationId =
    activeLocationCount === 1 ? (await runner.query<{ id: string }>(
      'select id from core.locations where tenant_id = $1 and is_active = true',
      [tenantId],
    )).rows[0]?.id : undefined;

  for (const shiftType of fixture.shiftTypes) {
    if (resolvedLocationId === undefined) {
      checks.push(notChecked(`shift_type.${shiftType.code}`, 'Location is ambiguous; shift-type check skipped.'));
      continue;
    }
    const shiftTypeRows = await runner.query<ShiftTypeRow>(MAME_TO_CHA_VERIFY_SQL.shiftTypeByCode, [
      tenantId,
      resolvedLocationId,
      shiftType.code,
    ]);
    const row = shiftTypeRows.rows[0];
    checks.push(
      row !== undefined && row.is_active
        ? pass(`shift_type.${shiftType.code}`, `Shift type "${shiftType.code}" exists and is active.`)
        : fail(`shift_type.${shiftType.code}`, `Shift type "${shiftType.code}" is missing or inactive.`),
    );
  }

  // Recipes: exists, no duplicates.
  for (const recipe of fixture.recipes) {
    const recipeCountRows = await runner.query<CountRow>(MAME_TO_CHA_VERIFY_SQL.recipeCountByTitle, [
      tenantId,
      recipe.titleJa,
    ]);
    const count = recipeCountRows.rows[0]?.count ?? 0;
    checks.push(
      count === 1
        ? pass(`recipe.${recipe.titleJa}`, 'Recipe exists exactly once.')
        : fail(`recipe.${recipe.titleJa}`, `Expected exactly one recipe row, found ${count}.`),
    );
  }

  // Acceptance data (requires the resolved staff employee id).
  if (staffEmployeeId === null) {
    checks.push(notChecked('acceptance_data', 'Staff employee binding not resolved; acceptance-data checks skipped.'));
  } else {
    const primaryShiftType = fixture.shiftTypes[0];
    if (primaryShiftType !== undefined) {
      const shiftDate = resolveIsoDate(now, fixture.acceptanceData.shiftAssignmentDayOffset);
      const startsAtIso = localDateTimeToUtcIso(shiftDate, primaryShiftType.startsAtLocal, fixture.location.timezone);
      const shiftRows = await runner.query<ExistsRow>(MAME_TO_CHA_VERIFY_SQL.shiftAssignmentExists, [
        tenantId,
        staffEmployeeId,
        startsAtIso,
      ]);
      checks.push(
        shiftRows.rows[0]?.exists === true
          ? pass('acceptance_data.shift_assignment', 'Acceptance shift assignment exists.')
          : fail('acceptance_data.shift_assignment', 'Acceptance shift assignment is missing.'),
      );

      const preferenceDate = resolveIsoDate(now, fixture.acceptanceData.shiftPreferenceDayOffset);
      const preferenceRows = await runner.query<ExistsRow>(MAME_TO_CHA_VERIFY_SQL.shiftPreferenceExists, [
        tenantId,
        staffEmployeeId,
        preferenceDate,
      ]);
      checks.push(
        preferenceRows.rows[0]?.exists === true
          ? pass('acceptance_data.shift_preference', 'Acceptance shift preference request exists.')
          : fail('acceptance_data.shift_preference', 'Acceptance shift preference request is missing.'),
      );

      const workReportDate = resolveIsoDate(now, fixture.acceptanceData.workReportDayOffset);
      const workReportRows = await runner.query<ExistsRow>(MAME_TO_CHA_VERIFY_SQL.workReportExists, [
        tenantId,
        staffEmployeeId,
        workReportDate,
      ]);
      checks.push(
        workReportRows.rows[0]?.exists === true
          ? pass('acceptance_data.work_report', 'Acceptance work report exists.')
          : fail('acceptance_data.work_report', 'Acceptance work report is missing.'),
      );

      const correctionDate = resolveIsoDate(now, fixture.acceptanceData.correctionRequestDayOffset);
      const correctionRows = await runner.query<ExistsRow>(MAME_TO_CHA_VERIFY_SQL.correctionRequestExists, [
        tenantId,
        staffEmployeeId,
        correctionDate,
      ]);
      checks.push(
        correctionRows.rows[0]?.exists === true
          ? pass('acceptance_data.correction_request', 'Acceptance correction request exists.')
          : fail('acceptance_data.correction_request', 'Acceptance correction request is missing.'),
      );
    }
  }

  const failures = checks.filter((c) => c.status === 'fail').map((c) => c.message);
  return { ok: failures.length === 0, tenantSlug: fixture.tenant.slug, checks, failures };
}

/**
 * Open ONE local, read-only `pg.Client` (guarded by `assertLocalDatabaseUrl`
 * before connecting), run the verification checklist, and always close the
 * connection. Never used against Cloud; never issues a write. NOT invoked in
 * this task -- see `docs/phase-1n-4c-local-onboarding-rehearsal.md`.
 */
export async function runLocalMameToChaVerify(
  databaseUrl: string,
  fixture: MameToChaFixtureManifest,
  identity: Partial<MameToChaFixtureIdentity> = {},
  now: Date = new Date(),
): Promise<MameToChaVerifyReport> {
  assertLocalDatabaseUrl(databaseUrl);
  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("set statement_timeout = '10s'");
    await client.query('set default_transaction_read_only = on');
    return await runMameToChaVerifyChecks(client, fixture, identity, now);
  } finally {
    await client.end().catch(() => undefined);
  }
}
