/**
 * Local daily logical backup (Phase 1H Stage 2).
 *
 * Produces an ENCRYPTED, custom-format `pg_dump` of the application database and
 * writes it to a gitignored `backups/` folder. This is a LOCAL manual tool:
 *
 *   pnpm db:backup
 *
 * Scope and safety:
 * - Includes only the application + auth schemas (see BACKUP_SCHEMAS). Managed /
 *   secret Supabase schemas (vault, pgsodium, realtime, extensions, graphql*,
 *   supabase_functions, supabase_migrations, cron, net, pgbouncer, system
 *   catalogs) are intentionally NOT dumped.
 * - The DB connection comes from DATABASE_URL but is NEVER logged. Connection
 *   values are passed to pg_dump through child-process PG* env vars, never as CLI
 *   arguments, so the password never appears in process listings.
 * - Backups may contain PII, so the dump is encrypted at rest with AES-256-GCM
 *   using BACKUP_ENCRYPTION_KEY (base64-encoded 32-byte key). The plaintext dump
 *   is streamed straight into the cipher and never touches disk unencrypted.
 * - Do NOT run this against Supabase Cloud unless explicitly approved. There is
 *   no restore implemented in this stage.
 *
 * Encrypted file layout (self-describing, contains no secrets):
 *   [ 8 bytes  ] magic + version  : ASCII "LBOSBK01" (01 => aes-256-gcm)
 *   [ 12 bytes ] IV (nonce)       : random per backup
 *   [ N bytes  ] ciphertext       : AES-256-GCM(pg_dump custom-format archive)
 *   [ 16 bytes ] GCM auth tag     : trailing
 *
 * Required env: DATABASE_URL, BACKUP_ENCRYPTION_KEY
 * Optional env: BACKUP_OUTPUT_DIR (default: repo-root "backups/"),
 *               BACKUP_RETENTION_COUNT (default 7, never below 7)
 */
import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Readable } from 'node:stream';

/** Schemas captured by the backup: application schemas + auth. */
export const BACKUP_SCHEMAS = [
  'core',
  'audit',
  'workforce',
  'booking',
  'ai',
  'public',
  'api',
  'auth',
] as const;

/** Minimum number of daily backups to retain. Never go below this. */
export const MIN_RETENTION = 7;

/**
 * Repo root, derived from this script's own location
 * (`packages/db/scripts/backup.ts` -> three levels up). Anchoring to the
 * script path makes the default output deterministic regardless of the process
 * cwd: `pnpm --filter @line-os/db backup` runs with cwd = `packages/db`, which
 * would otherwise resolve a relative `backups/` to `packages/db/backups/`.
 */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

/** Name of the default backups directory (under the repo root). Gitignored. */
export const DEFAULT_BACKUP_DIRNAME = 'backups';

/**
 * Default output directory: `<repo-root>/backups`. Absolute and
 * cwd-independent. Gitignored.
 */
export const DEFAULT_OUTPUT_DIR = path.resolve(REPO_ROOT, DEFAULT_BACKUP_DIRNAME);

/**
 * Resolve the backup output directory.
 * - If `override` (BACKUP_OUTPUT_DIR) is set and non-empty, it is used verbatim
 *   as an explicit override. Relative overrides resolve against the current
 *   working directory, preserving prior behavior for explicit opt-in.
 * - Otherwise the default is the repo-root `backups/` directory, never a
 *   package-local `packages/db/backups/`. process.cwd() is NOT used for the
 *   default.
 */
export function resolveOutputDir(override: string | undefined): string {
  if (override !== undefined && override.trim() !== '') {
    return override;
  }
  return DEFAULT_OUTPUT_DIR;
}

/** AES-256-GCM, 12-byte IV, 16-byte tag (matches @line-os/db crypto). */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/** Magic + format version prepended to every encrypted backup. */
export const BACKUP_MAGIC = Buffer.from('LBOSBK01', 'ascii');

/** Sortable, timestamped backup file name pattern. */
export const BACKUP_FILENAME_REGEX = /^linebos-\d{8}-\d{6}\.dump\.enc$/;

/**
 * Validate BACKUP_ENCRYPTION_KEY and return the raw 32-byte key. Throws a safe
 * error (never echoes the key value) if missing or not a base64 32-byte key.
 */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('BACKUP_ENCRYPTION_KEY is required (base64-encoded 32-byte key).');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  return key;
}

/**
 * Resolve the retention count. Defaults to MIN_RETENTION and is clamped so it
 * can never drop below MIN_RETENTION (invalid / non-integer / too-small values
 * all fall back to MIN_RETENTION).
 */
export function resolveRetentionCount(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return MIN_RETENTION;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < MIN_RETENTION) return MIN_RETENTION;
  return parsed;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Build a sortable, UTC-based backup file name, e.g.
 * `linebos-20260101-090500.dump.enc`. UTC keeps names monotonic regardless of
 * the operator's local timezone / DST.
 */
