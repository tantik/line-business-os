/**
 * Onboarding validation / planning helpers + validation-only CLI shell
 * (Phase 1H Stage 3a/3b pure helpers; Stage 3c-1 adds the CLI shell + local
 * DATABASE_URL guard).
 *
 * SCOPE — this module stays ZERO-DB-RISK. The validation/planning helpers are
 * PURE: they only validate and normalize operator-supplied input and build an
 * idempotency PLAN. They deliberately:
 *   - never perform any write,
 *   - never hold the owner's identity (auth user id / email) inside the plan,
 *     so a redacted summary is safe by construction.
 *
 * Stage 3c-1 additionally provides a CLI shell (`main`) and a local-only
 * `assertLocalDatabaseUrl` guard. These deliberately:
 *   - never import a database driver (`pg` / `postgres`),
 *   - never open a database connection,
 *   - never run any SELECT / INSERT / UPDATE / DELETE,
 *   - only READ `process.env.DATABASE_URL` to validate/guard it (never log it,
 *     never connect), and only emit a redacted, no-PII summary.
 *
 * The live, single-transaction onboarding routine (the `pg` driver, real reads
 * and writes) is a later, separately approved stage. Keeping this layer
 * connection-free makes it fully unit-testable (`node --import tsx --test`)
 * with zero database risk.
 */
import { pathToFileURL } from 'node:url';
import type { BackupArtifactValidationResult } from './onboard-backup-gate.js';

/** Module codes the platform understands (`core.module_code`). */
export const VALID_MODULE_CODES = [
  'core',
  'workforce',
  'booking',
  'logistics',
  'crm',
  'inventory',
  'ai',
] as const;

export type ModuleCode = (typeof VALID_MODULE_CODES)[number];

/**
 * Slugs that must never be claimed by an onboarded client tenant: platform
 * words and the demo / client-template tenants from the seed.
 */
export const RESERVED_TENANT_SLUGS = [
  'demo',
  'admin',
  'api',
  'client-template',
  'mame-to-cha-tokyo',
  'mirawi-demo-salon',
] as const;

/** Default location timezone for Japanese SMB clients. */
export const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/** Onboarding always creates real client tenants. */
export const TENANT_KIND_CLIENT = 'client';

/** A membership must be active for the tenant to be visible to its owner. */
export const MEMBERSHIP_STATUS_ACTIVE = 'active';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;
export const TENANT_NAME_MAX_LENGTH = 200;
export const LOCATION_NAME_MAX_LENGTH = 200;
/** RFC 5321 maximum total email length. */
export const EMAIL_MAX_LENGTH = 320;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Single-error validation result. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Aggregated parse result (collects every field error). */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Lowercase + trim only. Validation is performed by {@link validateTenantSlug}. */
export function normalizeTenantSlug(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Validate a tenant slug. Normalizes case/whitespace, enforces the DNS-style
 * pattern and length bounds, and rejects reserved slugs. Returns the normalized
 * slug on success.
 */
export function validateTenantSlug(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Tenant slug is required.' };
  }
  const slug = normalizeTenantSlug(input);
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      error: `Tenant slug must be ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} characters.`,
    };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: 'Tenant slug must be lowercase alphanumeric words separated by single hyphens.',
    };
  }
  if ((RESERVED_TENANT_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, error: `Tenant slug "${slug}" is reserved.` };
  }
  return { ok: true, value: slug };
}

/**
 * Validate the owner's auth user id. Strict UUID shape only — this stage never
 * resolves identity from email. Returns the lowercased UUID on success.
 */
export function validateOwnerAuthUserId(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Owner auth user id is required.' };
  }
  const value = input.trim().toLowerCase();
  if (!UUID_PATTERN.test(value)) {
    return { ok: false, error: 'Owner auth user id must be a valid UUID.' };
  }
  return { ok: true, value };
}

/**
 * Validate the owner's email (basic shape only). Email is PII: callers must
 * never log the returned value, and it is never included in a redacted summary.
 */
export function validateOwnerEmail(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Owner email must be a string.' };
  }
  const value = input.trim().toLowerCase();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value)) {
    return { ok: false, error: 'Owner email is not a valid email address.' };
  }
  return { ok: true, value };
}

/**
 * Canonical key for location idempotency: trim, collapse internal whitespace,
 * lowercase. Used to match an existing location by tenant + normalized name; the
 * original (trimmed) display name is preserved separately.
 */
export function normalizeLocationName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Validate a timezone, defaulting to {@link DEFAULT_TIMEZONE} when omitted.
 * Validity is decided by `Intl.DateTimeFormat` (throws on an unknown zone).
 */
