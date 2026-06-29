import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPreflightInputsFromFlags,
  emitPreflightOutcome,
  formatPreflightReport,
  parsePreflightCliArgs,
  runPreflightCli,
  type PreflightCliOutcome,
} from './onboard-preflight-cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Synthetic, non-real fixtures only. No real UUIDs, emails, tokens, keys, or
// service_role values appear anywhere in this file.
//
// NOTE: CLOUD_DB_URL below is a SYNTHETIC Postgres URL userinfo fixture
// (`user:pw@...`). The `user`/`pw` are NOT a real email or a real secret; they
// exist solely to prove that a Cloud-looking DATABASE_URL is blocked and that
// neither the raw URL nor the password is ever printed.
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_DB_URL_WITH_PW = 'postgresql://postgres:pgpw_local_only@127.0.0.1:54322/postgres';
const CLOUD_DB_URL = 'postgresql://user:pw@db.exampleref.supabase.co:5432/postgres';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const CLOUD_SUPABASE_URL = 'https://exampleref.supabase.co';
const SUPABASE_URL_WITH_QUERY =
  'http://127.0.0.1:54321/auth/v1/token?apikey=stub-query-marker#frag-marker';

const ABS_BACKUP_PATH = '/var/backups/linebos-20260101-090500.dump.enc';
const BACKUP_BASENAME = 'linebos-20260101-090500.dump.enc';

const NOW = new Date('2026-01-01T10:00:00.000Z');

/** A fully-passing report-only argv (no commit). */
function passArgv(extra: string[] = []): string[] {
  return [
    '--target',
    'local',
    '--database-url',
    LOCAL_DB_URL,
    '--next-public-supabase-url',
    LOCAL_SUPABASE_URL,
    '--tenant-slug',
    'acme-kk',
    '--tenant-name',
    'Acme KK',
    '--location-name',
    'Main Store',
    '--module',
    'core',
    '--module',
    'workforce',
    ...extra,
  ];
}

function run(argv: string[]): PreflightCliOutcome {
  return runPreflightCli(argv, { now: NOW });
}

function collect(outcome: PreflightCliOutcome): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  emitPreflightOutcome(outcome, { out: (l) => out.push(l), err: (e) => err.push(e) });
  return { out, err };
}

// --- 1. all-pass report exits 0 --------------------------------------------

test('all-pass report-only run exits 0', () => {
  const outcome = run(passArgv());
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.errors.length, 0);
  assert.ok(outcome.lines.includes('Status: PASS'));
});

// --- 2. blocked report exits non-zero --------------------------------------

test('blocked report exits non-zero (invalid tenant slug)', () => {
  const outcome = run(passArgv(['--tenant-slug', 'Bad Slug']));
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.lines.includes('Status: BLOCKED'));
});

// --- 3. cloud target blocks -------------------------------------------------

test('cloud target blocks (exit non-zero)', () => {
  const outcome = runPreflightCli(
    [
      '--target',
      'cloud',
      '--database-url',
      LOCAL_DB_URL,
      '--tenant-slug',
      'acme-kk',
      '--tenant-name',
      'Acme KK',
      '--location-name',
      'Main Store',
    ],
    { now: NOW },
  );
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.lines.includes('Target: cloud'));
  assert.ok(
    outcome.lines.some((l) => l.includes('[BLOCKED] target.local')),
    'target.local must be reported as blocked',
  );
});

// --- 4. Cloud-looking DATABASE_URL blocks and the raw URL/password is hidden -

test('cloud-looking DATABASE_URL blocks and never prints the raw URL or password', () => {
  const outcome = runPreflightCli(
    [
      '--target',
      'local',
      '--database-url',
      CLOUD_DB_URL,
      '--tenant-slug',
      'acme-kk',
      '--tenant-name',
      'Acme KK',
      '--location-name',
      'Main Store',
    ],
    { now: NOW },
  );
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.ok, false);
  assert.ok(
    outcome.lines.some((l) => l.includes('[BLOCKED] database.local-guard')),
    'the local DB guard must block the cloud-looking URL',
  );
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(CLOUD_DB_URL), 'raw DATABASE_URL leaked');
  assert.ok(!serialized.includes('db.exampleref.supabase.co'), 'the DB host leaked');
  assert.ok(!serialized.includes('user:pw'), 'the URL userinfo leaked');
});

// --- 5. Cloud-looking NEXT_PUBLIC_SUPABASE_URL warns but does not block ------

test('cloud-looking NEXT_PUBLIC_SUPABASE_URL warns but does not block by itself', () => {
  const outcome = run(passArgv(['--next-public-supabase-url', CLOUD_SUPABASE_URL]));
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.ok, true);
  assert.ok(
    outcome.lines.some((l) => l.includes('[WARN] supabase.url-host')),
    'a cloud-looking web URL must warn',
  );
  assert.ok(outcome.lines.includes('- supabaseHost: exampleref.supabase.co'));
});

