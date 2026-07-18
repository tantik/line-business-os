/**
 * Mame To Cha acceptance-tenant fixture manifest (Phase 1N-4C Slice C1).
 *
 * SCOPE — this module is PURE and carries NO secrets. It is the single,
 * tracked, non-secret source of truth for the deterministic local rehearsal
 * fixture: the acceptance tenant's slug/location/module/role/shift-type
 * shape. It never contains a password, token, service-role value, real
 * email, or real UUID -- role identities reference environment-variable
 * NAMES only (see {@link MameToChaFixtureRole.envEmailVar}), never values.
 *
 * This is the typed-fixture-definition option from the C1 task brief
 * (Section 6: "a tracked manifest or typed fixture definition"). A YAML
 * manifest under docs/onboarding/ was the option sketched by the Slice A
 * architecture plan, but this repository has no YAML parsing dependency
 * today (confirmed: no `yaml`/`js-yaml` in any package.json), and adding one
 * for a single non-secret fixture is unwarranted complexity. This typed
 * module is the tracked, reviewable, version-controlled manifest instead;
 * `docs/phase-1n-4c-local-onboarding-rehearsal.md` documents it in prose for
 * human reviewers.
 */

/** Bump when the fixture shape changes in a way tooling must react to. */
export const FIXTURE_MANIFEST_VERSION = 1 as const;

/** The exact, deterministic acceptance tenant slug (never a variant). */
export const FIXTURE_TENANT_SLUG = 'mame-to-cha' as const;

/**
 * Slugs this tool must never match, update, or delete -- re-exported from the
 * existing, already-hardened `db:onboard-tenant` reserved list
 * (`packages/db/scripts/onboard-tenant.ts`) so both tools share one list and
 * can never silently diverge. `mame-to-cha-tokyo` (the seeded sales-demo
 * tenant) is already a member of this list.
 */
export { RESERVED_TENANT_SLUGS as PROTECTED_TENANT_SLUGS } from './onboard-tenant.js';

/** `core.roles.key` values seeded by `supabase/migrations/0008_rbac_seed.sql`. */
export const FIXTURE_ROLE_KEYS = ['manager', 'employee'] as const;
export type FixtureRoleKey = (typeof FIXTURE_ROLE_KEYS)[number];

export interface MameToChaFixtureLocation {
  logicalId: string;
  name: string;
  timezone: string;
}

export interface MameToChaFixtureRole {
  logicalId: string;
  role: FixtureRoleKey;
  /** Name (never value) of the local-only env var carrying this identity's email. */
  envEmailVar: string;
  /** Name (never value) of the local-only env var carrying this identity's password. */
  envPasswordVar: string;
  requiresEmployeeBinding: boolean;
  /** Only meaningful when `requiresEmployeeBinding` is true. */
  employeeCode?: string;
  displayOrder?: number;
  /**
   * Synthetic, non-real display name for the employee row's PII column
   * (`workforce.employees.name_encrypted`). Never a real client name --
   * written through the same encryption path production data would use
   * (Architecture plan Section K), just with fixture-owned content.
   */
  employeeDisplayName?: string;
  employeePositionLabel?: string;
  employeeEmploymentType?: string;
}

export interface MameToChaFixtureShiftType {
  code: string;
  labelJa: string;
  labelEn?: string;
  startsAtLocal: string;
  endsAtLocal: string;
  breakMinutes: number;
  sortOrder: number;
}

export interface MameToChaFixtureRecipe {
  categoryLabelJa: string;
  titleJa: string;
}

/**
 * Minimal schedule/attendance/request fixture markers required for the
 * authenticated manager/staff mutation smoke (Section 7 of the task brief).
 * These are logical, relative-day markers only -- no absolute dates, no
 * UUIDs, nothing secret.
 */
export interface MameToChaFixtureAcceptanceData {
  /** A published shift assignment for the staff fixture, offset from "today". */
  shiftAssignmentDayOffset: number;
  /** A pending shift-preference request for the staff fixture. */
  shiftPreferenceDayOffset: number;
  /** A single attendance/work-report row for the staff fixture. */
  workReportDayOffset: number;
  /** A pending correction request referencing the work-report row above. */
  correctionRequestDayOffset: number;
}

export interface MameToChaFixtureManifest {
  manifestVersion: typeof FIXTURE_MANIFEST_VERSION;
  ownershipMarker: string;
  tenant: {
    slug: typeof FIXTURE_TENANT_SLUG;
    displayName: string;
    kind: 'client';
  };
  location: MameToChaFixtureLocation;
  /** Modules to enable via `core.tenant_modules`. `core` is always force-included. */
  modules: readonly ['workforce'];
  roles: readonly [MameToChaFixtureRole, MameToChaFixtureRole];
  shiftTypes: readonly MameToChaFixtureShiftType[];
  recipes: readonly MameToChaFixtureRecipe[];
  acceptanceData: MameToChaFixtureAcceptanceData;
}

/**
 * The tracked, non-secret fixture manifest for the `mame-to-cha` acceptance
 * tenant. Every field here is safe to commit: no email, no password, no
 * token, no service-role value, no real UUID -- only slugs, labels, codes,
 * env-var NAMES, and relative day offsets.
 */