export function validateTimezone(input?: unknown): ValidationResult<string> {
  if (input === undefined || input === null || (typeof input === 'string' && input.trim() === '')) {
    return { ok: true, value: DEFAULT_TIMEZONE };
  }
  if (typeof input !== 'string') {
    return { ok: false, error: 'Timezone must be a string.' };
  }
  const tz = input.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return { ok: true, value: tz };
  } catch {
    return { ok: false, error: `Invalid timezone: "${tz}".` };
  }
}

/**
 * Parse the requested module list (comma-separated string or array). Validates
 * every code, force-includes `core`, de-duplicates, and returns a deterministic
 * order matching {@link VALID_MODULE_CODES}.
 */
export function parseModules(input?: unknown): ValidationResult<ModuleCode[]> {
  let raw: string[];
  if (input === undefined || input === null) {
    raw = [];
  } else if (Array.isArray(input)) {
    raw = input.map((item) => String(item));
  } else if (typeof input === 'string') {
    raw = input.split(',');
  } else {
    return { ok: false, error: 'Modules must be a comma-separated string or array.' };
  }

  const cleaned = raw.map((item) => item.trim().toLowerCase()).filter((item) => item.length > 0);

  const invalid = cleaned.filter((item) => !(VALID_MODULE_CODES as readonly string[]).includes(item));
  if (invalid.length > 0) {
    return { ok: false, error: `Unknown module(s): ${invalid.join(', ')}.` };
  }

  const requested = new Set<string>(cleaned);
  requested.add('core'); // policy: always force-include core.

  const ordered = VALID_MODULE_CODES.filter((code) => requested.has(code));
  return { ok: true, value: [...ordered] };
}

/** Raw, operator-supplied onboarding fields (all untrusted). */
export interface RawOnboardingInput {
  tenantName?: unknown;
  tenantSlug?: unknown;
  ownerAuthUserId?: unknown;
  ownerEmail?: unknown;
  locationName?: unknown;
  timezone?: unknown;
  modules?: unknown;
  dryRun?: unknown;
}

/** Fully validated + normalized onboarding input. */
export interface OnboardingInput {
  tenantName: string;
  tenantSlug: string;
  ownerAuthUserId: string;
  /** Optional in this stage; stored later as encrypted PII, never logged. */
  ownerEmail: string | null;
  /** Display name (trimmed). */
  locationName: string;
  /** Canonical key for idempotent matching ({@link normalizeLocationName}). */
  locationNameKey: string;
  timezone: string;
  modules: ModuleCode[];
  dryRun: boolean;
}

function validateRequiredName(
  input: unknown,
  label: string,
  maxLength: number,
): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: `${label} is required.` };
  }
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, error: `${label} must not be empty.` };
  }
  if (value.length > maxLength) {
    return { ok: false, error: `${label} must be at most ${maxLength} characters.` };
  }
  return { ok: true, value };
}

/**
 * Validate and normalize every onboarding field, collecting all errors. Owner
 * email is optional: absent/blank yields `null`; a present-but-invalid email is
 * an error.
 */
export function parseOnboardingInput(raw: RawOnboardingInput): ParseResult<OnboardingInput> {
  const errors: string[] = [];

  const tenantName = validateRequiredName(raw.tenantName, 'Tenant name', TENANT_NAME_MAX_LENGTH);
  if (!tenantName.ok) errors.push(tenantName.error);

  const tenantSlug = validateTenantSlug(raw.tenantSlug);
  if (!tenantSlug.ok) errors.push(tenantSlug.error);

  const ownerAuthUserId = validateOwnerAuthUserId(raw.ownerAuthUserId);
  if (!ownerAuthUserId.ok) errors.push(ownerAuthUserId.error);

  let ownerEmail: string | null = null;
  const emailProvided =
    raw.ownerEmail !== undefined &&
    raw.ownerEmail !== null &&
    !(typeof raw.ownerEmail === 'string' && raw.ownerEmail.trim() === '');
  if (emailProvided) {
    const email = validateOwnerEmail(raw.ownerEmail);
    if (!email.ok) errors.push(email.error);
    else ownerEmail = email.value;
  }

  const locationName = validateRequiredName(
    raw.locationName,
    'Location name',
    LOCATION_NAME_MAX_LENGTH,
  );
  if (!locationName.ok) errors.push(locationName.error);

  const timezone = validateTimezone(raw.timezone);
  if (!timezone.ok) errors.push(timezone.error);

  const modules = parseModules(raw.modules);
  if (!modules.ok) errors.push(modules.error);

  const dryRun = raw.dryRun === true;

  if (
    tenantName.ok &&
    tenantSlug.ok &&
    ownerAuthUserId.ok &&
    locationName.ok &&
    timezone.ok &&
    modules.ok &&
    errors.length === 0
  ) {
    return {
      ok: true,
      value: {
        tenantName: tenantName.value,
        tenantSlug: tenantSlug.value,
        ownerAuthUserId: ownerAuthUserId.value,
        ownerEmail,
        locationName: locationName.value,
        locationNameKey: normalizeLocationName(locationName.value),
        timezone: timezone.value,
        modules: modules.value,
        dryRun,
      },
    };
  }

  return { ok: false, errors };
}