// --- 6. Supabase URL query/hash/path is never printed -----------------------

test('Supabase URL query/hash/path is not printed (host only)', () => {
  const outcome = run(passArgv(['--next-public-supabase-url', SUPABASE_URL_WITH_QUERY]));
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes('apikey'), 'query key name leaked');
  assert.ok(!serialized.includes('stub-query-marker'), 'query value leaked');
  assert.ok(!serialized.includes('frag-marker'), 'hash fragment leaked');
  assert.ok(!serialized.includes('/auth/v1/token'), 'URL path leaked');
  assert.ok(outcome.lines.includes('- supabaseHost: 127.0.0.1'));
});

// --- 7. backup full path is not printed, only the basename ------------------

test('backup artifact prints basename only, never the full path', () => {
  const outcome = run(passArgv(['--backup-artifact', ABS_BACKUP_PATH]));
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(ABS_BACKUP_PATH), 'the full backup path leaked');
  assert.ok(!serialized.includes('/var/backups'), 'the backup directory leaked');
  assert.ok(outcome.lines.includes(`- backupArtifact: ${BACKUP_BASENAME}`));
});

// --- 8. missing explicit commit flags blocks when --commit is used ----------

test('--commit without the explicit confirmation flags blocks', () => {
  const outcome = run(passArgv(['--commit', '--backup-artifact', ABS_BACKUP_PATH]));
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.ok, false);
  assert.ok(
    outcome.lines.some((l) => l.includes('[BLOCKED] commit.explicit-yes')),
    'missing --yes must block',
  );
  assert.ok(
    outcome.lines.some((l) => l.includes('[BLOCKED] commit.local-write-ack')),
    'missing --i-understand-this-writes-local-db must block',
  );
});

test('--commit with all explicit flags + a valid backup name passes', () => {
  const outcome = run(
    passArgv([
      '--commit',
      '--yes',
      '--i-understand-this-writes-local-db',
      '--backup-artifact',
      ABS_BACKUP_PATH,
    ]),
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.ok, true);
});

// --- 9. malformed optional Supabase URL does not crash ----------------------

test('malformed --next-public-supabase-url does not crash and does not block', () => {
  const outcome = run(passArgv(['--next-public-supabase-url', 'not a url']));
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.ok, true);
  assert.ok(outcome.lines.some((l) => l.includes('supabase.url-host')));
});

// --- 10. report-only text is printed ----------------------------------------

test('the output clearly states it is report-only', () => {
  const { out } = collect(run(passArgv()));
  assert.ok(out.includes('Mode: report-only'));
  assert.ok(
    out.some((l) => /report-only/.test(l) && /does NOT run onboarding/.test(l)),
    'must state it does not run onboarding',
  );
  assert.ok(out.includes('LINE Business OS local onboarding preflight'));
});

// --- 11. no onboarding/dry-run/commit functions are called or imported ------

