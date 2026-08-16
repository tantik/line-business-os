import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreflightReport,
  validateBackupArtifactMetadata,
  type PreflightInputs,
} from './onboard-preflight.js';

// Synthetic, non-real fixtures. No real UUIDs, emails, tokens, keys, or
// service_role values appear anywhere in this file.
const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_DB_URL_WITH_PW = 'postgresql://postgres:pgpw_local_only@127.0.0.1:54322/postgres';
const CLOUD_DB_URL = 'postgresql://user:pw@db.exampleref.supabase.co:5432/postgres';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const CLOUD_SUPABASE_URL = 'https://exampleref.supabase.co';
const SUPABASE_URL_WITH_QUERY = 'http://127.0.0.1:54321/auth/v1/token?apikey=stub-query-marker#frag-marker';

const ABS_BACKUP_PATH = '/var/backups/linebos-20260101-090500.dump.enc';
const RELATIVE_BACKUP_PATH = 'backups/linebos-20260101-090500.dump.enc';

const NOW = new Date('2026-01-01T10:00:00.000Z');
const FRESH_MTIME = NOW.getTime() - 60 * 60 * 1000; // 1 hour old

function freshMetadata() {
  return { exists: true, isFile: true, sizeBytes: 4096, mtimeMs: FRESH_MTIME };
}

function localBase(overrides: Partial<PreflightInputs> = {}): PreflightInputs {
  return {
    target: 'local',
    databaseUrl: LOCAL_DB_URL,
    nextPublicSupabaseUrl: LOCAL_SUPABASE_URL,
    tenantSlug: 'acme-kk',
    tenantName: 'Acme KK',
    locationName: 'Main Store',
    modules: ['core', 'workforce'],
    ...overrides,
  };
}

function commitInputs(overrides: Partial<PreflightInputs> = {}): PreflightInputs {
  return localBase({
    commitRequested: true,
    explicitYes: true,
    explicitLocalWriteAcknowledgement: true,
    backupArtifactPath: ABS_BACKUP_PATH,
    backupArtifactMetadata: freshMetadata(),
    ...overrides,
  });
}

function check(report: ReturnType<typeof buildPreflightReport>, id: string) {
  const found = report.checks.find((c) => c.id === id);
  assert.ok(found, `expected a check with id "${id}"`);
  return found;
}

