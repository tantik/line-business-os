/**
 * Backup-artifact validation gate for FUTURE committed onboarding
 * (Phase 1H Stage 3c-4a).
 *
 * SCOPE — this is a PURE filesystem METADATA gate. It validates an
 * operator-supplied backup artifact path so that a future committed (durable)
 * onboarding run can require a fresh, encrypted backup BEFORE it ever connects
 * to a database. In Stage 3c-4a there is still NO committed onboarding and NO
 * `COMMIT`; this only prepares the gate.
 *
 * This module deliberately:
 *   - reads only file METADATA (`statSync`) — it NEVER reads file contents,
 *   - NEVER decrypts the backup (no key material is touched here),
 *   - NEVER uploads the backup anywhere,
 *   - NEVER runs a backup (`pnpm db:backup` stays a separate operator step),
 *   - NEVER imports a DB driver and NEVER opens any connection,
 *   - returns short, static, secret-free messages and never echoes the full
 *     artifact path (only the basename is ever surfaced, and only on success).
 *
 * It reuses the canonical backup naming contract from `./backup.ts`
 * (`BACKUP_FILENAME_REGEX`) so a valid artifact must look like a real encrypted
 * backup produced by the local backup tool (`linebos-YYYYMMDD-HHmmss.dump.enc`).
 */
import { statSync } from 'node:fs';
import path from 'node:path';
import { BACKUP_FILENAME_REGEX } from './backup.js';

/** Maximum accepted age of a backup artifact before a fresh backup is required. */
export const BACKUP_ARTIFACT_MAX_AGE_HOURS = 24;

/** Required extension for an encrypted backup artifact. */
export const BACKUP_ARTIFACT_EXTENSION = '.dump.enc';

/**
 * Result of validating a backup artifact. On success it carries only the
 * basename (never the full path) and the computed age in hours — both log-safe.
 */
export type BackupArtifactValidationResult =
  | { ok: true; basename: string; ageHours: number }
  | { ok: false; error: string };

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Validate that `artifactPath` points at a fresh, non-empty, correctly-named
 * encrypted backup file — using FILE METADATA ONLY. Pure: no file contents are
 * read, no decryption, no upload, no DB connection. `now` is injectable so the
 * 24-hour freshness window is deterministically testable.
 *
 * Order of checks is string-first (cheap, no fs) then metadata, so each failure
 * maps to a single, distinct, secret-free message. The full path is never
 * included in any message.
 */
export function validateBackupArtifactForCommit(
  artifactPath: string | undefined,
  now: Date = new Date(),
): BackupArtifactValidationResult {
  if (artifactPath === undefined || artifactPath.trim() === '') {
    return { ok: false, error: 'backup artifact is required (--backup-artifact <path>).' };
  }

  const trimmed = artifactPath.trim();
  const basename = path.basename(trimmed);

  // Extension first (no fs): must be an encrypted .dump.enc artifact.
  if (!basename.toLowerCase().endsWith(BACKUP_ARTIFACT_EXTENSION)) {
    return { ok: false, error: 'backup artifact must be an encrypted .dump.enc file.' };
  }

  // Prefer the canonical backup filename contract from backup.ts.
  if (!BACKUP_FILENAME_REGEX.test(basename)) {
    return {
      ok: false,
      error: 'backup artifact filename is invalid (expected linebos-YYYYMMDD-HHmmss.dump.enc).',
    };
  }

  // Metadata only — never read the file contents.
  let stats;
  try {
    stats = statSync(trimmed, { throwIfNoEntry: false });
  } catch {
    return { ok: false, error: 'backup artifact could not be accessed.' };
  }
  if (stats === undefined) {
    return { ok: false, error: 'backup artifact not found.' };
  }
  if (!stats.isFile()) {
    return { ok: false, error: 'backup artifact is not a file.' };
  }
  if (stats.size <= 0) {
    return { ok: false, error: 'backup artifact is empty.' };
  }

  const ageMs = now.getTime() - stats.mtime.getTime();
  if (ageMs > BACKUP_ARTIFACT_MAX_AGE_HOURS * MS_PER_HOUR) {
    return {
      ok: false,
      error: 'backup artifact is too old (a fresh backup within 24 hours is required).',
    };
  }

  return { ok: true, basename, ageHours: ageMs / MS_PER_HOUR };
}
