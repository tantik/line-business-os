/**
 * Local onboarding PREFLIGHT aggregator (Phase 1H Stage 4A).
 *
 * SCOPE — this module is PURE and has ZERO I/O. It aggregates the existing
 * local-onboarding safety checks into a single, structured, redacted report so
 * a future operator wrapper (Stage 4B+) can present one fail-closed checklist.
 * It deliberately:
 *   - performs NO database reads or writes,
 *   - opens NO connection and imports NO database driver,
 *   - makes NO network calls and NO live Supabase / PostgREST probes,
 *   - touches NO filesystem (backup-artifact freshness is validated from
 *     operator-supplied METADATA only, never by reading the disk),
 *   - never reads `process.env`; every input arrives via {@link PreflightInputs}
 *     and every external effect is injected via {@link PreflightDeps}.
 *
 * It also NEVER returns secrets: the full `DATABASE_URL` (and its password) and
 * the full `NEXT_PUBLIC_SUPABASE_URL` (and any query/hash) never appear in the
 * report. Only a safe local DB target descriptor, a host-only Supabase value,
 * and a backup basename are surfaced.
 *
 * `buildPreflightReport` does NOT throw for normal validation failures — it maps
 * each failure to a structured check. It composes the pure local DB guard
 * (`assertLocalDatabaseUrl`) and the canonical backup naming/age contract, but
 * never calls the I/O backup gate (`validateBackupArtifactForCommit`) directly.
 */
import path from 'node:path';
import {
  assertLocalDatabaseUrl,
  validateTenantSlug,
  LOCATION_NAME_MAX_LENGTH,
  TENANT_NAME_MAX_LENGTH,
} from './onboard-tenant.js';
import type { SafeDbTarget } from './onboard-tenant.js';
import { BACKUP_ARTIFACT_EXTENSION, BACKUP_ARTIFACT_MAX_AGE_HOURS } from './onboard-backup-gate.js';
import { BACKUP_FILENAME_REGEX } from './backup.js';

/** Normalized target classification surfaced in the report. */
export type PreflightTarget = 'local' | 'cloud' | 'unknown';

/** Severity of a single check. `error` blocks; `warning`/`info` do not. */
export type CheckSeverity = 'error' | 'warning' | 'info';

/** A single, log-safe preflight check result (no secrets, no full URLs/paths). */
export interface PreflightCheck {
  id: string;
  ok: boolean;
  severity: CheckSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Operator-supplied backup-artifact METADATA (e.g. produced earlier by a
 * `statSync`), passed in so the aggregator can validate freshness/size purely.
 * The aggregator never reads the file itself.
 */
export interface BackupArtifactMetadataInput {
  exists?: boolean;
  isFile?: boolean;
  sizeBytes?: number;
  mtimeMs?: number;
}

/** All preflight inputs. Every field is operator-supplied and untrusted. */
export interface PreflightInputs {
  target: 'local' | 'cloud' | string;
  /** Local DB connection string. Validated by the guard; NEVER echoed. */
  databaseUrl?: string;
  backupArtifactPath?: string;
  backupArtifactMetadata?: BackupArtifactMetadataInput;
  /** Web env Supabase URL. Reported HOST-ONLY; query/hash never surfaced. */
  nextPublicSupabaseUrl?: string;
  commitRequested?: boolean;
  explicitYes?: boolean;
  explicitLocalWriteAcknowledgement?: boolean;
  modules?: string[];
  tenantSlug?: string;
  tenantName?: string;
  locationName?: string;
}

/** Injected external effects (all pure/deterministic; defaults are pure). */
export interface PreflightDeps {
  /** Pure local DB guard. Defaults to {@link assertLocalDatabaseUrl}. */
  assertLocalDatabaseUrl?: (databaseUrl: string) => SafeDbTarget;
  /** Absolute-path predicate. Defaults to {@link path.isAbsolute}. */
  isAbsolutePath?: (candidate: string) => boolean;
  /** URL parser. Defaults to the WHATWG `URL` constructor. */
  parseUrl?: (value: string) => URL;
  /** Clock used for backup freshness when metadata is supplied. */
  now?: Date;
}

/** Redacted, log-safe projection of the inputs (no secrets, no full URLs). */
export interface PreflightRedactedSummary {
  target: PreflightTarget;
  dbLocalTarget: SafeDbTarget | null;
  supabaseUrlHost: string | null;
  supabaseUrlIsCloudLike: boolean | null;
  commitRequested: boolean;
  commitConfirmations: {
    explicitYes: boolean;
    explicitLocalWriteAcknowledgement: boolean;
  };
  backupArtifactProvided: boolean;
  backupArtifactBasename: string | null;
  backupArtifactAbsolute: boolean | null;
  modules: string[];
  tenantSlug: string | null;
  tenantNameProvided: boolean;
  locationNameProvided: boolean;
}

/** The structured preflight report. */
export interface PreflightReport {
  ok: boolean;
  target: PreflightTarget;
  checks: PreflightCheck[];
  blockedReasons: string[];
  warnings: string[];
  redactedSummary: PreflightRedactedSummary;
}

/** Pure backup-artifact metadata validation result. */
export type BackupMetadataResult =
  | { ok: true; basename: string; ageHours: number | null }
  | { ok: false; error: string };

const MS_PER_HOUR = 60 * 60 * 1000;

/** Map an operator `target` string to the normalized classification. */
export function normalizePreflightTarget(target: string): PreflightTarget {
  if (target === 'local') return 'local';
  if (target === 'cloud') return 'cloud';
  return 'unknown';
}

/** True when a host is a Supabase Cloud-like host. */
function isCloudLikeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h.endsWith('.supabase.co') || h.endsWith('.pooler.supabase.com');
}