test('the CLI source imports only the pure aggregator (no I/O onboarding modules)', () => {
  const source = readFileSync(path.join(HERE, 'onboard-preflight-cli.ts'), 'utf8');
  // Must reach ONLY the pure aggregator.
  assert.ok(
    /from\s+['"]\.\/onboard-preflight\.js['"]/.test(source),
    'must import the pure aggregator',
  );
  // Must NOT import any I/O onboarding module (static or lazy).
  for (const mod of ['onboard-write', 'onboard-commit', 'onboard-db', 'onboard-backup-gate']) {
    assert.ok(!source.includes(`./${mod}.js`), `must not import ./${mod}.js`);
  }
  // Must not import a DB driver or the Supabase client.
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg'");
  assert.ok(!/from\s+['"]postgres['"]/.test(source), "must not import 'postgres'");
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
  // Must not read the filesystem (report-only never stats the backup artifact).
  assert.ok(!/from\s+['"]node:fs['"]/.test(source), "must not import 'node:fs'");
  assert.ok(!/statSync\s*\(/.test(source), 'must not stat the filesystem');
});

test('the report builder is invoked and no other path runs (injected builder)', () => {
  let calls = 0;
  const outcome = runPreflightCli(passArgv(), {
    now: NOW,
    buildReport: (inputs, deps) => {
      calls += 1;
      assert.equal(inputs.target, 'local');
      assert.equal(deps.now, NOW);
      // The CLI must never stat the backup; metadata is not supplied.
      assert.equal(inputs.backupArtifactMetadata, undefined);
      return {
        ok: true,
        target: 'local',
        checks: [],
        blockedReasons: [],
        warnings: [],
        redactedSummary: {
          target: 'local',
          dbLocalTarget: null,
          supabaseUrlHost: null,
          supabaseUrlIsCloudLike: null,
          commitRequested: false,
          commitConfirmations: { explicitYes: false, explicitLocalWriteAcknowledgement: false },
          backupArtifactProvided: false,
          backupArtifactBasename: null,
          backupArtifactAbsolute: null,
          modules: [],
          tenantSlug: null,
          tenantNameProvided: false,
          locationNameProvided: false,
        },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(outcome.exitCode, 0);
});

// --- 12. no service_role key-like values in fixtures / output ---------------

test('no service_role value-like token appears in output or this test file', () => {
  const outcome = run(passArgv(['--database-url', LOCAL_DB_URL_WITH_PW]));
  assert.ok(!JSON.stringify(outcome).includes('service_role'), 'service_role leaked into output');
  const source = readFileSync(path.join(HERE, 'onboard-preflight-cli.test.ts'), 'utf8');
  // service_role may appear only as a prose policy term, never as a key=value.
  assert.ok(!/service_role\s*[:=]/.test(source), 'no service_role key/value in fixtures');
});

test('report redacts the DATABASE_URL password', () => {
  const outcome = run(passArgv(['--database-url', LOCAL_DB_URL_WITH_PW]));
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(LOCAL_DB_URL_WITH_PW), 'raw DATABASE_URL leaked');
  assert.ok(!serialized.includes('pgpw_local_only'), 'DB password leaked');
  assert.ok(outcome.lines.includes('- dbTarget: local-postgres:54322'));
});

// --- parser ----------------------------------------------------------------

test('parsePreflightCliArgs parses values, switches, and repeatable modules', () => {
  const result = parsePreflightCliArgs(passArgv(['--commit', '--yes']));
  assert.ok(result.ok);
  assert.equal(result.value.target, 'local');
  assert.equal(result.value.databaseUrl, LOCAL_DB_URL);
  assert.equal(result.value.tenantSlug, 'acme-kk');
  assert.equal(result.value.commit, true);
  assert.equal(result.value.yes, true);
  assert.deepEqual(result.value.modules, ['core', 'workforce']);
});

test('parsePreflightCliArgs rejects an unknown flag', () => {
  const result = parsePreflightCliArgs([...passArgv(), '--teleport', 'now']);
  assert.ok(!result.ok);
});

test('parsePreflightCliArgs rejects a positional argument without echoing it', () => {
  const result = parsePreflightCliArgs([...passArgv(), 'secret-positional-value']);
  assert.ok(!result.ok);
  assert.ok(
    !result.errors.join(' ').includes('secret-positional-value'),
    'must not echo a positional value',
  );
});

test('parsePreflightCliArgs rejects a missing value (next token is a flag)', () => {
  const result = parsePreflightCliArgs(['--database-url', '--target', 'local']);
  assert.ok(!result.ok);
});

test('a parse error exits non-zero and reports the error', () => {
  const outcome = runPreflightCli(['--teleport', 'now'], { now: NOW });
  assert.notEqual(outcome.exitCode, 0);
  assert.equal(outcome.ok, false);
  assert.ok(outcome.errors.length >= 1);
  const { err } = collect(outcome);
  assert.ok(err.some((e) => /Unknown argument/.test(e)));
});

// --- buildPreflightInputsFromFlags ------------------------------------------

test('buildPreflightInputsFromFlags omits unset optional fields and defaults target to empty', () => {
  const inputs = buildPreflightInputsFromFlags({
    commit: false,
    yes: false,
    iUnderstandThisWritesLocalDb: false,
    modules: [],
  });
  assert.equal(inputs.target, '');
  assert.equal(inputs.databaseUrl, undefined);
  assert.equal(inputs.backupArtifactPath, undefined);
  assert.equal(inputs.tenantSlug, undefined);
  assert.equal(inputs.backupArtifactMetadata, undefined);
});

// --- formatter --------------------------------------------------------------

test('formatPreflightReport renders every section deterministically', () => {
  const outcome = run(passArgv());
  const lines = formatPreflightReport({
    ok: outcome.ok,
    target: 'local',
    checks: [],
    blockedReasons: [],
    warnings: [],
    redactedSummary: {
      target: 'local',
      dbLocalTarget: { target: 'local-postgres', port: 54322 },
      supabaseUrlHost: '127.0.0.1',
      supabaseUrlIsCloudLike: false,
      commitRequested: false,
      commitConfirmations: { explicitYes: false, explicitLocalWriteAcknowledgement: false },
      backupArtifactProvided: false,
      backupArtifactBasename: null,
      backupArtifactAbsolute: null,
      modules: ['core'],
      tenantSlug: 'acme-kk',
      tenantNameProvided: true,
      locationNameProvided: true,
    },
  });
  assert.ok(lines.includes('Warnings:'));
  assert.ok(lines.includes('Blocked reasons:'));
  assert.ok(lines.includes('- (none)'));
  assert.ok(lines.includes('- dbTarget: local-postgres:54322'));
  assert.ok(lines.includes('- backupArtifact: not-provided'));
  assert.ok(lines.includes('- modules: core'));
});
