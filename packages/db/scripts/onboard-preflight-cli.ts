/**
 * Local onboarding PREFLIGHT report-only CLI (Phase 1H Stage 4B).
 *
 * SCOPE — this is a REPORT-ONLY operator wrapper around the PURE Stage 4A
 * aggregator {@link buildPreflightReport}. It exists so an operator can see one
 * fail-closed checklist before doing anything. It deliberately:
 *   - performs NO onboarding, NO dry-run, and NO commit,
 *   - performs NO database reads or writes and opens NO connection,
 *   - imports NO database driver (`pg`) and NO Supabase client,
 *   - imports NONE of the I/O onboarding modules (`onboard-write`,
 *     `onboard-commit`, `onboard-db`, `onboard-backup-gate`),
 *   - makes NO network calls and NO live Supabase / PostgREST probes,
 *   - touches NO filesystem (it never `stat`s the backup artifact; only the
 *     operator-supplied PATH is inspected, name-only, via the pure aggregator),
 *   - never reads `process.env` for secrets — every input arrives via explicit
 *     `--flag value` arguments.
 *
 * It also NEVER prints secrets. The full `--database-url` (and its password) and
 * the full `--next-public-supabase-url` (with any path/query/hash/userinfo)
 * never appear in the output. Only the safe local DB target descriptor, a
 * host-only Supabase value, and a backup BASENAME are surfaced — exactly the
 * redaction the pure aggregator already guarantees.
 *
 * Exit code: 0 when the report is ok (no blocking checks), non-zero otherwise.
 * Warnings alone never fail the run.
 */
import { pathToFileURL } from 'node:url';
import {
  buildPreflightReport,
  type PreflightCheck,
  type PreflightInputs,
  type PreflightReport,
} from './onboard-preflight.js';

/** Aggregated parse result (collects every flag error). */
export type CliParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Raw, parsed CLI flags (still untrusted; validated by the pure aggregator). */
export interface PreflightCliFlags {
  target?: string;
  databaseUrl?: string;
  backupArtifact?: string;
  nextPublicSupabaseUrl?: string;
  commit: boolean;
  yes: boolean;
  iUnderstandThisWritesLocalDb: boolean;
  tenantSlug?: string;
  tenantName?: string;
  locationName?: string;
  modules: string[];
}

type PreflightStringFlag =
  | 'target'
  | 'databaseUrl'
  | 'backupArtifact'
  | 'nextPublicSupabaseUrl'
  | 'tenantSlug'
  | 'tenantName'
  | 'locationName';

/** Map of `--flag` → string field for value-taking args. */
const VALUE_FLAG_MAP: Record<string, PreflightStringFlag> = {
  '--target': 'target',
  '--database-url': 'databaseUrl',
  '--backup-artifact': 'backupArtifact',
  '--next-public-supabase-url': 'nextPublicSupabaseUrl',
  '--tenant-slug': 'tenantSlug',
  '--tenant-name': 'tenantName',
  '--location-name': 'locationName',
};

/** Map of `--flag` → boolean field for switch args. */
const BOOLEAN_FLAG_MAP: Record<string, 'commit' | 'yes' | 'iUnderstandThisWritesLocalDb'> = {
  '--commit': 'commit',
  '--yes': 'yes',
  '--i-understand-this-writes-local-db': 'iUnderstandThisWritesLocalDb',
};

/** The repeatable module flag. */
const MODULE_FLAG = '--module';

/**
 * Parse raw CLI argv (already sliced past node + script path) into flags. Fails
 * safe on: unknown flags, positional args, and missing values. Never echoes a
 * positional value (it could be misplaced PII / a secret); only flag-shaped
 * tokens (`--foo`) are named in errors. `--module` is repeatable.
 */