test('all-pass local preflight (no commit) is ok', () => {
  const report = buildPreflightReport(localBase(), { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(report.target, 'local');
  assert.deepEqual(report.blockedReasons, []);
  assert.equal(check(report, 'target.local').ok, true);
  assert.equal(check(report, 'database.local-guard').ok, true);
});

test('all-pass local commit preflight is ok', () => {
  const report = buildPreflightReport(commitInputs(), { now: NOW });
  assert.equal(report.ok, true);
  assert.deepEqual(report.blockedReasons, []);
  assert.equal(check(report, 'commit.backup-path-present').ok, true);
  assert.equal(check(report, 'commit.backup-path-absolute').ok, true);
  assert.equal(check(report, 'commit.backup-artifact').ok, true);
  assert.equal(check(report, 'commit.explicit-yes').ok, true);
  assert.equal(check(report, 'commit.local-write-ack').ok, true);
});

test('cloud target blocks', () => {
  const report = buildPreflightReport(localBase({ target: 'cloud' }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(report.target, 'cloud');
  assert.equal(check(report, 'target.local').ok, false);
  assert.ok(report.blockedReasons.length >= 1);
});

test('unknown target blocks and is reported as unknown', () => {
  const report = buildPreflightReport(localBase({ target: 'staging' }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(report.target, 'unknown');
});

test('cloud-looking DATABASE_URL blocks', () => {
  const report = buildPreflightReport(localBase({ databaseUrl: CLOUD_DB_URL }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'database.local-guard').ok, false);
});

test('missing backup path blocks commit preflight', () => {
  const report = buildPreflightReport(
    commitInputs({ backupArtifactPath: undefined, backupArtifactMetadata: undefined }),
    { now: NOW },
  );
  assert.equal(report.ok, false);
  assert.equal(check(report, 'commit.backup-path-present').ok, false);
});

test('relative backup path blocks commit preflight', () => {
  const report = buildPreflightReport(
    commitInputs({ backupArtifactPath: RELATIVE_BACKUP_PATH }),
    { now: NOW },
  );
  assert.equal(report.ok, false);
  assert.equal(check(report, 'commit.backup-path-absolute').ok, false);
});

test('missing explicitYes blocks commit preflight', () => {
  const report = buildPreflightReport(commitInputs({ explicitYes: false }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'commit.explicit-yes').ok, false);
});

test('missing explicitLocalWriteAcknowledgement blocks commit preflight', () => {
  const report = buildPreflightReport(
    commitInputs({ explicitLocalWriteAcknowledgement: false }),
    { now: NOW },
  );
  assert.equal(report.ok, false);
  assert.equal(check(report, 'commit.local-write-ack').ok, false);
});

test('stale backup metadata blocks commit preflight', () => {
  const stale = { ...freshMetadata(), mtimeMs: NOW.getTime() - 48 * 60 * 60 * 1000 };
  const report = buildPreflightReport(commitInputs({ backupArtifactMetadata: stale }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'commit.backup-artifact').ok, false);
});

test('cloud-looking NEXT_PUBLIC_SUPABASE_URL warns but does not block', () => {
  const report = buildPreflightReport(
    localBase({ nextPublicSupabaseUrl: CLOUD_SUPABASE_URL }),
    { now: NOW },
  );
  assert.equal(report.ok, true);
  const c = check(report, 'supabase.url-host');
  assert.equal(c.ok, true);
  assert.equal(c.severity, 'warning');
  assert.deepEqual(c.details, { host: 'exampleref.supabase.co', cloudLike: true });
  assert.ok(report.warnings.length >= 1);
});

test('malformed NEXT_PUBLIC_SUPABASE_URL warns and does not crash or block', () => {
  const report = buildPreflightReport(
    localBase({ nextPublicSupabaseUrl: 'not a url' }),
    { now: NOW },
  );
  assert.equal(report.ok, true);
  assert.equal(check(report, 'supabase.url-host').severity, 'warning');
});

test('report redacts the DATABASE_URL and its password', () => {
  const report = buildPreflightReport(localBase({ databaseUrl: LOCAL_DB_URL_WITH_PW }), {
    now: NOW,
  });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(LOCAL_DB_URL_WITH_PW));
  assert.ok(!serialized.includes('pgpw_local_only'));
  // Only the safe target descriptor is surfaced.
  assert.deepEqual(report.redactedSummary.dbLocalTarget, {
    target: 'local-postgres',
    port: 54322,
  });
});

test('report does not include query/hash from the Supabase URL', () => {
  const report = buildPreflightReport(
    localBase({ nextPublicSupabaseUrl: SUPABASE_URL_WITH_QUERY }),
    { now: NOW },
  );
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('apikey'));
  assert.ok(!serialized.includes('stub-query-marker'));
  assert.ok(!serialized.includes('frag-marker'));
  assert.equal(report.redactedSummary.supabaseUrlHost, '127.0.0.1');
});

test('report never contains a service_role value-like token', () => {
  const report = buildPreflightReport(commitInputs(), { now: NOW });
  assert.ok(!JSON.stringify(report).includes('service_role'));
});

test('invalid tenant slug blocks', () => {
  const report = buildPreflightReport(localBase({ tenantSlug: 'Bad Slug' }), { now: NOW });
  assert.equal(report.ok, false);
  assert.equal(check(report, 'tenant.slug').ok, false);
});

test('empty tenant and location fields block', () => {
  const report = buildPreflightReport(
    localBase({ tenantName: '', locationName: '   ' }),
    { now: NOW },
  );
  assert.equal(report.ok, false);
  assert.equal(check(report, 'tenant.name').ok, false);
  assert.equal(check(report, 'location.name').ok, false);
});

test('absent DATABASE_URL is non-blocking info', () => {
  const report = buildPreflightReport(localBase({ databaseUrl: undefined }), { now: NOW });
  assert.equal(report.ok, true);
  assert.equal(check(report, 'database.local-guard').severity, 'info');
});

test('injected deps are used (assertLocalDatabaseUrl + isAbsolutePath)', () => {
  let guardCalls = 0;
  const report = buildPreflightReport(commitInputs(), {
    now: NOW,
    assertLocalDatabaseUrl: (url) => {
      guardCalls += 1;
      assert.equal(url, LOCAL_DB_URL);
      return { target: 'local-postgres', port: 54322 };
    },
    isAbsolutePath: () => true,
  });
  assert.equal(guardCalls, 1);
  assert.equal(report.ok, true);
});

test('validateBackupArtifactMetadata accepts a valid fresh artifact', () => {
  const result = validateBackupArtifactMetadata(ABS_BACKUP_PATH, freshMetadata(), NOW);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.basename === 'linebos-20260101-090500.dump.enc');
});

test('validateBackupArtifactMetadata rejects a wrong extension', () => {
  const result = validateBackupArtifactMetadata('/var/backups/notes.txt', freshMetadata(), NOW);
  assert.equal(result.ok, false);
});