export type PlanEntity =
  | 'tenant'
  | 'user'
  | 'location'
  | 'membership'
  | 'role_assignment'
  | 'tenant_module';

export type PlanAction = 'create' | 'reuse' | 'activate' | 'enable' | 'conflict';

export interface PlanOperation {
  entity: PlanEntity;
  action: PlanAction;
  module?: ModuleCode;
}

/** Mock of the relevant existing tenant row (no PII). */
export interface ExistingTenantState {
  slug: string;
  name: string;
  kind: string;
}

/**
 * Optional mock of current database state for a dry-run plan. All fields are
 * non-PII facts (existence flags, status, module codes, location names) so the
 * planner stays pure and the plan/summary never carry owner identity.
 */
export interface ExistingOnboardingState {
  tenant?: ExistingTenantState | null;
  userMirrorExists?: boolean;
  locationNames?: string[];
  membershipExists?: boolean;
  membershipStatus?: string | null;
  roleAssignmentExists?: boolean;
  enabledModules?: string[];
}

export interface OnboardingPlan {
  ok: boolean;
  tenantSlug: string;
  operations: PlanOperation[];
  modules: { module: ModuleCode; action: 'enable' | 'reuse' }[];
  conflicts: string[];
}

/**
 * Build an idempotent onboarding plan from validated input and optional mock
 * existing state. Pure: no database, no side effects. Models reuse vs create
 * for each entity and fails safe on a tenant slug conflict (same slug, but a
 * different tenant name or non-client kind) without emitting dependent writes.
 *
 * The plan intentionally excludes the owner's auth user id and email, so it is
 * safe to redact and log via {@link redactOnboardingSummary}.
 */
export function buildOnboardingPlan(
  input: OnboardingInput,
  existingState: ExistingOnboardingState = {},
): OnboardingPlan {
  const operations: PlanOperation[] = [];
  const conflicts: string[] = [];

  const existingTenant = existingState.tenant ?? null;
  if (existingTenant) {
    const sameName = existingTenant.name.trim() === input.tenantName;
    const sameKind = existingTenant.kind === TENANT_KIND_CLIENT;
    if (!sameName || !sameKind) {
      conflicts.push(
        `Tenant slug "${input.tenantSlug}" already exists with a different name or kind.`,
      );
      operations.push({ entity: 'tenant', action: 'conflict' });
      return {
        ok: false,
        tenantSlug: input.tenantSlug,
        operations,
        modules: [],
        conflicts,
      };
    }
    operations.push({ entity: 'tenant', action: 'reuse' });
  } else {
    operations.push({ entity: 'tenant', action: 'create' });
  }

  operations.push({ entity: 'user', action: existingState.userMirrorExists ? 'reuse' : 'create' });

  const existingLocationKeys = (existingState.locationNames ?? []).map(normalizeLocationName);
  const locationExists = existingLocationKeys.includes(input.locationNameKey);
  operations.push({ entity: 'location', action: locationExists ? 'reuse' : 'create' });

  if (!existingState.membershipExists) {
    operations.push({ entity: 'membership', action: 'create' });
  } else if (existingState.membershipStatus !== MEMBERSHIP_STATUS_ACTIVE) {
    operations.push({ entity: 'membership', action: 'activate' });
  } else {
    operations.push({ entity: 'membership', action: 'reuse' });
  }

  operations.push({
    entity: 'role_assignment',
    action: existingState.roleAssignmentExists ? 'reuse' : 'create',
  });

  const enabled = new Set((existingState.enabledModules ?? []).map((code) => code.toLowerCase()));
  const modules = input.modules.map((module) => {
    const action: 'enable' | 'reuse' = enabled.has(module) ? 'reuse' : 'enable';
    operations.push({ entity: 'tenant_module', action, module });
    return { module, action };
  });

  return { ok: true, tenantSlug: input.tenantSlug, operations, modules, conflicts };
}

/** Log-safe summary of a plan (no PII, no secrets, no owner identity). */
export interface RedactedOnboardingSummary {
  tenantSlug: string;
  ok: boolean;
  operationCounts: Record<string, number>;
  operations: { entity: PlanEntity; action: PlanAction; module?: ModuleCode }[];
  modules: { module: ModuleCode; action: 'enable' | 'reuse' }[];
  conflictCount: number;
  conflicts: string[];
}

/**
 * Project a plan into a log-safe summary. Includes only the tenant slug, module
 * codes, operation labels, and counts. The owner's auth user id and email are
 * never part of the plan, so they cannot appear here.
 */
