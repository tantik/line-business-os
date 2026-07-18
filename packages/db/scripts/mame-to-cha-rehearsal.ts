/**
 * Mame To Cha local onboarding rehearsal CLI (Phase 1N-4C Slice C1
 * completion).
 *
 * SCOPE — every subcommand below is now FULLY IMPLEMENTED against the real
 * local database / local Auth admin API (`mame-to-cha-write.ts`,
 * `mame-to-cha-verify.ts`, `mame-to-cha-cleanup.ts`, `mame-to-cha-auth.ts`),
 * all gated by the same fail-closed local-environment guard
 * (`mame-to-cha-env-guard.ts`). This file itself still imports no database
 * driver and no Supabase admin client directly -- it only reaches them via
 * the dedicated modules above (lazily, or via injected `deps` in tests), so
 * a bare `import`/`require` of this file (or of any module it statically
 * imports) can never open a connection or make a network call.
 *
 * `dry-run` is read-only-safe and connects to the local database (schema
 * existence checks only). `verify` is read-only-safe once real identity is
 * supplied. `apply` and `cleanup` are real, mutating, transactional
 * operations -- gated behind `--confirm-apply`/`--confirm-cleanup`
 * respectively (and `cleanup --dry-run` for a rollback-only preview).
 * `auth-provision` is a real Supabase Auth admin operation, gated by its own
 * local-only Supabase URL guard. Per this task's explicit restrictions, this
 * repository session never invokes `apply`, `cleanup --confirm-cleanup`, or
 * `auth-provision` -- only `dry-run` is run (see
 * `docs/phase-1n-4c-local-onboarding-rehearsal.md`).
 */
import { pathToFileURL } from 'node:url';
import { checkMameToChaLocalEnvironment, type MameToChaEnvGuardReport, type MameToChaRehearsalEnv } from './mame-to-cha-env-guard.js';
import { MAME_TO_CHA_FIXTURE, validateMameToChaFixtureManifest } from './mame-to-cha-fixture.js';
import { buildMameToChaFixturePlan, redactMameToChaPlanSummary } from './mame-to-cha-plan.js';
import type { SchemaCheckReport } from './mame-to-cha-schema-check.js';
import type { MameToChaDryRunResult, MameToChaCommitResult } from './mame-to-cha-write.js';
import type { MameToChaVerifyReport } from './mame-to-cha-verify.js';
import type { MameToChaCleanupDryRunResult, MameToChaCleanupCommitResult } from './mame-to-cha-cleanup.js';
import type { MameToChaAuthEnv, MameToChaAuthProvisionResult } from './mame-to-cha-auth.js';

export type RehearsalSubcommand = 'dry-run' | 'apply' | 'verify' | 'cleanup' | 'auth-provision';

const VALID_SUBCOMMANDS: readonly RehearsalSubcommand[] = ['dry-run', 'apply', 'verify', 'cleanup', 'auth-provision'];

