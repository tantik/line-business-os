import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_FILENAME_REGEX,
  BACKUP_SCHEMAS,
  DEFAULT_OUTPUT_DIR,
  MIN_RETENTION,
  buildBackupFilename,
  buildPgDumpArgs,
  parseDatabaseUrl,
  parseEncryptionKey,
  resolveRetentionCount,
  safeBackupMessages,
  selectFilesToPrune,
} from './backup.js';

// A throwaway, non-real password used only to assert it never leaks into argv.
const FAKE_PASSWORD = 'fake-pw-never-real-do-not-log';
const FAKE_DATABASE_URL = `postgresql://postgres:${FAKE_PASSWORD}@127.0.0.1:54322/postgres?sslmode=disable`;

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- BACKUP_ENCRYPTION_KEY validation ---------------------------------------

test('parseEncryptionKey accepts a base64-encoded 32-byte key', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const result = parseEncryptionKey(key);
  assert.equal(result.length, 32);
});

test('parseEncryptionKey rejects a missing key with a safe error', () => {
  assert.throws(() => parseEncryptionKey(undefined), /BACKUP_ENCRYPTION_KEY is required/);
  assert.throws(() => parseEncryptionKey('   '), /BACKUP_ENCRYPTION_KEY is required/);
});

test('parseEncryptionKey rejects a key of the wrong length', () => {
  const tooShort = Buffer.alloc(16, 1).toString('base64');
  assert.throws(() => parseEncryptionKey(tooShort), /exactly 32 bytes/);
});

test('parseEncryptionKey error never echoes the provided key value', () => {
  const tooShort = Buffer.from('this-is-not-32-bytes').toString('base64');
  try {
    parseEncryptionKey(tooShort);
    assert.fail('expected parseEncryptionKey to throw');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.ok(!err.message.includes(tooShort));
  }
});

// --- retention --------------------------------------------------------------

test('resolveRetentionCount defaults to 7', () => {
  assert.equal(resolveRetentionCount(undefined), 7);
  assert.equal(resolveRetentionCount(''), 7);
  assert.equal(MIN_RETENTION, 7);
});

test('resolveRetentionCount clamps values below 7 up to 7', () => {
  assert.equal(resolveRetentionCount('1'), 7);
  assert.equal(resolveRetentionCount('6'), 7);
  assert.equal(resolveRetentionCount('0'), 7);
  assert.equal(resolveRetentionCount('-5'), 7);
});

test('resolveRetentionCount honors values at or above 7', () => {
  assert.equal(resolveRetentionCount('7'), 7);
  assert.equal(resolveRetentionCount('30'), 30);
});

test('resolveRetentionCount falls back to 7 for non-integer input', () => {
  assert.equal(resolveRetentionCount('abc'), 7);
  assert.equal(resolveRetentionCount('7.5'), 7);
});

// --- filename ---------------------------------------------------------------

test('buildBackupFilename produces a sortable, suffixed name', () => {
  const name = buildBackupFilename(new Date(Date.UTC(2026, 0, 2, 9, 5, 7)));
  assert.equal(name, 'linebos-20260102-090507.dump.enc');
  assert.match(name, BACKUP_FILENAME_REGEX);
  assert.ok(name.endsWith('.dump.enc'));
});

