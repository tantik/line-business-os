import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_ARTIFACT_EXTENSION,
  BACKUP_ARTIFACT_MAX_AGE_HOURS,
  validateBackupArtifactForCommit,
} from './onboard-backup-gate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A filename that matches the canonical backup contract from backup.ts. */
const VALID_BACKUP_NAME = 'linebos-20260101-090500.dump.enc';

const HOUR_MS = 60 * 60 * 1000;

/** Create a throwaway temp dir; cleaned up after the test via `t.after`. */
function tempDir(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lbos-3c4a-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write a non-empty file and return its path (mtime defaults to now). */
function writeFreshFile(dir: string, name: string): string {
  const full = path.join(dir, name);
  writeFileSync(full, 'not-a-real-backup-payload');
  return full;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('BACKUP_ARTIFACT_MAX_AGE_HOURS is 24 and the extension is .dump.enc', () => {
  assert.equal(BACKUP_ARTIFACT_MAX_AGE_HOURS, 24);
  assert.equal(BACKUP_ARTIFACT_EXTENSION, '.dump.enc');
});

// ---------------------------------------------------------------------------
// Required / shape failures (no fs needed)
// ---------------------------------------------------------------------------

test('missing path is rejected', () => {
  for (const input of [undefined, '', '   ']) {
    const result = validateBackupArtifactForCommit(input);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /required/i.test(result.error));
  }
});

test('wrong extension is rejected', () => {
  const result = validateBackupArtifactForCommit('/tmp/linebos-20260101-090500.txt');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /\.dump\.enc/i.test(result.error));
});

test('invalid backup filename (valid extension, wrong stem) is rejected', () => {
  const result = validateBackupArtifactForCommit('/tmp/not-a-backup.dump.enc');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /filename is invalid/i.test(result.error));
});

// ---------------------------------------------------------------------------
// Filesystem metadata failures (temp files only)
// ---------------------------------------------------------------------------

test('a non-existent file is reported as not found', (t) => {
  const dir = tempDir(t);
  const missing = path.join(dir, VALID_BACKUP_NAME);
  const result = validateBackupArtifactForCommit(missing);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /not found/i.test(result.error));
});

test('a directory is rejected as not a file', (t) => {
  const dir = tempDir(t);
  const asDir = path.join(dir, VALID_BACKUP_NAME);
  mkdirSync(asDir);
  const result = validateBackupArtifactForCommit(asDir);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /not a file/i.test(result.error));
});

test('an empty file is rejected', (t) => {
  const dir = tempDir(t);
  const empty = path.join(dir, VALID_BACKUP_NAME);
  writeFileSync(empty, '');
  const result = validateBackupArtifactForCommit(empty);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /empty/i.test(result.error));
});

test('a file older than 24 hours is rejected', (t) => {
  const dir = tempDir(t);
  const full = writeFreshFile(dir, VALID_BACKUP_NAME);
  const now = new Date('2026-06-27T12:00:00.000Z');
  const old = new Date(now.getTime() - 25 * HOUR_MS);
  utimesSync(full, old, old);
  const result = validateBackupArtifactForCommit(full, now);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && /too old/i.test(result.error));
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

test('a fresh, non-empty, correctly-named artifact passes (basename only)', (t) => {
  const dir = tempDir(t);
  const full = writeFreshFile(dir, VALID_BACKUP_NAME);
  // Pin mtime + now so the computed age is deterministic (avoids clock/mtime
  // rounding flakiness on a just-created file).
  const mtime = new Date('2026-06-27T12:00:00.000Z');
  utimesSync(full, mtime, mtime);
  const now = new Date(mtime.getTime() + 2 * HOUR_MS);
  const result = validateBackupArtifactForCommit(full, now);
  assert.ok(result.ok);
  assert.equal(result.ok && result.basename, VALID_BACKUP_NAME);
  assert.ok(result.ok && result.ageHours > 1.5 && result.ageHours < BACKUP_ARTIFACT_MAX_AGE_HOURS);
});

test('the injected `now` controls the freshness window', (t) => {
  const dir = tempDir(t);
  const full = writeFreshFile(dir, VALID_BACKUP_NAME);
  const mtime = new Date('2026-06-27T12:00:00.000Z');
  utimesSync(full, mtime, mtime);

  // 1 hour later → fresh.
  const fresh = validateBackupArtifactForCommit(full, new Date(mtime.getTime() + 1 * HOUR_MS));
  assert.ok(fresh.ok);

  // 25 hours later → too old.
  const stale = validateBackupArtifactForCommit(full, new Date(mtime.getTime() + 25 * HOUR_MS));
  assert.equal(stale.ok, false);
});

// ---------------------------------------------------------------------------
// Redaction: errors must never echo the full path
// ---------------------------------------------------------------------------

test('error messages never include the full artifact path', (t) => {
  const dir = tempDir(t);
  const missing = path.join(dir, VALID_BACKUP_NAME);
  const result = validateBackupArtifactForCommit(missing);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && !result.error.includes(dir), 'error leaked the directory path');
  assert.ok(!result.ok && !result.error.includes(missing), 'error leaked the full path');
});

// ---------------------------------------------------------------------------
// Source guards
// ---------------------------------------------------------------------------

test('onboard-backup-gate.ts reads no file contents and never decrypts/uploads', () => {
  const source = readFileSync(path.join(HERE, 'onboard-backup-gate.ts'), 'utf8');
  // Identifier-level checks (not prose) so the safety docstring itself is fine.
  assert.ok(
    !/\b(readFileSync|readFile|createReadStream|readSync|openSync)\b/.test(source),
    'must not read file contents (metadata only)',
  );
  assert.ok(!/node:crypto|createDecipher/i.test(source), 'must not decrypt (no crypto)');
  assert.ok(
    !/node:(?:http|https|net|dgram|tls)\b|\bfetch\s*\(/.test(source),
    'must not perform network I/O (no upload)',
  );
});

test('onboard-backup-gate.ts has no DB driver / service_role / Supabase client', () => {
  const source = readFileSync(path.join(HERE, 'onboard-backup-gate.ts'), 'utf8');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg'");
  assert.ok(!/from\s+['"]postgres['"]/.test(source), "must not import 'postgres'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
});

test('onboard-backup-gate.ts contains no destructive SQL tokens', () => {
  const source = readFileSync(path.join(HERE, 'onboard-backup-gate.ts'), 'utf8');
  assert.ok(!/\b(delete|truncate|drop|alter|grant|rollback)\b/i.test(source), 'destructive token present');
});