export function redactOnboardingSummary(plan: OnboardingPlan): RedactedOnboardingSummary {
  const operationCounts: Record<string, number> = {};
  for (const op of plan.operations) {
    const key = `${op.entity}.${op.action}`;
    operationCounts[key] = (operationCounts[key] ?? 0) + 1;
  }
  return {
    tenantSlug: plan.tenantSlug,
    ok: plan.ok,
    operationCounts,
    operations: plan.operations.map((op) => ({
      entity: op.entity,
      action: op.action,
      ...(op.module ? { module: op.module } : {}),
    })),
    modules: plan.modules,
    conflictCount: plan.conflicts.length,
    conflicts: plan.conflicts,
  };
}

// ===========================================================================
// Stage 3c-1: CLI parsing helpers (pure)
// ===========================================================================

/**
 * Resolved run mode. `dry-run` is the safe default; `commit` is reserved for a
 * future stage and currently still writes nothing.
 */
export type OnboardingMode = 'dry-run' | 'commit';

/** Raw, parsed CLI flags (still untrusted; validated by parseOnboardingInput). */
export interface OnboardingCliFlags {
  tenantName?: string;
  tenantSlug?: string;
  ownerAuthUserId?: string;
  ownerEmail?: string;
  locationName?: string;
  timezone?: string;
  modules?: string;
  dryRun: boolean;
  commit: boolean;
  yes: boolean;
  /** Commit gate: operator explicitly acknowledges a local DB write (Stage 3c-4a). */
  iUnderstandThisWritesLocalDb: boolean;
  /** Commit gate: path to a fresh encrypted backup artifact (validated, never read). */
  backupArtifact?: string;
  /** Commit gate: must be `local`; Cloud/remote targets are never accepted. */
  target?: string;
}

type OnboardingStringFlag =
  | 'tenantName'
  | 'tenantSlug'
  | 'ownerAuthUserId'
  | 'ownerEmail'
  | 'locationName'
  | 'timezone'
  | 'modules'
  | 'backupArtifact'
  | 'target';

/** Map of `--flag` → string field for value-taking args. */
const VALUE_FLAG_MAP: Record<string, OnboardingStringFlag> = {
  '--tenant-name': 'tenantName',
  '--tenant-slug': 'tenantSlug',
  '--owner-auth-user-id': 'ownerAuthUserId',
  '--owner-email': 'ownerEmail',
  '--location-name': 'locationName',
  '--timezone': 'timezone',
  '--modules': 'modules',
  '--backup-artifact': 'backupArtifact',
  '--target': 'target',
};

/** Map of `--flag` → boolean field for switch args. */
const BOOLEAN_FLAG_MAP: Record<string, 'dryRun' | 'commit' | 'yes' | 'iUnderstandThisWritesLocalDb'> =
  {
    '--dry-run': 'dryRun',
    '--commit': 'commit',
    '--yes': 'yes',
    '--i-understand-this-writes-local-db': 'iUnderstandThisWritesLocalDb',
  };

/**
 * Parse raw CLI argv (already sliced past node + script path) into flags.
 * Fails safe on: unknown flags, positional args, and missing values. Never
 * echoes positional values (they could be misplaced PII); only flag-shaped
 * tokens (`--foo`) are named in errors.
 */
export function parseOnboardingCliArgs(argv: string[]): ParseResult<OnboardingCliFlags> {
  const errors: string[] = [];
  const flags: OnboardingCliFlags = {
    dryRun: false,
    commit: false,
    yes: false,
    iUnderstandThisWritesLocalDb: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    const valueKey = Object.hasOwn(VALUE_FLAG_MAP, token) ? VALUE_FLAG_MAP[token] : undefined;
    const booleanKey = Object.hasOwn(BOOLEAN_FLAG_MAP, token) ? BOOLEAN_FLAG_MAP[token] : undefined;

    if (valueKey !== undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        errors.push(`Missing value for ${token}.`);
        continue; // do not consume the next token
      }
      flags[valueKey] = next;
      i += 1;
    } else if (booleanKey !== undefined) {
      flags[booleanKey] = true;
    } else if (token.startsWith('--')) {
      errors.push(`Unknown argument: ${token}.`);
    } else {
      errors.push('Unexpected positional argument (use --flag value form).');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: flags };
}

/**
 * Resolve the run mode from the mode-related flags.
 * - neither flag → `dry-run` (safe default).
 * - `--dry-run` + `--commit` together → fail safe.
 * - `--commit` without `--yes` → fail safe.
 * - `--commit --yes` → `commit` (but Stage 3c-1 still writes nothing).
 */