export interface RehearsalCliFlags {
  subcommand?: string;
  confirmApply: boolean;
  confirmCleanup: boolean;
  cleanupDryRun: boolean;
  managerUserId?: string;
  staffUserId?: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const VALUE_FLAG_MAP: Record<string, 'managerUserId' | 'staffUserId'> = {
  '--manager-user-id': 'managerUserId',
  '--staff-user-id': 'staffUserId',
};

const BOOLEAN_FLAG_MAP: Record<string, 'confirmApply' | 'confirmCleanup' | 'cleanupDryRun'> = {
  '--confirm-apply': 'confirmApply',
  '--confirm-cleanup': 'confirmCleanup',
  '--dry-run': 'cleanupDryRun',
};

/** Parse `argv` (already sliced past node + script path). Fails safe on unknown flags. */
export function parseRehearsalCliArgs(argv: string[]): ParseResult<RehearsalCliFlags> {
  const errors: string[] = [];
  const flags: RehearsalCliFlags = { confirmApply: false, confirmCleanup: false, cleanupDryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    if (flags.subcommand === undefined && !token.startsWith('--')) {
      flags.subcommand = token;
      continue;
    }

    const valueKey = Object.hasOwn(VALUE_FLAG_MAP, token) ? VALUE_FLAG_MAP[token] : undefined;
    const booleanKey = Object.hasOwn(BOOLEAN_FLAG_MAP, token) ? BOOLEAN_FLAG_MAP[token] : undefined;

    if (valueKey !== undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        errors.push(`Missing value for ${token}.`);
        continue;
      }
      flags[valueKey] = next;
      i += 1;
    } else if (booleanKey !== undefined) {
      flags[booleanKey] = true;
    } else if (token.startsWith('--')) {
      errors.push(`Unknown argument: ${token}.`);
    } else {
      errors.push('Unexpected positional argument (only one subcommand is accepted).');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: flags };
}

export interface RehearsalCliDeps {
  env?: MameToChaRehearsalEnv & MameToChaAuthEnv;
  /** Injectable for tests; defaults to a lazy `./mame-to-cha-schema-check` import. */
  runSchemaCheck?: (databaseUrl: string) => Promise<SchemaCheckReport>;
  /** Injectable for tests; defaults to a lazy `./mame-to-cha-write` import. */
  runApplyDryRun?: (identity: { managerUserId: string; staffUserId: string }) => Promise<MameToChaDryRunResult>;
  runApplyCommit?: (identity: { managerUserId: string; staffUserId: string }) => Promise<MameToChaCommitResult>;
  /** Injectable for tests; defaults to a lazy `./mame-to-cha-verify` import. */
  runVerify?: (identity: { managerUserId?: string; staffUserId?: string }) => Promise<MameToChaVerifyReport>;
  /** Injectable for tests; defaults to a lazy `./mame-to-cha-cleanup` import. */
  runCleanupDryRun?: (identity: { managerUserId: string; staffUserId: string }) => Promise<MameToChaCleanupDryRunResult>;
  runCleanupCommit?: (identity: { managerUserId: string; staffUserId: string }) => Promise<MameToChaCleanupCommitResult>;
  /** Injectable for tests; defaults to a lazy `./mame-to-cha-auth` import. */
  runAuthProvision?: (env: MameToChaAuthEnv) => Promise<MameToChaAuthProvisionResult>;
}

export type RehearsalCliPath =
  | 'parse-error'
  | 'unknown-subcommand'
  | 'env-guard-blocked'
  | 'schema-check-blocked'
  | 'schema-check-error'
  | 'dry-run-ok'
  | 'apply-missing-identity'
  | 'apply-dry-run-ok'
  | 'apply-committed'
  | 'apply-noop'
  | 'apply-error'
  | 'verify-ok'
  | 'verify-failed'
  | 'verify-error'
  | 'cleanup-missing-identity'
  | 'cleanup-missing-mode'
  | 'cleanup-dry-run-ok'
  | 'cleanup-committed'
  | 'cleanup-noop'
  | 'cleanup-error'
  | 'auth-provision-error'
  | 'auth-provision-ok';

export interface RehearsalCliOutcome {
  exitCode: 0 | 1;
  path: RehearsalCliPath;
  lines: string[];
  errors: string[];
  /** Whether a DB connection / network call was (or would be) attempted on this path. */
  connectionAttempted: boolean;
}

const NEVER_TOUCHED_CLOUD_LINE = 'Cloud was not touched.';

function selfCheckFixtureOrThrow(): void {
  const result = validateMameToChaFixtureManifest(MAME_TO_CHA_FIXTURE);
  if (!result.ok) {
    // The tracked fixture manifest is not operator-supplied; a failure here is
    // a tooling bug, not an operator input error, so it fails loudly.
    throw new Error(`Tracked fixture manifest is invalid: ${result.errors.join('; ')}`);
  }
}

async function defaultRunSchemaCheck(databaseUrl: string): Promise<SchemaCheckReport> {
  const { runLocalReadOnlySchemaCheck } = await import('./mame-to-cha-schema-check.js');
  return runLocalReadOnlySchemaCheck(databaseUrl);
}

async function defaultRunApplyDryRun(identity: { managerUserId: string; staffUserId: string }): Promise<MameToChaDryRunResult> {
  const { runMameToChaApplyDryRunTransactionFromEnv } = await import('./mame-to-cha-write.js');
  return runMameToChaApplyDryRunTransactionFromEnv(MAME_TO_CHA_FIXTURE, identity);
}

async function defaultRunApplyCommit(identity: { managerUserId: string; staffUserId: string }): Promise<MameToChaCommitResult> {
  const { runMameToChaApplyCommitTransactionFromEnv } = await import('./mame-to-cha-write.js');
  return runMameToChaApplyCommitTransactionFromEnv(MAME_TO_CHA_FIXTURE, identity);
}

async function defaultRunVerify(identity: { managerUserId?: string; staffUserId?: string }): Promise<MameToChaVerifyReport> {
  const { runLocalMameToChaVerify } = await import('./mame-to-cha-verify.js');
  const databaseUrl = process.env.DATABASE_URL as string;
  return runLocalMameToChaVerify(databaseUrl, MAME_TO_CHA_FIXTURE, identity);
}

async function defaultRunCleanupDryRun(identity: { managerUserId: string; staffUserId: string }): Promise<MameToChaCleanupDryRunResult> {
  const { runMameToChaCleanupDryRunFromEnv } = await import('./mame-to-cha-cleanup.js');
  return runMameToChaCleanupDryRunFromEnv(MAME_TO_CHA_FIXTURE, identity);
}

async function defaultRunCleanupCommit(identity: { managerUserId: string; staffUserId: string }): Promise<MameToChaCleanupCommitResult> {
  const { runMameToChaCleanupCommitFromEnv } = await import('./mame-to-cha-cleanup.js');
  return runMameToChaCleanupCommitFromEnv(MAME_TO_CHA_FIXTURE, identity);
}

async function defaultRunAuthProvision(env: MameToChaAuthEnv): Promise<MameToChaAuthProvisionResult> {
  const { provisionMameToChaLocalAuthUsers, defaultBuildSupabaseAdminClient } = await import('./mame-to-cha-auth.js');
  return provisionMameToChaLocalAuthUsers(env, (url, key) => {
    // defaultBuildSupabaseAdminClient is async; wrap it so the sync builder
    // signature `provisionMameToChaLocalAuthUsers` expects still works via a
    // thin proxy that awaits lazily on first call.
    let clientPromise: ReturnType<typeof defaultBuildSupabaseAdminClient> | undefined;
    const ensure = () => (clientPromise ??= defaultBuildSupabaseAdminClient(url, key));
    return {
      listUsers: async (params) => (await ensure()).listUsers(params),
      createUser: async (params) => (await ensure()).createUser(params),
    };
  });
}

function renderEnvGuardLines(report: MameToChaEnvGuardReport): string[] {
  const lines: string[] = [];
  lines.push(`fixture tenant slug: ${report.fixtureTenantSlug}`);
  lines.push(`local db target: ${report.dbLocalTarget ? `${report.dbLocalTarget.target}:${report.dbLocalTarget.port}` : 'not confirmed'}`);
  for (const check of report.checks) {
    lines.push(`[${check.severity}] ${check.id}: ${check.ok ? 'pass' : 'fail'} -- ${check.message}`);
  }
  return lines;
}

/**
 * Routing entry point, free of `process.exit`/`console` so it is fully
 * unit-testable. Every path below is redacted by construction: it never
 * prints an env var value, a password, a service-role key, or a raw driver
 * error -- only fixture-owned labels, counts, and (for identity flags the
 * operator explicitly supplied on the command line) the auth user ids
 * needed to chain commands together.
 */
export async function runMameToChaRehearsalCli(
  argv: string[],
  deps: RehearsalCliDeps = {},
): Promise<RehearsalCliOutcome> {
  const env = deps.env ?? (process.env as MameToChaRehearsalEnv & MameToChaAuthEnv);
  const lines: string[] = [];

  const parsed = parseRehearsalCliArgs(argv);
  if (!parsed.ok) {
    return { exitCode: 1, path: 'parse-error', lines, errors: parsed.errors, connectionAttempted: false };
  }
  const { subcommand, confirmApply, confirmCleanup, cleanupDryRun, managerUserId, staffUserId } = parsed.value;
  if (subcommand === undefined || !(VALID_SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    return {
      exitCode: 1,
      path: 'unknown-subcommand',
      lines,
      errors: [`Unknown or missing subcommand (expected one of: ${VALID_SUBCOMMANDS.join(', ')}).`],
      connectionAttempted: false,
    };
  }

  selfCheckFixtureOrThrow();

  // auth-provision does not use the local DATABASE_URL guard at all -- it has
  // its own local-only Supabase URL guard, enforced inside the module.
  if (subcommand === 'auth-provision') {
    const runAuthProvision = deps.runAuthProvision ?? defaultRunAuthProvision;
    try {
      const result = await runAuthProvision(env);
      lines.push(`manager user id: ${result.managerUserId} (${result.managerCreated ? 'created' : 'found existing'})`);
      lines.push(`staff user id: ${result.staffUserId} (${result.staffCreated ? 'created' : 'found existing'})`);
      lines.push(NEVER_TOUCHED_CLOUD_LINE);
      return { exitCode: 0, path: 'auth-provision-ok', lines, errors: [], connectionAttempted: true };
    } catch (err) {
      return {
        exitCode: 1,
        path: 'auth-provision-error',
        lines,
        errors: [err instanceof Error ? err.message : 'Local Auth provisioning failed.'],
        connectionAttempted: true,
      };
    }
  }

  const envGuard = checkMameToChaLocalEnvironment(env, MAME_TO_CHA_FIXTURE);
  lines.push(...renderEnvGuardLines(envGuard));
  for (const warning of envGuard.warnings) lines.push(`warning: ${warning}`);

  if (!envGuard.ok) {
    return {
      exitCode: 1,
      path: 'env-guard-blocked',
      lines,
      errors: envGuard.blockedReasons,
      connectionAttempted: false,
    };
  }

  const plan = buildMameToChaFixturePlan(MAME_TO_CHA_FIXTURE, {});
  const summary = redactMameToChaPlanSummary(plan);
  const planLines = Object.entries(summary.operationCounts).map(([op, count]) => `plan ${op}: ${count}`);

  if (subcommand === 'apply') {
    if (managerUserId === undefined || staffUserId === undefined) {
      return {
        exitCode: 1,
        path: 'apply-missing-identity',
        lines,
        errors: ['apply requires --manager-user-id and --staff-user-id (explicit auth user ids; never resolved from email).'],
        connectionAttempted: false,
      };
    }
    const identity = { managerUserId, staffUserId };
    try {
      if (!confirmApply) {
        const runApplyDryRun = deps.runApplyDryRun ?? defaultRunApplyDryRun;
        const result = await runApplyDryRun(identity);
        lines.push('mode: apply (dry-run; always rolled back)');
        lines.push(...Object.entries(result.write.operationCounts).map(([op, count]) => `plan ${op}: ${count}`));
        lines.push('nothing was persisted -- re-run with --confirm-apply to persist for real');
        lines.push(NEVER_TOUCHED_CLOUD_LINE);
        return { exitCode: 0, path: 'apply-dry-run-ok', lines, errors: [], connectionAttempted: true };
      }
      const runApplyCommit = deps.runApplyCommit ?? defaultRunApplyCommit;
      const result = await runApplyCommit(identity);
      lines.push(`mode: apply (committed: ${result.committed})`);
      lines.push(...Object.entries(result.write.operationCounts).map(([op, count]) => `plan ${op}: ${count}`));
      lines.push(result.noop ? 'no-op: fixture already applied; nothing changed' : `applied: ${result.changedOperationCount} change(s), ${result.auditRowCount} audit row(s)`);
      lines.push(NEVER_TOUCHED_CLOUD_LINE);
      return { exitCode: 0, path: result.committed ? 'apply-committed' : 'apply-noop', lines, errors: [], connectionAttempted: true };
    } catch (err) {
      return {
        exitCode: 1,
        path: 'apply-error',
        lines,
        errors: [err instanceof Error ? err.message : 'Fixture apply failed.'],
        connectionAttempted: true,
      };
    }
  }

  if (subcommand === 'verify') {
    const runVerify = deps.runVerify ?? defaultRunVerify;
    try {
      const report = await runVerify({ managerUserId, staffUserId });
      for (const check of report.checks) {
        lines.push(`[${check.status}] ${check.id}: ${check.message}`);
      }
      lines.push(NEVER_TOUCHED_CLOUD_LINE);
      return {
        exitCode: report.ok ? 0 : 1,
        path: report.ok ? 'verify-ok' : 'verify-failed',
        lines,
        errors: report.failures,
        connectionAttempted: true,
      };
    } catch (err) {
      return {
        exitCode: 1,
        path: 'verify-error',
        lines,
        errors: [err instanceof Error ? err.message : 'Fixture verify failed.'],
        connectionAttempted: true,
      };
    }
  }

  if (subcommand === 'cleanup') {
    if (managerUserId === undefined || staffUserId === undefined) {
      return {
        exitCode: 1,
        path: 'cleanup-missing-identity',
        lines,
        errors: ['cleanup requires --manager-user-id and --staff-user-id to resolve which rows to remove.'],
        connectionAttempted: false,
      };
    }
    const identity = { managerUserId, staffUserId };
    if (!cleanupDryRun && !confirmCleanup) {
      return {
        exitCode: 1,
        path: 'cleanup-missing-mode',
        lines,
        errors: ['cleanup requires either --dry-run (preview only) or --confirm-cleanup (execute for real).'],
        connectionAttempted: false,
      };
    }
    try {
      if (cleanupDryRun) {
        const runCleanupDryRun = deps.runCleanupDryRun ?? defaultRunCleanupDryRun;
        const result = await runCleanupDryRun(identity);
        lines.push('mode: cleanup (dry-run; always rolled back)');
        lines.push(...result.plan.map((op) => `plan ${op.entity}: ${op.present ? 'would remove' : 'not present'} (${op.key})`));
        lines.push('protected tenant "mame-to-cha-tokyo" is never a match for any cleanup delete.');
        lines.push(NEVER_TOUCHED_CLOUD_LINE);
        return { exitCode: 0, path: 'cleanup-dry-run-ok', lines, errors: [], connectionAttempted: true };
      }
      const runCleanupCommit = deps.runCleanupCommit ?? defaultRunCleanupCommit;
      const result = await runCleanupCommit(identity);
      lines.push(`mode: cleanup (committed: ${result.committed})`);
      lines.push(result.noop ? 'no-op: nothing to remove' : `removed: ${result.removedCount} row(s)`);
      lines.push('the tenant, location, and tenant_modules rows are left in place by design.');
      lines.push(NEVER_TOUCHED_CLOUD_LINE);
      return { exitCode: 0, path: result.committed ? 'cleanup-committed' : 'cleanup-noop', lines, errors: [], connectionAttempted: true };
    } catch (err) {
      return {
        exitCode: 1,
        path: 'cleanup-error',
        lines,
        errors: [err instanceof Error ? err.message : 'Fixture cleanup failed.'],
        connectionAttempted: true,
      };
    }
  }

  // dry-run: env guard passed, so DATABASE_URL is confirmed local. Run the
  // read-only schema existence check (the only DB connection this path makes).
  const runSchemaCheck = deps.runSchemaCheck ?? defaultRunSchemaCheck;
  let schemaReport: SchemaCheckReport;
  try {
    schemaReport = await runSchemaCheck(env.DATABASE_URL as string);
  } catch (err) {
    return {
      exitCode: 1,
      path: 'schema-check-error',
      lines,
      errors: [err instanceof Error ? err.message : 'Local read-only schema check failed.'],
      connectionAttempted: true,
    };
  }

  lines.push(`schema check: ${schemaReport.ok ? 'PASS' : 'FAIL'}`);
  if (!schemaReport.ok) {
    lines.push(`missing: ${schemaReport.missing.join(', ')}`);
    return {
      exitCode: 1,
      path: 'schema-check-blocked',
      lines,
      errors: ['Required table/view/function missing; a migration may be needed -- reporting no-go rather than proceeding.'],
      connectionAttempted: true,
    };
  }

  lines.push('no migration needed (all required relations/functions exist)');
  lines.push('mode: dry-run');
  lines.push(...planLines);
  lines.push('no database rows were read or written by this dry-run beyond information_schema existence checks');
  lines.push(NEVER_TOUCHED_CLOUD_LINE);
  lines.push('No Supabase Auth user was created.');
  lines.push('No SQL mutation was executed.');

  return { exitCode: 0, path: 'dry-run-ok', lines, errors: [], connectionAttempted: true };
}

function printLine(message: string): void {
  console.log(`[mame-to-cha-rehearsal] ${message}`);
}

function printError(message: string): void {
  console.error(`[mame-to-cha-rehearsal] error: ${message}`);
}

async function main(): Promise<void> {
  printLine('Phase 1N-4C Slice C1 -- local onboarding rehearsal tooling');
  printLine('subcommands: dry-run | apply | verify | cleanup | auth-provision');

  const outcome = await runMameToChaRehearsalCli(process.argv.slice(2));
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