export function buildBackupFilename(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `linebos-${y}${mo}${d}-${h}${mi}${s}.dump.enc`;
}

/**
 * Build pg_dump arguments: custom/compressed format, restore-portable, and an
 * explicit per-schema include list. Connection details are intentionally NOT
 * here — they travel via PG* env vars so the password never lands in argv.
 */
export function buildPgDumpArgs(schemas: readonly string[]): string[] {
  const args = ['-Fc', '--no-owner', '--no-privileges'];
  for (const schema of schemas) {
    args.push(`--schema=${schema}`);
  }
  return args;
}

/**
 * Parse a Postgres connection URL into PG* environment values for pg_dump. The
 * full URL is never returned or logged; the password lives only in PGPASSWORD
 * (env), never in argv. Throws a safe error on an invalid URL.
 */
export function parseDatabaseUrl(databaseUrl: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }
  const env: Record<string, string> = {};
  if (url.hostname) env.PGHOST = url.hostname;
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, '');
  if (database) env.PGDATABASE = decodeURIComponent(database);
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

/**
 * Given a directory listing and a retention count, return the file names that
 * should be pruned (oldest first), keeping the newest `retention` backups.
 * Only files matching BACKUP_FILENAME_REGEX are ever considered. Retention is
 * clamped to MIN_RETENTION as a final safety net.
 */
export function selectFilesToPrune(filenames: string[], retention: number): string[] {
  const keep = retention < MIN_RETENTION ? MIN_RETENTION : retention;
  const matching = filenames.filter((name) => BACKUP_FILENAME_REGEX.test(name)).sort();
  if (matching.length <= keep) return [];
  return matching.slice(0, matching.length - keep);
}

/**
 * Safe, operational log lines. Contain only static text, the backup path, and
 * counts — never the DB URL, credentials, or row data.
 */
export function safeBackupMessages(backupPath: string, retention: number, removed: number): string[] {
  return [
    'backup started',
    'pg_dump completed',
    'encrypted backup written',
    `retention applied (kept newest ${retention}, removed ${removed})`,
    `backup path: ${backupPath}`,
  ];
}

function log(message: string): void {
  console.log(`[backup] ${message}`);
}

/**
 * Stream a readable (pg_dump stdout) through AES-256-GCM into `destPath`,
 * prefixing the magic + IV and appending the auth tag. No plaintext is written
 * to disk.
 */
function encryptStreamToFile(source: Readable, destPath: string, key: Buffer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const out = createWriteStream(destPath);
    let settled = false;
    const fail = (err: Error): void => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    source.on('error', fail);
    cipher.on('error', fail);
    out.on('error', fail);
    out.write(BACKUP_MAGIC);
    out.write(iv);
    cipher.on('data', (chunk: Buffer) => {
      out.write(chunk);
    });
    cipher.on('end', () => {
      const tag = cipher.getAuthTag();
      out.end(tag, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
    source.pipe(cipher);
  });
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Best effort: ignore missing file / cleanup races.
  }
}

async function pruneOldBackups(dir: string, retention: number): Promise<number> {
  const entries = await readdir(dir);
  const toPrune = selectFilesToPrune(entries, retention);
  for (const name of toPrune) {
    await safeUnlink(path.join(dir, name));
  }
  return toPrune.length;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required to run a backup.');
  }
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const retention = resolveRetentionCount(process.env.BACKUP_RETENTION_COUNT);
  const outputDir = resolveOutputDir(process.env.BACKUP_OUTPUT_DIR);

  const connectionEnv = parseDatabaseUrl(databaseUrl);

  await mkdir(outputDir, { recursive: true });

  const filename = buildBackupFilename(new Date());
  const finalPath = path.join(outputDir, filename);
  const partialPath = `${finalPath}.partial`;

  log('backup started');

  const child = spawn('pg_dump', buildPgDumpArgs(BACKUP_SCHEMAS), {
    env: { ...process.env, ...connectionEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Drain stderr without storing/printing it: pg_dump error text can include the
  // host. We surface only the exit code, never the raw message.
  child.stderr?.resume();

  const exitPromise = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      reject(new Error(`Failed to start pg_dump (is it installed and on PATH?): ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code ?? 'null'}.`));
    });
  });

  if (!child.stdout) {
    throw new Error('pg_dump stdout stream was unavailable.');
  }
  const encryptPromise = encryptStreamToFile(child.stdout, partialPath, key);

  const results = await Promise.allSettled([exitPromise, encryptPromise]);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) {
    await safeUnlink(partialPath);
    throw failure.reason instanceof Error ? failure.reason : new Error('backup failed.');
  }

  log('pg_dump completed');

  await rename(partialPath, finalPath);
  log('encrypted backup written');

  const removed = await pruneOldBackups(outputDir, retention);
  log(`retention applied (kept newest ${retention}, removed ${removed})`);
  log(`backup path: ${finalPath}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`[backup] failed: ${message}`);
    process.exit(1);
  });
}