export function resolveOnboardingMode(flags: {
  dryRun: boolean;
  commit: boolean;
  yes: boolean;
}): ValidationResult<OnboardingMode> {
  if (flags.dryRun && flags.commit) {
    return { ok: false, error: 'Cannot combine --dry-run with --commit; choose one.' };
  }
  if (flags.commit && !flags.yes) {
    return { ok: false, error: '--commit requires explicit --yes confirmation.' };
  }
  if (flags.commit && flags.yes) {
    return { ok: true, value: 'commit' };
  }
  return { ok: true, value: 'dry-run' };
}

// ===========================================================================
// Stage 3c-4a: strict commit confirmation gates (pure; no DB, no fs)
// ===========================================================================

/** The only accepted `--target` value for a committed run. Cloud is impossible. */
export const COMMIT_TARGET_LOCAL = 'local';

/** Commit-gate inputs (a subset of {@link OnboardingCliFlags}). */
export interface CommitGateFlags {
  iUnderstandThisWritesLocalDb: boolean;
  backupArtifact?: string;
  target?: string;
}

/**
 * Result of the pure commit-gate check. On success it returns the (trimmed)
 * backup artifact path the caller must still validate on disk via
 * {@link BackupArtifactValidationResult}. It NEVER echoes the offending value
 * (e.g. a wrong `--target`) so no operator-supplied value can leak.
 */
export type CommitGatesResult =
  | { ok: true; backupArtifact: string }
  | { ok: false; errors: string[] };

/**
 * Validate the strict commit confirmation gates (Stage 3c-4a). This runs only
 * once the mode has already resolved to `commit` (i.e. `--commit --yes`). It is
 * PURE: it touches no database and no filesystem (the backup file itself is
 * validated separately). Every required gate must be present:
 *   - `--i-understand-this-writes-local-db`
 *   - `--target local` (Cloud/remote targets are rejected)
 *   - `--backup-artifact <path>` (presence only here; file checked later)
 *
 * Errors are static and never echo the supplied value.
 */
export function validateCommitGates(flags: CommitGateFlags): CommitGatesResult {
  const errors: string[] = [];

  if (!flags.iUnderstandThisWritesLocalDb) {
    errors.push('commit requires --i-understand-this-writes-local-db.');
  }

  const target = flags.target?.trim();
  if (target === undefined || target === '') {
    errors.push('commit requires --target local.');
  } else if (target.toLowerCase() !== COMMIT_TARGET_LOCAL) {
    errors.push('commit --target must be local; Cloud/remote targets are not allowed.');
  }

  const backupArtifact = flags.backupArtifact?.trim();
  if (backupArtifact === undefined || backupArtifact === '') {
    errors.push('commit requires --backup-artifact <path>.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, backupArtifact: backupArtifact as string };
}

// ===========================================================================
// Stage 3c-1: Local-only DATABASE_URL guard (pure; never connects)
// ===========================================================================

/** Safe, log-friendly description of an accepted local DB target (no secrets). */
export interface SafeDbTarget {
  target: 'local-postgres';
  port: number;
}

/** Only loopback hosts are accepted. `::1` is normalized (brackets stripped). */
const ALLOWED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** The expected Supabase local Postgres port. */
const LOCAL_DB_PORT = '54322';

/**
 * Validate that a DATABASE_URL points at the LOCAL database only, returning a
 * safe target descriptor. This function NEVER connects and NEVER imports a DB
 * driver. All error messages are static and intentionally exclude the raw URL,
 * username, password, and the offending host value.
 */
export function assertLocalDatabaseUrl(databaseUrl: string): SafeDbTarget {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres:// (or postgresql://) protocol.');
  }

  // Strip IPv6 brackets so `[::1]` matches `::1`.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com')) {
    throw new Error('Refusing a Supabase Cloud-like database host; onboarding is local-only.');
  }
  if (!ALLOWED_LOCAL_HOSTS.has(host)) {
    throw new Error('DATABASE_URL host is not an allowed local host (expected 127.0.0.1 or localhost).');
  }
  if (url.port !== LOCAL_DB_PORT) {
    throw new Error('DATABASE_URL must target the local database port 54322.');
  }

  return { target: 'local-postgres', port: Number(LOCAL_DB_PORT) };
}

// ===========================================================================
// Stage 3c-1: Validation-only summary + CLI shell (no DB connection)
// ===========================================================================

/**
 * Log-safe summary of a validation-only CLI run. Carries NO owner identity:
 * the owner's auth user id and email never appear (only a boolean flag for
 * whether an email was supplied).
 */
export interface ValidationOnlyCliSummary {
  stage: 'phase-1h-stage-3c1';
  mode: OnboardingMode;
  dbConnection: 'none';
  liveOnboarding: 'not-implemented';
  ownerEmailProvided: boolean;
  dbTarget: SafeDbTarget | 'not-checked';
  plan: RedactedOnboardingSummary;
}