export function parsePreflightCliArgs(argv: string[]): CliParseResult<PreflightCliFlags> {
  const errors: string[] = [];
  const flags: PreflightCliFlags = {
    commit: false,
    yes: false,
    iUnderstandThisWritesLocalDb: false,
    modules: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;

    const valueKey = Object.hasOwn(VALUE_FLAG_MAP, token) ? VALUE_FLAG_MAP[token] : undefined;
    const booleanKey = Object.hasOwn(BOOLEAN_FLAG_MAP, token) ? BOOLEAN_FLAG_MAP[token] : undefined;

    if (token === MODULE_FLAG) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        errors.push(`Missing value for ${token}.`);
        continue; // do not consume the next token
      }
      flags.modules.push(next);
      i += 1;
    } else if (valueKey !== undefined) {
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
 * Map the parsed flags onto the pure aggregator's {@link PreflightInputs}.
 * Report-only: the backup artifact is NEVER `stat`ed, so no on-disk metadata is
 * supplied (the aggregator validates the name only and defers freshness/size to
 * run time). Optional tenant/location fields are passed through only when given,
 * so their per-field checks appear only when the operator supplied them.
 */
export function buildPreflightInputsFromFlags(flags: PreflightCliFlags): PreflightInputs {
  const inputs: PreflightInputs = {
    // An absent --target stays empty so it classifies as `unknown` and blocks
    // (fail-closed); the operator must explicitly opt into `--target local`.
    target: flags.target ?? '',
    commitRequested: flags.commit,
    explicitYes: flags.yes,
    explicitLocalWriteAcknowledgement: flags.iUnderstandThisWritesLocalDb,
    modules: flags.modules,
  };

  if (flags.databaseUrl !== undefined) inputs.databaseUrl = flags.databaseUrl;
  if (flags.backupArtifact !== undefined) inputs.backupArtifactPath = flags.backupArtifact;
  if (flags.nextPublicSupabaseUrl !== undefined) {
    inputs.nextPublicSupabaseUrl = flags.nextPublicSupabaseUrl;
  }
  if (flags.tenantSlug !== undefined) inputs.tenantSlug = flags.tenantSlug;
  if (flags.tenantName !== undefined) inputs.tenantName = flags.tenantName;
  if (flags.locationName !== undefined) inputs.locationName = flags.locationName;

  return inputs;
}

/** Map a single check to its display label. */
function checkLabel(check: PreflightCheck): 'PASS' | 'BLOCKED' | 'WARN' | 'INFO' {
  if (!check.ok) return 'BLOCKED';
  if (check.severity === 'warning') return 'WARN';
  if (check.severity === 'info') return 'INFO';
  return 'PASS';
}

/**
 * Format a {@link PreflightReport} into human-readable, log-safe lines. It only
 * reads already-redacted report fields (static, secret-free check messages; the
 * host-only Supabase value; the safe DB target; the backup basename), so no raw
 * input value can leak through the formatter.
 */
export function formatPreflightReport(report: PreflightReport): string[] {
  const lines: string[] = [];
  const summary = report.redactedSummary;

  lines.push('LINE Business OS local onboarding preflight');
  lines.push('Mode: report-only');
  lines.push(
    'Note: report-only — this does NOT run onboarding, dry-run, or commit, and performs no database, filesystem, or network I/O.',
  );
  lines.push(`Target: ${report.target}`);
  lines.push(`Status: ${report.ok ? 'PASS' : 'BLOCKED'}`);

  lines.push('Checks:');
  for (const check of report.checks) {
    lines.push(`- [${checkLabel(check)}] ${check.id} — ${check.message}`);
  }

  lines.push('Warnings:');
  if (report.warnings.length === 0) {
    lines.push('- (none)');
  } else {
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  lines.push('Blocked reasons:');
  if (report.blockedReasons.length === 0) {
    lines.push('- (none)');
  } else {
    for (const reason of report.blockedReasons) lines.push(`- ${reason}`);
  }

  lines.push('Redacted summary:');
  lines.push(
    `- dbTarget: ${
      summary.dbLocalTarget
        ? `${summary.dbLocalTarget.target}:${summary.dbLocalTarget.port}`
        : 'not-checked'
    }`,
  );
  lines.push(`- supabaseHost: ${summary.supabaseUrlHost ?? 'not-provided'}`);
  lines.push(`- backupArtifact: ${summary.backupArtifactBasename ?? 'not-provided'}`);
  lines.push(`- modules: ${summary.modules.length > 0 ? summary.modules.join(', ') : '(none)'}`);

  return lines;
}

/** Injectable dependencies for {@link runPreflightCli} (pure; deterministic in tests). */
export interface PreflightCliDeps {
  /** Clock handed to the pure aggregator (for deterministic freshness tests). */
  now?: Date;
  /** The report builder. Defaults to the pure {@link buildPreflightReport}. */
  buildReport?: (inputs: PreflightInputs, deps: { now?: Date }) => PreflightReport;
}

/** Redacted, log-safe outcome of a report-only CLI run. */
export interface PreflightCliOutcome {
  /** 0 when the report is ok; 1 when it is blocked or the args were invalid. */
  exitCode: 0 | 1;
  ok: boolean;
  lines: string[];
  errors: string[];
}

/**
 * Report-only preflight CLI routing, free of `process.exit` and `console` so it
 * is fully unit-testable. Parses args, maps them onto the pure aggregator's
 * inputs, builds the report, and formats it. It performs NO I/O of any kind and
 * never invokes the onboarding/dry-run/commit code paths.
 */
export function runPreflightCli(
  argv: string[],
  deps: PreflightCliDeps = {},
): PreflightCliOutcome {
  const parsed = parsePreflightCliArgs(argv);
  if (!parsed.ok) {
    return {
      exitCode: 1,
      ok: false,
      lines: ['LINE Business OS local onboarding preflight', 'Mode: report-only'],
      errors: parsed.errors,
    };
  }

  const buildReport = deps.buildReport ?? buildPreflightReport;
  const inputs = buildPreflightInputsFromFlags(parsed.value);
  const report = buildReport(inputs, { now: deps.now });

  return {
    exitCode: report.ok ? 0 : 1,
    ok: report.ok,
    lines: formatPreflightReport(report),
    errors: [],
  };
}

/** Injectable output/error writers (default to `console`). */
export interface PreflightCliWriters {
  out?: (line: string) => void;
  err?: (line: string) => void;
}

/**
 * Emit an outcome through injectable writers. Errors are written to `err`; the
 * report lines to `out`. Used by the thin `main` wrapper and by tests (with
 * array-collecting writers) to avoid spawning a shell.
 */
export function emitPreflightOutcome(
  outcome: PreflightCliOutcome,
  writers: PreflightCliWriters = {},
): void {
  const out = writers.out ?? ((line: string) => console.log(line));
  const err = writers.err ?? ((line: string) => console.error(line));
  for (const message of outcome.errors) err(`error: ${message}`);
  for (const line of outcome.lines) out(line);
}

/**
 * Thin CLI entrypoint. Delegates routing to {@link runPreflightCli}, prints the
 * redacted lines/errors, and exits with the report's exit code. No DB driver, no
 * connection, no onboarding execution — report-only.
 */
function main(): void {
  const outcome = runPreflightCli(process.argv.slice(2));
  emitPreflightOutcome(outcome);
  process.exit(outcome.exitCode);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