/**
 * Validate backup-artifact METADATA purely (no filesystem access). Mirrors the
 * canonical name/extension/size/age contract used by the I/O backup gate, but
 * operates only on the supplied path + metadata. Freshness is checked only when
 * an `mtimeMs` is provided.
 */
export function validateBackupArtifactMetadata(
  artifactPath: string,
  metadata: BackupArtifactMetadataInput | undefined,
  now: Date,
): BackupMetadataResult {
  const basename = path.basename(artifactPath);

  if (!basename.toLowerCase().endsWith(BACKUP_ARTIFACT_EXTENSION)) {
    return { ok: false, error: 'backup artifact must be an encrypted .dump.enc file.' };
  }
  if (!BACKUP_FILENAME_REGEX.test(basename)) {
    return {
      ok: false,
      error: 'backup artifact filename is invalid (expected linebos-YYYYMMDD-HHmmss.dump.enc).',
    };
  }

  if (metadata === undefined) {
    // Name/extension are valid; on-disk checks are deferred to run time.
    return { ok: true, basename, ageHours: null };
  }

  if (metadata.exists === false) {
    return { ok: false, error: 'backup artifact not found.' };
  }
  if (metadata.isFile === false) {
    return { ok: false, error: 'backup artifact is not a file.' };
  }
  if (typeof metadata.sizeBytes === 'number' && metadata.sizeBytes <= 0) {
    return { ok: false, error: 'backup artifact is empty.' };
  }

  let ageHours: number | null = null;
  if (typeof metadata.mtimeMs === 'number') {
    const ageMs = now.getTime() - metadata.mtimeMs;
    if (ageMs > BACKUP_ARTIFACT_MAX_AGE_HOURS * MS_PER_HOUR) {
      return {
        ok: false,
        error: 'backup artifact is too old (a fresh backup within 24 hours is required).',
      };
    }
    ageHours = ageMs / MS_PER_HOUR;
  }

  return { ok: true, basename, ageHours };
}

/**
 * Build a structured, redacted preflight report from operator inputs. PURE: no
 * I/O, no env reads, no throwing on normal validation failures. Every external
 * effect is injected (and defaults to a pure implementation).
 */