/**
 * Build a redacted, no-PII summary for a validation-only run. Uses an EMPTY
 * existing-state mock (no DB read), so the plan reflects a fresh tenant. The
 * owner's email/auth id are never copied into the summary.
 */
export function createValidationOnlyCliSummary(
  input: OnboardingInput,
  mode: OnboardingMode,
  dbTarget?: SafeDbTarget,
): ValidationOnlyCliSummary {
  const plan = buildOnboardingPlan(input, {});
  return {
    stage: 'phase-1h-stage-3c1',
    mode,
    dbConnection: 'none',
    liveOnboarding: 'not-implemented',
    ownerEmailProvided: input.ownerEmail !== null,
    dbTarget: dbTarget ?? 'not-checked',
    plan: redactOnboardingSummary(plan),
  };
}

/** Where the existing-state used to build the plan came from. */
export type OnboardingStateSource = 'empty' | 'local-read-only';

/**
 * Log-safe summary of a Stage 3c-2 run. Like {@link ValidationOnlyCliSummary}
 * but reflects optional local READ-ONLY state loading. It still carries NO
 * owner identity (no auth user id / email) and no UUIDs: the plan it embeds is
 * built from non-PII existing-state facts only.
 */
export interface ReadOnlyCliSummary {
  stage: 'phase-1h-stage-3c2';
  mode: OnboardingMode;
  dbConnection: 'none' | 'local-read-only';
  liveOnboarding: 'not-implemented';
  ownerEmailProvided: boolean;
  dbTarget: SafeDbTarget | 'not-checked';
  stateSource: OnboardingStateSource;
  plan: RedactedOnboardingSummary;
}

/**
 * Build a redacted, no-PII summary from validated input and the existing state
 * (empty for a no-DB run, or loaded read-only from the local DB). Pure: it
 * never connects; the caller supplies the already-loaded state. The owner's
 * email/auth id are never copied into the summary.
 */
export function createReadOnlyCliSummary(
  input: OnboardingInput,
  mode: OnboardingMode,
  existingState: ExistingOnboardingState,
  stateSource: OnboardingStateSource,
  dbTarget?: SafeDbTarget,
): ReadOnlyCliSummary {
  const plan = buildOnboardingPlan(input, existingState);
  return {
    stage: 'phase-1h-stage-3c2',
    mode,
    dbConnection: stateSource === 'local-read-only' ? 'local-read-only' : 'none',
    liveOnboarding: 'not-implemented',
    ownerEmailProvided: input.ownerEmail !== null,
    dbTarget: dbTarget ?? 'not-checked',
    stateSource,
    plan: redactOnboardingSummary(plan),
  };
}

// ===========================================================================
// Stage 3c-3b: CLI routing (testable; no DB connection of its own)
// ===========================================================================

/**
 * Structural shape of a local dry-run transaction result the CLI needs to print.
 * The full result (with the nested redacted write summary) is produced by
 * `runOnboardingDryRunTransactionFromEnv` in `./onboard-write`; the CLI only
 * reads these log-safe fields, so this file never imports a DB driver.
 */
export interface CliDryRunTransactionResult {
  mode: 'dry-run';
  tenantSlug: string;
  ownerEmailProvided: boolean;
  dbTarget: SafeDbTarget;
  rolledBack: true;
  persisted: false;
  write: { operationCounts: Record<string, number> };
}

/** Injectable dependencies for {@link runOnboardingCli} (no DB in tests). */
export interface OnboardingCliDeps {
  /** Environment source (defaults to `process.env`). */
  env?: { DATABASE_URL?: string };
  /** Runs the local dry-run transaction. Defaults to a lazy `./onboard-write`. */
  runDryRunTransaction?: (input: OnboardingInput) => Promise<CliDryRunTransactionResult>;
  /**
   * Validate the backup artifact on disk (metadata only). Defaults to a lazy
   * `./onboard-backup-gate`; injectable so unit tests can avoid the filesystem.
   */
  validateBackupArtifact?: (
    artifactPath: string | undefined,
  ) => BackupArtifactValidationResult | Promise<BackupArtifactValidationResult>;
}

/** Which branch the CLI took (used by tests; never carries PII). */
export type OnboardingCliPath =
  | 'parse-error'
  | 'mode-error'
  | 'input-error'
  | 'db-url-error'
  | 'commit-gate-error'
  | 'backup-artifact-error'
  | 'commit-refused'
  | 'dry-run-transaction'
  | 'dry-run-transaction-error'
  | 'validation-only';

/**
 * Redacted, log-safe outcome of a CLI run. `lines` / `errors` are the messages
 * the thin `main` wrapper prints; they NEVER contain the owner email, the owner
 * auth user id, the DATABASE_URL, secrets, or real UUIDs.
 */
