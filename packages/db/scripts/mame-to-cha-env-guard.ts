/**
 * Local-only environment safety guard for the Mame To Cha onboarding
 * rehearsal (Phase 1N-4C Slice C1).
 *
 * SCOPE — PURE. No I/O, no database connection, no filesystem access. It
 * only reads the operator-supplied env map (never `process.env` directly --
 * the caller injects it) and returns a redacted, fail-closed report. It
 * NEVER echoes an env var's value: only presence/absence and (for the
 * DATABASE_URL) the already-safe {@link SafeDbTarget} descriptor produced by
 * the existing, hardened `assertLocalDatabaseUrl` guard.
 *
 * This mirrors (and reuses) `onboard-tenant.ts`'s local DB guard rather than
 * duplicating its logic, so a Cloud-like or malformed DATABASE_URL is
 * rejected by the exact same code path `db:onboard-tenant` already uses.
 *
 * ACCEPTED LOCAL/TEST EMAIL CONVENTION: `looksLikeLocalTestEmail` requires a
 * syntactically valid email address ending in one of `.test`, `.local`,
 * `example.com`, or `example.jp` (case-insensitive). Anything else FAILS
 * this guard (`severity: 'error'`) -- this is a hard rejection, not a
 * warning, deliberately matching `mame-to-cha-auth.ts`'s
 * `provisionMameToChaLocalAuthUsers`, which hard-rejects the identical
 * condition before making any Auth admin call. The two checks must never
 * diverge in strictness: an operator must see the same fail-closed
 * verdict whether they run `dry-run`/`apply`/`verify`/`cleanup` (this
 * guard) or `auth-provision` (the Auth-specific guard) against the same
 * configured email. The failure message never echoes the offending value.
 */
import { assertLocalDatabaseUrl } from './onboard-tenant.js';
import type { SafeDbTarget } from './onboard-tenant.js';
import { FIXTURE_TENANT_SLUG, PROTECTED_TENANT_SLUGS } from './mame-to-cha-fixture.js';
import type { MameToChaFixtureManifest } from './mame-to-cha-fixture.js';

/** Local-only env var names the rehearsal tool understands. Names only -- never values. */
export const MAME_TO_CHA_REQUIRED_ENV_VARS = [
  'MAME_TO_CHA_LOCAL_MANAGER_EMAIL',
  'MAME_TO_CHA_LOCAL_MANAGER_PASSWORD',
  'MAME_TO_CHA_LOCAL_STAFF_EMAIL',
  'MAME_TO_CHA_LOCAL_STAFF_PASSWORD',
] as const;

/** Env var names allowed to be read by this guard. */
export interface MameToChaRehearsalEnv {
  DATABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  MAME_TO_CHA_LOCAL_MANAGER_EMAIL?: string;
  MAME_TO_CHA_LOCAL_MANAGER_PASSWORD?: string;
  MAME_TO_CHA_LOCAL_STAFF_EMAIL?: string;
  MAME_TO_CHA_LOCAL_STAFF_PASSWORD?: string;
}

export type GuardCheckSeverity = 'error' | 'warning' | 'info';

export interface GuardCheck {
  id: string;
  ok: boolean;
  severity: GuardCheckSeverity;
  message: string;
}

export interface MameToChaEnvGuardReport {
  ok: boolean;
  fixtureTenantSlug: string;
  dbLocalTarget: SafeDbTarget | null;
  checks: GuardCheck[];
  blockedReasons: string[];
  warnings: string[];
}

const LOCAL_EMAIL_ALLOWED_SUFFIXES = ['.test', '.local', 'example.com', 'example.jp'];
const EMAIL_SHAPE_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isCloudLikeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h.endsWith('.supabase.co') || h.endsWith('.pooler.supabase.com');
}

/** True when an email address looks like an obviously local/test address, never a real customer address. */
export function looksLikeLocalTestEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  if (!EMAIL_SHAPE_PATTERN.test(value)) return false;
  return LOCAL_EMAIL_ALLOWED_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

/**
 * Build the fail-closed local-environment guard report for the rehearsal
 * tool. This is the gate every future apply/verify/cleanup operation must
 * pass before any network or database mutation (Section 4 of the C1 task
 * brief). PURE: never connects, never reads the filesystem, never echoes a
 * secret value.
 */
