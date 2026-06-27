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
}

type OnboardingStringFlag =
  | 'tenantName'
  | 'tenantSlug'
  | 'ownerAuthUserId'
  | 'ownerEmail'
  | 'locationName'
  | 'timezone'
  | 'modules';

/** Map of `--flag` → string field for value-taking args. */
const VALUE_FLAG_MAP: Record<string, OnboardingStringFlag> = {
  '--tenant-name': 'tenantName',
  '--tenant-slug': 'tenantSlug',
  '--owner-auth-user-id': 'ownerAuthUserId',
  '--owner-email': 'ownerEmail',
  '--location-name': 'locationName',
  '--timezone': 'timezone',
  '--modules': 'modules',
};

/** Map of `--flag` → boolean field for switch args. */
const BOOLEAN_FLAG_MAP: Record<string, 'dryRun' | 'commit' | 'yes'> = {
  '--dry-run': 'dryRun',
  '--commit': 'commit',
  '--yes': 'yes',
};

/**
 * Parse raw CLI argv (already sliced past node + script path) into flags.
 * Fails safe on: unknown flags, positional args, and missing values. Never
 * echoes positional values (they could be misplaced PII); only flag-shaped
 * tokens (`--foo`) are named in errors.
 */
export function parseOnboardingCliArgs(argv: string[]): ParseResult<OnboardingCliFlags> {
  const errors: string[] = [];
  const flags: OnboardingCliFlags = { dryRun: false, commit: false, yes: false };

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

function printLine(message: string): void {
  console.log(`[onboard-tenant] ${message}`);
}

function printError(message: string): void {
  console.error(`[onboard-tenant] error: ${message}`);
}

/**
 * Validation-only CLI shell (Stage 3c-1). Parses args, validates input, guards
 * DATABASE_URL if present, and prints a redacted summary. It makes NO database
 * connection and runs NO queries. A `--commit --yes` request resolves the
 * commit mode but exits non-zero because live writes are not implemented yet,
 * preventing a false "success" signal.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  printLine('Stage 3c-1 validation-only shell');
  printLine('no DB connection made');
  printLine('no DB rows read');
  printLine('no DB rows written');
  printLine('live onboarding not implemented yet');

  const parsedArgs = parseOnboardingCliArgs(argv);
  if (!parsedArgs.ok) {
    for (const message of parsedArgs.errors) printError(message);
    process.exit(1);
  }

  const mode = resolveOnboardingMode(parsedArgs.value);
  if (!mode.ok) {
    printError(mode.error);
    process.exit(1);
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
    for (const message of parsedInput.errors) printError(message);
    process.exit(1);
  }

  // Only READ the env var to guard it; never log it, never connect.
  let dbTarget: SafeDbTarget | undefined;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl !== undefined && databaseUrl.trim() !== '') {
    try {
      dbTarget = assertLocalDatabaseUrl(databaseUrl);
    } catch (err) {
      printError(err instanceof Error ? err.message : 'invalid DATABASE_URL.');
      process.exit(1);
    }
  }

  const summary = createValidationOnlyCliSummary(parsedInput.value, mode.value, dbTarget);

  printLine(`mode: ${summary.mode}`);
  printLine(`tenant slug: ${summary.plan.tenantSlug}`);
  printLine(`owner email provided: ${summary.ownerEmailProvided ? 'yes' : 'no'}`);
  printLine(
    summary.dbTarget === 'not-checked'
      ? 'db target: not checked (DATABASE_URL not set)'
      : `db target: ${summary.dbTarget.target}:${summary.dbTarget.port}`,
  );
  for (const [operation, count] of Object.entries(summary.plan.operationCounts)) {
    printLine(`plan ${operation}: ${count}`);
  }

  if (summary.mode === 'commit') {
    printError('commit requested, but live DB writes are not implemented in Stage 3c-1.');
    process.exit(1);
  }

  printLine('validation complete (dry-run): no database was touched.');
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    printError(err instanceof Error ? err.message : 'unknown error');
    process.exit(1);
  });
}