export interface OnboardingCliOutcome {
  exitCode: 0 | 1;
  path: OnboardingCliPath;
  mode?: OnboardingMode;
  lines: string[];
  errors: string[];
  /** Whether a DB connection was (or would be) attempted on this path. */
  connectionAttempted: boolean;
}

/** Default dry-run transaction runner: lazy import keeps `pg` out of this file. */
async function defaultRunDryRunTransaction(
  input: OnboardingInput,
): Promise<CliDryRunTransactionResult> {
  const { runOnboardingDryRunTransactionFromEnv } = await import('./onboard-write.js');
  return runOnboardingDryRunTransactionFromEnv(input);
}

/**
 * Default backup-artifact validator: lazy import keeps `fs`/`backup` out of the
 * module's import graph until the commit path actually needs them. Metadata
 * only — it never reads, decrypts, uploads, or connects.
 */
async function defaultValidateBackupArtifact(
  artifactPath: string | undefined,
): Promise<BackupArtifactValidationResult> {
  const { validateBackupArtifactForCommit } = await import('./onboard-backup-gate.js');
  return validateBackupArtifactForCommit(artifactPath);
}

/**
 * Onboarding CLI routing (Stage 3c-4a), free of `process.exit` and `console`
 * so it is fully unit-testable. Parses args, validates input, and guards
 * DATABASE_URL if present, then:
 *
 *   - **dry-run + DATABASE_URL set** → runs the LOCAL dry-run transaction
 *     (`runOnboardingDryRunTransactionFromEnv`), which executes the write path
 *     inside a transaction that ALWAYS rolls back, then prints a redacted
 *     summary plus the rolled-back / nothing-persisted / no-commit lines;
 *   - **dry-run + DATABASE_URL absent** → keeps the prior validation-only
 *     behavior (plans against an empty state, no connection, no rows);
 *   - **commit (Stage 3c-4a)** → validates the strict confirmation gates
 *     (`--i-understand-this-writes-local-db`, `--target local`,
 *     `--backup-artifact <path>`) and the backup artifact on disk (metadata
 *     only), then REFUSES: it exits non-zero WITHOUT reading DATABASE_URL,
 *     connecting, or writing (there is no COMMIT), so it can never report a
 *     false success. Committed (durable) onboarding is Stage 3c-4b.
 *
 * It never imports a DB driver itself: the dry-run transaction and the backup
 * gate are reached via lazy imports (or injected dependencies in tests).
 */