export const MAME_TO_CHA_FIXTURE: MameToChaFixtureManifest = {
  manifestVersion: FIXTURE_MANIFEST_VERSION,
  ownershipMarker: 'phase-1n-4c-mame-to-cha-acceptance',
  tenant: {
    slug: FIXTURE_TENANT_SLUG,
    displayName: 'Mame To Cha',
    kind: 'client',
  },
  location: {
    logicalId: 'main-cafe',
    name: 'Mame To Cha — Main',
    timezone: 'Asia/Tokyo',
  },
  modules: ['workforce'],
  roles: [
    {
      logicalId: 'manager-1',
      role: 'manager',
      envEmailVar: 'MAME_TO_CHA_LOCAL_MANAGER_EMAIL',
      envPasswordVar: 'MAME_TO_CHA_LOCAL_MANAGER_PASSWORD',
      requiresEmployeeBinding: false,
    },
    {
      logicalId: 'staff-1',
      role: 'employee',
      envEmailVar: 'MAME_TO_CHA_LOCAL_STAFF_EMAIL',
      envPasswordVar: 'MAME_TO_CHA_LOCAL_STAFF_PASSWORD',
      requiresEmployeeBinding: true,
      employeeCode: 'staff-1',
      displayOrder: 1,
      employeeDisplayName: 'Acceptance Staff One',
      employeePositionLabel: 'ホールスタッフ',
      employeeEmploymentType: 'part_time',
    },
  ],
  shiftTypes: [
    { code: 'AM', labelJa: '午前', startsAtLocal: '09:00', endsAtLocal: '13:00', breakMinutes: 0, sortOrder: 1 },
    { code: 'PM', labelJa: '午後', startsAtLocal: '13:00', endsAtLocal: '18:00', breakMinutes: 0, sortOrder: 2 },
  ],
  recipes: [{ categoryLabelJa: 'ドリンク', titleJa: 'ハンドドリップ手順' }],
  acceptanceData: {
    shiftAssignmentDayOffset: 1,
    shiftPreferenceDayOffset: 2,
    workReportDayOffset: -1,
    correctionRequestDayOffset: -1,
  },
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Validate the fixture manifest's own internal invariants. This runs against
 * the constant {@link MAME_TO_CHA_FIXTURE} above (there is no untrusted input
 * here -- the manifest is not operator-supplied) so tooling never silently
 * drifts from the documented contract. PURE: no I/O.
 */
export function validateMameToChaFixtureManifest(
  manifest: MameToChaFixtureManifest,
): ValidationResult<MameToChaFixtureManifest> {
  const errors: string[] = [];

  if (manifest.manifestVersion !== FIXTURE_MANIFEST_VERSION) {
    errors.push(`Unsupported fixture manifest version: ${manifest.manifestVersion}.`);
  }
  if (manifest.tenant.slug !== FIXTURE_TENANT_SLUG) {
    errors.push(`Fixture tenant slug must be exactly "${FIXTURE_TENANT_SLUG}".`);
  }
  if (manifest.tenant.kind !== 'client') {
    errors.push('Fixture tenant kind must be "client".');
  }
  if (manifest.location.name.trim().length === 0) {
    errors.push('Fixture location name must not be empty.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: manifest.location.timezone });
  } catch {
    errors.push(`Invalid fixture location timezone: "${manifest.location.timezone}".`);
  }

  const managerRoles = manifest.roles.filter((r) => r.role === 'manager');
  const staffRoles = manifest.roles.filter((r) => r.role === 'employee');
  if (managerRoles.length !== 1) {
    errors.push('Fixture must define exactly one manager role identity.');
  }
  if (staffRoles.length !== 1) {
    errors.push('Fixture must define exactly one staff (employee) role identity.');
  }
  for (const role of manifest.roles) {
    if (!(FIXTURE_ROLE_KEYS as readonly string[]).includes(role.role)) {
      errors.push(`Unknown fixture role key: "${role.role}".`);
    }
    if (role.role === 'employee' && !role.requiresEmployeeBinding) {
      errors.push('The staff fixture role must set requiresEmployeeBinding: true.');
    }
    if (role.role === 'manager' && role.requiresEmployeeBinding) {
      errors.push('The manager fixture role must not require an employee binding.');
    }
    if (role.envEmailVar.trim().length === 0 || role.envPasswordVar.trim().length === 0) {
      errors.push(`Fixture role "${role.logicalId}" is missing an env var name.`);
    }
  }

  const logicalIds = manifest.roles.map((r) => r.logicalId);
  if (new Set(logicalIds).size !== logicalIds.length) {
    errors.push('Fixture role logicalId values must be unique.');
  }

  if (manifest.shiftTypes.length === 0) {
    errors.push('Fixture must define at least one active shift type.');
  }
  const shiftCodes = manifest.shiftTypes.map((s) => s.code);
  if (new Set(shiftCodes).size !== shiftCodes.length) {
    errors.push('Fixture shift type codes must be unique.');
  }
  for (const shiftType of manifest.shiftTypes) {
    if (shiftType.startsAtLocal >= shiftType.endsAtLocal) {
      errors.push(`Fixture shift type "${shiftType.code}" must end after it starts.`);
    }
    if (shiftType.breakMinutes < 0) {
      errors.push(`Fixture shift type "${shiftType.code}" must not have a negative break.`);
    }
  }

  return errors.length === 0 ? { ok: true, value: manifest } : { ok: false, errors };
}