export function buildPreflightReport(
  inputs: PreflightInputs,
  deps: PreflightDeps = {},
): PreflightReport {
  const guardLocalUrl = deps.assertLocalDatabaseUrl ?? assertLocalDatabaseUrl;
  const isAbsolute = deps.isAbsolutePath ?? path.isAbsolute;
  const parseUrl = deps.parseUrl ?? ((value: string) => new URL(value));
  const now = deps.now ?? new Date();

  const checks: PreflightCheck[] = [];
  const target = normalizePreflightTarget(inputs.target);

  // --- Summary accumulators (redacted) -------------------------------------
  let dbLocalTarget: SafeDbTarget | null = null;
  let supabaseUrlHost: string | null = null;
  let supabaseUrlIsCloudLike: boolean | null = null;
  let backupArtifactBasename: string | null = null;
  let backupArtifactAbsolute: boolean | null = null;

  // 1. target must be local.
  checks.push({
    id: 'target.local',
    ok: target === 'local',
    severity: 'error',
    message:
      target === 'local'
        ? 'Target is local.'
        : 'Target must be local; Cloud/remote onboarding is out of scope for this stage.',
    details: { target },
  });

  // 2. DATABASE_URL / local DB guard must identify a local target.
  if (inputs.databaseUrl !== undefined && inputs.databaseUrl.trim() !== '') {
    try {
      const safeTarget = guardLocalUrl(inputs.databaseUrl);
      dbLocalTarget = safeTarget;
      checks.push({
        id: 'database.local-guard',
        ok: true,
        severity: 'error',
        message: 'DATABASE_URL points at the local database.',
        details: { target: safeTarget.target, port: safeTarget.port },
      });
    } catch (err) {
      // Guard messages are static and secret-free (no host/credentials).
      checks.push({
        id: 'database.local-guard',
        ok: false,
        severity: 'error',
        message: err instanceof Error ? err.message : 'DATABASE_URL is not a valid local target.',
      });
    }
  } else {
    checks.push({
      id: 'database.local-guard',
      ok: true,
      severity: 'info',
      message: 'DATABASE_URL not provided to preflight; it is validated at run time.',
    });
  }

  // 3 + 4. NEXT_PUBLIC_SUPABASE_URL parsed + reported HOST-ONLY. Cloud-looking
  // is a non-blocking warning (the web env may be restored to Cloud after local
  // verification); malformed is a non-blocking warning (must not crash).
  if (inputs.nextPublicSupabaseUrl !== undefined && inputs.nextPublicSupabaseUrl.trim() !== '') {
    try {
      const url = parseUrl(inputs.nextPublicSupabaseUrl);
      const host = url.hostname;
      const cloudLike = isCloudLikeHost(host);
      supabaseUrlHost = host;
      supabaseUrlIsCloudLike = cloudLike;
      checks.push({
        id: 'supabase.url-host',
        ok: true,
        severity: cloudLike ? 'warning' : 'info',
        message: cloudLike
          ? 'NEXT_PUBLIC_SUPABASE_URL host looks like Supabase Cloud (acceptable if the web env is intentionally restored to Cloud after local verification).'
          : 'NEXT_PUBLIC_SUPABASE_URL host parsed.',
        details: { host, cloudLike },
      });
    } catch {
      checks.push({
        id: 'supabase.url-host',
        ok: true,
        severity: 'warning',
        message: 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL; could not extract a host.',
      });
    }
  } else {
    checks.push({
      id: 'supabase.url-host',
      ok: true,
      severity: 'info',
      message: 'NEXT_PUBLIC_SUPABASE_URL not provided to preflight.',
    });
  }

  // 5-8. Commit-only gates (presence/format only; no DB interaction).
  const commitRequested = inputs.commitRequested === true;
  const explicitYes = inputs.explicitYes === true;
  const explicitLocalWriteAcknowledgement = inputs.explicitLocalWriteAcknowledgement === true;

  if (inputs.backupArtifactPath !== undefined && inputs.backupArtifactPath.trim() !== '') {
    backupArtifactBasename = path.basename(inputs.backupArtifactPath.trim());
    backupArtifactAbsolute = isAbsolute(inputs.backupArtifactPath.trim());
  }

  if (commitRequested) {
    const hasPath =
      inputs.backupArtifactPath !== undefined && inputs.backupArtifactPath.trim() !== '';

    // 5. backup artifact path must be present for a commit.
    checks.push({
      id: 'commit.backup-path-present',
      ok: hasPath,
      severity: 'error',
      message: hasPath
        ? 'Backup artifact path provided.'
        : 'Backup artifact path is required for a commit (--backup-artifact <path>).',
    });

    // 6. backup artifact path must be absolute for a commit.
    if (hasPath) {
      const absolute = backupArtifactAbsolute === true;
      checks.push({
        id: 'commit.backup-path-absolute',
        ok: absolute,
        severity: 'error',
        message: absolute
          ? 'Backup artifact path is absolute.'
          : 'Backup artifact path must be absolute for a commit.',
        details: { absolute },
      });

      // 7. backup metadata validation (name always; freshness/size if provided).
      const metaResult = validateBackupArtifactMetadata(
        inputs.backupArtifactPath!.trim(),
        inputs.backupArtifactMetadata,
        now,
      );
      checks.push(
        metaResult.ok
          ? {
              id: 'commit.backup-artifact',
              ok: true,
              severity: inputs.backupArtifactMetadata === undefined ? 'warning' : 'info',
              message:
                inputs.backupArtifactMetadata === undefined
                  ? 'Backup artifact name is valid; on-disk metadata not provided (validated at run time).'
                  : 'Backup artifact metadata is valid (fresh, non-empty, correctly named).',
              details: { basename: metaResult.basename, ageHours: metaResult.ageHours },
            }
          : {
              id: 'commit.backup-artifact',
              ok: false,
              severity: 'error',
              message: metaResult.error,
            },
      );
    }

    // 8. commit confirmations.
    checks.push({
      id: 'commit.explicit-yes',
      ok: explicitYes,
      severity: 'error',
      message: explicitYes
        ? 'Explicit --yes confirmation present.'
        : 'Commit requires explicit --yes confirmation.',
    });
    checks.push({
      id: 'commit.local-write-ack',
      ok: explicitLocalWriteAcknowledgement,
      severity: 'error',
      message: explicitLocalWriteAcknowledgement
        ? 'Local write acknowledgement present.'
        : 'Commit requires --i-understand-this-writes-local-db acknowledgement.',
    });
  } else {
    checks.push({
      id: 'commit.requested',
      ok: true,
      severity: 'info',
      message: 'Commit not requested; commit gates are skipped (dry-run / preflight only).',
    });
  }

  // 9. Tenant / location field presence + format (only when provided).
  if (inputs.tenantSlug !== undefined) {
    const slug = validateTenantSlug(inputs.tenantSlug);
    checks.push({
      id: 'tenant.slug',
      ok: slug.ok,
      severity: 'error',
      message: slug.ok ? 'Tenant slug is valid.' : slug.error,
    });
  }
  if (inputs.tenantName !== undefined) {
    const value = typeof inputs.tenantName === 'string' ? inputs.tenantName.trim() : '';
    const ok = value.length > 0 && value.length <= TENANT_NAME_MAX_LENGTH;
    checks.push({
      id: 'tenant.name',
      ok,
      severity: 'error',
      message: ok
        ? 'Tenant name is present.'
        : `Tenant name must be 1-${TENANT_NAME_MAX_LENGTH} characters.`,
    });
  }
  if (inputs.locationName !== undefined) {
    const value = typeof inputs.locationName === 'string' ? inputs.locationName.trim() : '';
    const ok = value.length > 0 && value.length <= LOCATION_NAME_MAX_LENGTH;
    checks.push({
      id: 'location.name',
      ok,
      severity: 'error',
      message: ok
        ? 'Location name is present.'
        : `Location name must be 1-${LOCATION_NAME_MAX_LENGTH} characters.`,
    });
  }

  const blockedReasons = checks.filter((c) => !c.ok && c.severity === 'error').map((c) => c.message);
  const warnings = checks.filter((c) => c.severity === 'warning').map((c) => c.message);

  const redactedSummary: PreflightRedactedSummary = {
    target,
    dbLocalTarget,
    supabaseUrlHost,
    supabaseUrlIsCloudLike,
    commitRequested,
    commitConfirmations: { explicitYes, explicitLocalWriteAcknowledgement },
    backupArtifactProvided: backupArtifactBasename !== null,
    backupArtifactBasename,
    backupArtifactAbsolute,
    modules: Array.isArray(inputs.modules) ? [...inputs.modules] : [],
    tenantSlug: typeof inputs.tenantSlug === 'string' ? inputs.tenantSlug : null,
    tenantNameProvided: typeof inputs.tenantName === 'string' && inputs.tenantName.trim() !== '',
    locationNameProvided:
      typeof inputs.locationName === 'string' && inputs.locationName.trim() !== '',
  };

  return {
    ok: blockedReasons.length === 0,
    target,
    checks,
    blockedReasons,
    warnings,
    redactedSummary,
  };
}