export async function runOnboardingCli(
  argv: string[],
  deps: OnboardingCliDeps = {},
): Promise<OnboardingCliOutcome> {
  const env = deps.env ?? process.env;
  const lines: string[] = [];

  const parsedArgs = parseOnboardingCliArgs(argv);
  if (!parsedArgs.ok) {
    return { exitCode: 1, path: 'parse-error', lines, errors: parsedArgs.errors, connectionAttempted: false };
  }

  const mode = resolveOnboardingMode(parsedArgs.value);
  if (!mode.ok) {
    return { exitCode: 1, path: 'mode-error', lines, errors: [mode.error], connectionAttempted: false };
  }

  const parsedInput = parseOnboardingInput({
    tenantName: parsedArgs.value.tenantName,
    tenantSlug: parsedArgs.value.tenantSlug,
    ownerAuthUserId: parsedArgs.value.ownerAuthUserId,
    ownerEmail: parsedArgs.value.ownerEmail,
    locationName: parsedArgs.value.locationName,
    timezone: parsedArgs.value.timezone,
    modules: parsedArgs.value.modules,
    dryRun: mode.value === 'dry-run',
  });
  if (!parsedInput.ok) {
    return { exitCode: 1, path: 'input-error', lines, errors: parsedInput.errors, connectionAttempted: false };
  }

  // Commit (Stage 3c-4a): validate the strict confirmation gates and the backup
  // artifact, then REFUSE. This branch runs BEFORE any DATABASE_URL is read, so
  // commit never reads/guards/opens a connection, never writes, and never calls
  // the dry-run transaction. Committed (durable) onboarding and COMMIT wiring are
  // Stage 3c-4b.
  if (mode.value === 'commit') {
    const gates = validateCommitGates(parsedArgs.value);
    if (!gates.ok) {
      return {
        exitCode: 1,
        path: 'commit-gate-error',
        mode: mode.value,
        lines,
        errors: gates.errors,
        connectionAttempted: false,
      };
    }

    const validateBackupArtifact = deps.validateBackupArtifact ?? defaultValidateBackupArtifact;
    const backupResult = await validateBackupArtifact(gates.backupArtifact);
    if (!backupResult.ok) {
      return {
        exitCode: 1,
        path: 'backup-artifact-error',
        mode: mode.value,
        lines,
        errors: [backupResult.error],
        connectionAttempted: false,
      };
    }

    // All gates + the backup artifact validated, but committed (durable)
    // onboarding is NOT implemented in this stage: no connection, no writes,
    // no durable commit. The CLI exits non-zero so it can never look like a
    // successful committed onboarding.
    lines.push('commit requested');
    lines.push('local commit gates validated');
    lines.push('backup artifact validated');
    lines.push('committed (durable) onboarding is not implemented yet (Stage 3c-4a)');
    lines.push('no database connection attempted');
    lines.push('no rows written');
    lines.push('no durable commit available in this stage');
    return {
      exitCode: 1,
      path: 'commit-refused',
      mode: mode.value,
      lines,
      errors: ['committed (durable) onboarding is not implemented yet; re-run with --dry-run.'],
      connectionAttempted: false,
    };
  }

  // Only READ the env var to guard it; never log it. (Dry-run path only.)
  let dbTarget: SafeDbTarget | undefined;
  const databaseUrl = env.DATABASE_URL;
  const hasDatabaseUrl = databaseUrl !== undefined && databaseUrl.trim() !== '';
  if (hasDatabaseUrl) {
    try {
      dbTarget = assertLocalDatabaseUrl(databaseUrl);
    } catch (err) {
      return {
        exitCode: 1,
        path: 'db-url-error',
        lines,
        errors: [err instanceof Error ? err.message : 'invalid DATABASE_URL.'],
        connectionAttempted: false,
      };
    }
  }

  // Dry-run WITH DATABASE_URL → run the local dry-run transaction (always rolls
  // back). The driver lives in ./onboard-write, reached lazily / via deps.
  if (hasDatabaseUrl) {
    const runDryRunTransaction = deps.runDryRunTransaction ?? defaultRunDryRunTransaction;
    let result: CliDryRunTransactionResult;
    try {
      result = await runDryRunTransaction(parsedInput.value);
    } catch (err) {
      return {
        exitCode: 1,
        path: 'dry-run-transaction-error',
        mode: mode.value,
        lines,
        errors: [
          err instanceof Error ? err.message : 'failed to run the local onboarding dry-run transaction.',
        ],
        connectionAttempted: true,
      };
    }

    lines.push(`mode: ${result.mode}`);
    lines.push(`tenant slug: ${result.tenantSlug}`);
    lines.push(`owner email provided: ${result.ownerEmailProvided ? 'yes' : 'no'}`);
    lines.push(`db target: ${result.dbTarget.target}:${result.dbTarget.port}`);
    for (const [operation, count] of Object.entries(result.write.operationCounts)) {
      lines.push(`plan ${operation}: ${count}`);
    }
    lines.push('local dry-run transaction executed');
    lines.push('transaction rolled back');
    lines.push('no DB rows persisted');
    lines.push('no live commit implemented');
    return { exitCode: 0, path: 'dry-run-transaction', mode: mode.value, lines, errors: [], connectionAttempted: true };
  }

  // Dry-run WITHOUT DATABASE_URL → validation-only (no connection, empty state).
  const summary = createReadOnlyCliSummary(parsedInput.value, mode.value, {}, 'empty', dbTarget);
  lines.push(`mode: ${summary.mode}`);
  lines.push(`tenant slug: ${summary.plan.tenantSlug}`);
  lines.push(`owner email provided: ${summary.ownerEmailProvided ? 'yes' : 'no'}`);
  lines.push('db target: not checked (DATABASE_URL not set)');
  for (const [operation, count] of Object.entries(summary.plan.operationCounts)) {
    lines.push(`plan ${operation}: ${count}`);
  }
  lines.push('validation complete (dry-run): no database was touched.');
  return { exitCode: 0, path: 'validation-only', mode: mode.value, lines, errors: [], connectionAttempted: false };
}

function printLine(message: string): void {
  console.log(`[onboard-tenant] ${message}`);
}

function printError(message: string): void {
  console.error(`[onboard-tenant] error: ${message}`);
}

/**
 * Thin CLI entrypoint (Stage 3c-3b). Delegates all routing to
 * {@link runOnboardingCli}, then prints the redacted lines/errors and exits.
 * The DB driver lives ONLY in `./onboard-write` (write path) and `./onboard-db`
 * (read path) and is reached lazily, so this file stays driver-free: it never
 * imports the driver, instantiates a client, or opens a connection itself.
 */
async function main(): Promise<void> {
  printLine('Stage 3c-4a onboarding CLI');
  printLine('dry-run runs the write path in a transaction that always rolls back');
  printLine('commit validates gates + a backup artifact only; committed onboarding is not implemented (no durable writes)');

  const outcome = await runOnboardingCli(process.argv.slice(2));
  for (const message of outcome.errors) printError(message);
  for (const line of outcome.lines) printLine(line);
  process.exit(outcome.exitCode);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    printError(err instanceof Error ? err.message : 'unknown error');
    process.exit(1);
  });
}