test('buildBackupFilename names sort chronologically as strings', () => {
  const earlier = buildBackupFilename(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
  const later = buildBackupFilename(new Date(Date.UTC(2026, 0, 1, 0, 0, 1)));
  assert.ok(earlier < later);
});

// --- schema include list ----------------------------------------------------

test('BACKUP_SCHEMAS includes the approved application + auth schemas', () => {
  for (const schema of ['core', 'audit', 'workforce', 'booking', 'ai', 'public', 'api', 'auth']) {
    assert.ok(BACKUP_SCHEMAS.includes(schema as (typeof BACKUP_SCHEMAS)[number]), `missing ${schema}`);
  }
});

test('BACKUP_SCHEMAS excludes managed/secret Supabase schemas', () => {
  const excluded = [
    'vault',
    'pgsodium',
    'realtime',
    'extensions',
    'graphql',
    'graphql_public',
    'supabase_functions',
    'supabase_migrations',
    'cron',
    'net',
    'pgbouncer',
  ];
  for (const schema of excluded) {
    assert.ok(!(BACKUP_SCHEMAS as readonly string[]).includes(schema), `should not include ${schema}`);
  }
});

// --- pg_dump args / env builder ---------------------------------------------

test('buildPgDumpArgs uses custom format and explicit per-schema includes', () => {
  const args = buildPgDumpArgs(BACKUP_SCHEMAS);
  assert.ok(args.includes('-Fc'));
  for (const schema of BACKUP_SCHEMAS) {
    assert.ok(args.includes(`--schema=${schema}`), `missing --schema=${schema}`);
  }
});

test('buildPgDumpArgs never embeds the connection URL or password', () => {
  const joined = buildPgDumpArgs(BACKUP_SCHEMAS).join(' ');
  assert.ok(!joined.includes('postgresql://'));
  assert.ok(!joined.includes(FAKE_PASSWORD));
  assert.ok(!joined.toLowerCase().includes('password'));
});

test('parseDatabaseUrl maps connection parts to PG* env (password in env, not args)', () => {
  const env = parseDatabaseUrl(FAKE_DATABASE_URL);
  assert.equal(env.PGHOST, '127.0.0.1');
  assert.equal(env.PGPORT, '54322');
  assert.equal(env.PGUSER, 'postgres');
  assert.equal(env.PGDATABASE, 'postgres');
  assert.equal(env.PGPASSWORD, FAKE_PASSWORD);
  assert.equal(env.PGSSLMODE, 'disable');

  const args = buildPgDumpArgs(BACKUP_SCHEMAS).join(' ');
  assert.ok(!args.includes(FAKE_PASSWORD));
});

test('parseDatabaseUrl rejects an invalid URL with a safe error', () => {
  assert.throws(() => parseDatabaseUrl('not a url'), /not a valid connection URL/);
});

// --- log safety -------------------------------------------------------------

test('safeBackupMessages contain no DB URL, JWT, or UUID patterns', () => {
  const messages = safeBackupMessages(
    path.join(DEFAULT_OUTPUT_DIR, 'linebos-20260102-090507.dump.enc'),
    7,
    3,
  );
  const jwtLike = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
  const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  for (const message of messages) {
    assert.ok(!message.includes('postgresql://'), `URL leaked: ${message}`);
    assert.ok(!message.includes(FAKE_PASSWORD), `password leaked: ${message}`);
    assert.ok(!jwtLike.test(message), `JWT-like string: ${message}`);
    assert.ok(!uuidLike.test(message), `UUID-like string: ${message}`);
  }
});

// --- retention selection ----------------------------------------------------

test('selectFilesToPrune keeps the newest N and drops the oldest', () => {
  const files = [
    'linebos-20260101-000000.dump.enc',
    'linebos-20260102-000000.dump.enc',
    'linebos-20260103-000000.dump.enc',
    'linebos-20260104-000000.dump.enc',
    'linebos-20260105-000000.dump.enc',
    'linebos-20260106-000000.dump.enc',
    'linebos-20260107-000000.dump.enc',
    'linebos-20260108-000000.dump.enc',
  ];
  const pruned = selectFilesToPrune(files, 7);
  assert.deepEqual(pruned, ['linebos-20260101-000000.dump.enc']);
});

test('selectFilesToPrune never prunes when at or below retention', () => {
  const files = ['linebos-20260101-000000.dump.enc', 'linebos-20260102-000000.dump.enc'];
  assert.deepEqual(selectFilesToPrune(files, 7), []);
});

test('selectFilesToPrune only considers files matching the backup pattern', () => {
  const files = [
    'README.md',
    'notes.txt',
    'linebos-20260101-000000.dump.enc',
    'something.dump.enc',
    'linebos-bad.dump.enc',
  ];
  // Only one real backup file -> nothing to prune, and non-backups are untouched.
  assert.deepEqual(selectFilesToPrune(files, 7), []);
});

test('selectFilesToPrune clamps retention below 7 to 7', () => {
  const files = Array.from({ length: 9 }, (_v, i) =>
    buildBackupFilename(new Date(Date.UTC(2026, 0, i + 1, 0, 0, 0))),
  );
  // retention requested = 1, but clamp keeps 7 -> prune the 2 oldest.
  const pruned = selectFilesToPrune(files, 1);
  assert.equal(pruned.length, 2);
  assert.equal(pruned[0], files[0]);
});

// --- source / security guards -----------------------------------------------

test('backup script lives in packages/db, not apps/web', () => {
  const normalized = HERE.split(path.sep).join('/');
  assert.ok(normalized.includes('packages/db'), `unexpected location: ${normalized}`);
  assert.ok(!normalized.includes('apps/web'), `backup must not live under apps/web: ${normalized}`);
});

test('backup source does not reference service_role / SUPABASE_SERVICE_ROLE', () => {
  const source = readFileSync(path.join(HERE, 'backup.ts'), 'utf8');
  assert.ok(!/service_role/i.test(source));
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'));
});

test('apps/web does not import the backup script', () => {
  const repoRoot = path.resolve(HERE, '..', '..', '..');
  const webSrc = path.join(repoRoot, 'apps', 'web', 'src');
  if (!existsSync(webSrc)) return; // nothing to check
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        const content = readFileSync(full, 'utf8');
        if (content.includes('scripts/backup')) offenders.push(full);
      }
    }
  };
  walk(webSrc);
  assert.deepEqual(offenders, [], `apps/web must not import the backup script: ${offenders.join(', ')}`);
});