export function checkMameToChaLocalEnvironment(
  env: MameToChaRehearsalEnv,
  fixture: Pick<MameToChaFixtureManifest, 'tenant'>,
): MameToChaEnvGuardReport {
  const checks: GuardCheck[] = [];
  let dbLocalTarget: SafeDbTarget | null = null;

  // 1. Fixture tenant slug must be exactly the acceptance slug.
  const slugOk = fixture.tenant.slug === FIXTURE_TENANT_SLUG;
  checks.push({
    id: 'fixture.tenant-slug',
    ok: slugOk,
    severity: 'error',
    message: slugOk
      ? `Fixture tenant slug is exactly "${FIXTURE_TENANT_SLUG}".`
      : `Fixture tenant slug must be exactly "${FIXTURE_TENANT_SLUG}".`,
  });

  // 2. Fixture tenant slug must never collide with a protected slug.
  const protectedHit = (PROTECTED_TENANT_SLUGS as readonly string[]).includes(fixture.tenant.slug);
  checks.push({
    id: 'fixture.not-protected',
    ok: !protectedHit,
    severity: 'error',
    message: protectedHit
      ? `Fixture tenant slug "${fixture.tenant.slug}" collides with a protected tenant slug.`
      : 'Fixture tenant slug does not collide with any protected tenant.',
  });

  // 3. DATABASE_URL must be present and local (Cloud/malformed rejected here).
  if (env.DATABASE_URL === undefined || env.DATABASE_URL.trim() === '') {
    checks.push({
      id: 'env.database-url',
      ok: false,
      severity: 'error',
      message: 'DATABASE_URL is required and must point at the local database.',
    });
  } else {
    try {
      dbLocalTarget = assertLocalDatabaseUrl(env.DATABASE_URL);
      checks.push({
        id: 'env.database-url',
        ok: true,
        severity: 'error',
        message: 'DATABASE_URL points at the local database.',
      });
    } catch (err) {
      checks.push({
        id: 'env.database-url',
        ok: false,
        severity: 'error',
        message: err instanceof Error ? err.message : 'DATABASE_URL is not a valid local target.',
      });
    }
  }

  // 4. NEXT_PUBLIC_SUPABASE_URL, if provided, is reported host-only; Cloud-like is a warning, not a block.
  if (env.NEXT_PUBLIC_SUPABASE_URL !== undefined && env.NEXT_PUBLIC_SUPABASE_URL.trim() !== '') {
    try {
      const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
      const cloudLike = isCloudLikeHost(url.hostname);
      checks.push({
        id: 'env.supabase-url-host',
        ok: true,
        severity: cloudLike ? 'warning' : 'info',
        message: cloudLike
          ? 'NEXT_PUBLIC_SUPABASE_URL host looks like Supabase Cloud (acceptable if the web env is intentionally Cloud-pointed; this tool itself never reads or writes through it).'
          : 'NEXT_PUBLIC_SUPABASE_URL host parsed.',
      });
    } catch {
      checks.push({
        id: 'env.supabase-url-host',
        ok: true,
        severity: 'warning',
        message: 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL; could not extract a host.',
      });
    }
  }

  // 5. Required credential env vars: presence only, never values.
  for (const varName of MAME_TO_CHA_REQUIRED_ENV_VARS) {
    const value = env[varName];
    const present = typeof value === 'string' && value.trim() !== '';
    checks.push({
      id: `env.${varName}`,
      ok: present,
      severity: 'error',
      message: present ? `${varName} is present.` : `${varName} is required (value never logged).`,
    });
  }

  // 6. Email-shaped env vars must look like obviously local/test addresses,
  // never a real customer address. This is a hard FAIL, not a warning --
  // aligned with `mame-to-cha-auth.ts`'s `provisionMameToChaLocalAuthUsers`,
  // which hard-rejects the identical condition before any Auth admin call.
  // Two independent checks of the same fact must agree in strictness, so an
  // operator cannot see "ok: true (warning)" here and be misled about what
  // `auth-provision` will do with the same env vars. The message never
  // echoes the offending value -- only the env var NAME and the accepted
  // domain convention (`.test` / `.local` / `example.com` / `example.jp`).
  for (const varName of ['MAME_TO_CHA_LOCAL_MANAGER_EMAIL', 'MAME_TO_CHA_LOCAL_STAFF_EMAIL'] as const) {
    const value = env[varName];
    if (typeof value !== 'string' || value.trim() === '') continue;
    const ok = looksLikeLocalTestEmail(value);
    checks.push({
      id: `env.${varName}.shape`,
      ok,
      severity: 'error',
      message: ok
        ? `${varName} looks like a local/test address.`
        : `${varName} does not look like an obviously local/test address (expected a .test/.local/example.com/example.jp domain); refusing to proceed with what may be a real client email (value never logged).`,
    });
  }

  const blockedReasons = checks.filter((c) => !c.ok && c.severity === 'error').map((c) => c.message);
  const warnings = checks.filter((c) => c.severity === 'warning').map((c) => c.message);

  return {
    ok: blockedReasons.length === 0,
    fixtureTenantSlug: fixture.tenant.slug,
    dbLocalTarget,
    checks,
    blockedReasons,
    warnings,
  };
}
