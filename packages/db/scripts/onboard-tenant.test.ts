import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMMIT_TARGET_LOCAL,
  RESERVED_TENANT_SLUGS,
  VALID_MODULE_CODES,
  assertLocalDatabaseUrl,
  buildOnboardingPlan,
  createValidationOnlyCliSummary,
  normalizeLocationName,
  normalizeTenantSlug,
  parseModules,
  parseOnboardingCliArgs,
  parseOnboardingInput,
  redactOnboardingSummary,
  resolveOnboardingMode,
  runOnboardingCli,
  validateCommitGates,
  validateOwnerAuthUserId,
  validateOwnerEmail,
  validateTenantSlug,
  validateTimezone,
  type CliCommitTransactionResult,
  type CliDryRunTransactionResult,
  type ExistingOnboardingState,
  type OnboardingInput,
  type RawOnboardingInput,
} from './onboard-tenant.js';
import { buildPreflightReport as realBuildPreflightReport } from './onboard-preflight.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

// A non-real UUID used only to assert it never leaks into a redacted summary.
const FAKE_OWNER_UUID = '00000000-0000-4000-8000-000000000abc';
const FAKE_OWNER_EMAIL = 'owner@example.jp';

function validRaw(overrides: Partial<RawOnboardingInput> = {}): RawOnboardingInput {
  return {
    tenantName: 'Acme KK',
    tenantSlug: 'acme-kk',
    ownerAuthUserId: FAKE_OWNER_UUID,
    ownerEmail: FAKE_OWNER_EMAIL,
    locationName: 'Main Store',
    timezone: 'Asia/Tokyo',
    modules: 'core,workforce',
    dryRun: true,
    ...overrides,
  };
}

function parsedInput(overrides: Partial<RawOnboardingInput> = {}): OnboardingInput {
  const result = parseOnboardingInput(validRaw(overrides));
  assert.ok(result.ok, `expected valid input, got: ${result.ok ? '' : result.errors.join(', ')}`);
  return result.value;
}

// --- tenant slug ------------------------------------------------------------

test('validateTenantSlug accepts a valid slug', () => {
  const result = validateTenantSlug('acme-kk');
  assert.ok(result.ok);
  assert.equal(result.value, 'acme-kk');
});

test('validateTenantSlug normalizes uppercase + surrounding whitespace', () => {
  const result = validateTenantSlug('  ACME-KK  ');
  assert.ok(result.ok);
  assert.equal(result.value, 'acme-kk');
});

test('normalizeTenantSlug lowercases and trims only', () => {
  assert.equal(normalizeTenantSlug('  Foo-Bar '), 'foo-bar');
});

test('validateTenantSlug rejects malformed slugs', () => {
  for (const bad of ['ab', '-abc', 'abc-', 'a--b', 'has space', 'UPPER_SCORE', 'spør', 'a'.repeat(64)]) {
    const result = validateTenantSlug(bad);
    assert.ok(!result.ok, `expected "${bad}" to be rejected`);
  }
});

test('validateTenantSlug rejects every reserved slug', () => {
  for (const reserved of RESERVED_TENANT_SLUGS) {
    const result = validateTenantSlug(reserved);
    assert.ok(!result.ok, `expected reserved "${reserved}" to be rejected`);
  }
});

test('validateTenantSlug rejects non-string input', () => {
  assert.ok(!validateTenantSlug(undefined).ok);
  assert.ok(!validateTenantSlug(123).ok);
});

// --- owner auth user id -----------------------------------------------------

test('validateOwnerAuthUserId accepts a valid UUID and lowercases it', () => {
  const result = validateOwnerAuthUserId('00000000-0000-4000-8000-000000000ABC');
  assert.ok(result.ok);
  assert.equal(result.value, '00000000-0000-4000-8000-000000000abc');
});

test('validateOwnerAuthUserId rejects invalid ids', () => {
  for (const bad of ['', 'not-a-uuid', '123', '00000000-0000-4000-8000-00000000', undefined, 42]) {
    assert.ok(!validateOwnerAuthUserId(bad as unknown).ok, `expected "${String(bad)}" rejected`);
  }
});

// --- owner email ------------------------------------------------------------

test('validateOwnerEmail accepts a basic email and normalizes case', () => {
  const result = validateOwnerEmail('  Owner@Example.JP ');
  assert.ok(result.ok);
  assert.equal(result.value, 'owner@example.jp');
});

test('validateOwnerEmail rejects invalid emails', () => {
  for (const bad of ['', 'no-at', 'a@b', 'a@b@c.com', 'spaces in@email.com', undefined, 5]) {
    assert.ok(!validateOwnerEmail(bad as unknown).ok, `expected "${String(bad)}" rejected`);
  }
});

// --- timezone ---------------------------------------------------------------

test('validateTimezone defaults to Asia/Tokyo when omitted/blank', () => {
  for (const input of [undefined, null, '', '   ']) {
    const result = validateTimezone(input as unknown);
    assert.ok(result.ok);
    assert.equal(result.value, 'Asia/Tokyo');
  }
});

test('validateTimezone accepts a known IANA zone', () => {
  const result = validateTimezone('America/New_York');
  assert.ok(result.ok);
  assert.equal(result.value, 'America/New_York');
});

test('validateTimezone rejects an unknown zone', () => {
  assert.ok(!validateTimezone('Mars/Phobos').ok);
  assert.ok(!validateTimezone('Not A Zone').ok);
});

// --- modules ----------------------------------------------------------------

test('parseModules force-includes core even when not requested', () => {
  const result = parseModules('workforce');
  assert.ok(result.ok);
  assert.deepEqual(result.value, ['core', 'workforce']);
});

test('parseModules defaults to just core when empty/undefined', () => {
  for (const input of [undefined, '', '  ']) {
    const result = parseModules(input as unknown);
    assert.ok(result.ok);
    assert.deepEqual(result.value, ['core']);
  }
});

test('parseModules de-duplicates and applies deterministic order', () => {
  const result = parseModules('ai,workforce,core,workforce,booking');
  assert.ok(result.ok);
  // Order follows VALID_MODULE_CODES, not input order.
  assert.deepEqual(result.value, ['core', 'workforce', 'booking', 'ai']);
});

test('parseModules accepts an array and normalizes case/whitespace', () => {
  const result = parseModules([' Workforce ', 'CORE']);
  assert.ok(result.ok);
  assert.deepEqual(result.value, ['core', 'workforce']);
});

test('parseModules rejects an unknown module', () => {
  const result = parseModules('core,teleport');
  assert.ok(!result.ok);
});

// --- name validation (via parseOnboardingInput) -----------------------------

test('parseOnboardingInput trims tenant and location names', () => {
  const input = parsedInput({ tenantName: '  Acme KK  ', locationName: '  Main Store  ' });
  assert.equal(input.tenantName, 'Acme KK');
  assert.equal(input.locationName, 'Main Store');
});

test('parseOnboardingInput rejects empty/over-long names', () => {
  const emptyName = parseOnboardingInput(validRaw({ tenantName: '   ' }));
  assert.ok(!emptyName.ok);

  const longLocation = parseOnboardingInput(validRaw({ locationName: 'x'.repeat(201) }));
  assert.ok(!longLocation.ok);
});

test('parseOnboardingInput aggregates multiple field errors', () => {
  const result = parseOnboardingInput({
    tenantName: '',
    tenantSlug: 'no',
    ownerAuthUserId: 'bad',
    locationName: '',
    timezone: 'Bad/Zone',
    modules: 'nope',
  });
  assert.ok(!result.ok);
  assert.ok(result.errors.length >= 5, `expected several errors, got ${result.errors.length}`);
});

test('parseOnboardingInput treats owner email as optional (null when absent)', () => {
  const input = parsedInput({ ownerEmail: undefined });
  assert.equal(input.ownerEmail, null);
});

test('parseOnboardingInput computes a normalized location key', () => {
  const input = parsedInput({ locationName: '  Main   Store ' });
  assert.equal(input.locationName, 'Main   Store'); // trimmed, inner spaces kept
  assert.equal(input.locationNameKey, 'main store'); // collapsed + lowercased
});

// --- normalizeLocationName --------------------------------------------------

test('normalizeLocationName trims, collapses whitespace, lowercases', () => {
  assert.equal(normalizeLocationName('  Main   Store  '), 'main store');
});

// --- buildOnboardingPlan: empty state ---------------------------------------

test('buildOnboardingPlan on empty state creates all expected operations', () => {
  const input = parsedInput({ modules: 'core,workforce' });
  const plan = buildOnboardingPlan(input);
  assert.ok(plan.ok);
  assert.equal(plan.conflicts.length, 0);

  const find = (entity: string) => plan.operations.find((op) => op.entity === entity);
  assert.equal(find('tenant')?.action, 'create');
  assert.equal(find('user')?.action, 'create');
  assert.equal(find('location')?.action, 'create');
  assert.equal(find('membership')?.action, 'create');
  assert.equal(find('role_assignment')?.action, 'create');

  assert.deepEqual(plan.modules, [
    { module: 'core', action: 'enable' },
    { module: 'workforce', action: 'enable' },
  ]);
});

// --- buildOnboardingPlan: fully existing state ------------------------------

test('buildOnboardingPlan reuses an already-onboarded tenant', () => {
  const input = parsedInput({ modules: 'core,workforce' });
  const existing: ExistingOnboardingState = {
    tenant: { slug: 'acme-kk', name: 'Acme KK', kind: 'client' },
    userMirrorExists: true,
    locationNames: ['Main Store'],
    membershipExists: true,
    membershipStatus: 'active',
    roleAssignmentExists: true,
    enabledModules: ['core', 'workforce'],
  };
  const plan = buildOnboardingPlan(input, existing);
  assert.ok(plan.ok);

  const actions = Object.fromEntries(plan.operations.map((op) => [op.entity, op.action]));
  assert.equal(actions.tenant, 'reuse');
  assert.equal(actions.user, 'reuse');
  assert.equal(actions.location, 'reuse');
  assert.equal(actions.membership, 'reuse');
  assert.equal(actions.role_assignment, 'reuse');
  assert.deepEqual(plan.modules, [
    { module: 'core', action: 'reuse' },
    { module: 'workforce', action: 'reuse' },
  ]);
});

test('buildOnboardingPlan activates an invited (non-active) membership', () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, { membershipExists: true, membershipStatus: 'invited' });
  const membership = plan.operations.find((op) => op.entity === 'membership');
  assert.equal(membership?.action, 'activate');
});

// --- buildOnboardingPlan: conflict ------------------------------------------

test('buildOnboardingPlan flags a slug conflict on different name', () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {
    tenant: { slug: 'acme-kk', name: 'Totally Different KK', kind: 'client' },
  });
  assert.ok(!plan.ok);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0]?.action, 'conflict');
  assert.equal(plan.modules.length, 0);
});

test('buildOnboardingPlan flags a slug conflict on different kind', () => {
  const input = parsedInput();
  const plan = buildOnboardingPlan(input, {
    tenant: { slug: 'acme-kk', name: 'Acme KK', kind: 'demo' },
  });
  assert.ok(!plan.ok);
  assert.equal(plan.operations[0]?.action, 'conflict');
});

// --- buildOnboardingPlan: location idempotency by normalized name -----------

test('buildOnboardingPlan reuses a location matched by normalized name', () => {
  const input = parsedInput({ locationName: 'main   store' });
  const plan = buildOnboardingPlan(input, { locationNames: ['  Main Store  '] });
  const location = plan.operations.find((op) => op.entity === 'location');
  assert.equal(location?.action, 'reuse');
});

test('buildOnboardingPlan creates a location when no normalized match', () => {
  const input = parsedInput({ locationName: 'Second Store' });
  const plan = buildOnboardingPlan(input, { locationNames: ['Main Store'] });
  const location = plan.operations.find((op) => op.entity === 'location');
  assert.equal(location?.action, 'create');
});

// --- redactOnboardingSummary ------------------------------------------------

test('redactOnboardingSummary contains the tenant slug and module codes', () => {
  const input = parsedInput({ modules: 'core,workforce' });
  const summary = redactOnboardingSummary(buildOnboardingPlan(input));
  assert.equal(summary.tenantSlug, 'acme-kk');
  assert.deepEqual(
    summary.modules.map((m) => m.module),
    ['core', 'workforce'],
  );
  assert.ok(summary.operationCounts['tenant.create'] === 1);
});

test('redactOnboardingSummary leaks no raw email, owner id, or UUID-like string', () => {
  const input = parsedInput();
  const summary = redactOnboardingSummary(buildOnboardingPlan(input));
  const serialized = JSON.stringify(summary);

  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'email leaked');
  assert.ok(!serialized.includes('@'), 'an email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');

  const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.ok(!uuidLike.test(serialized), 'a UUID-like string leaked');
});

// --- parseOnboardingCliArgs -------------------------------------------------

function validArgv(extra: string[] = []): string[] {
  return [
    '--tenant-name',
    'Acme KK',
    '--tenant-slug',
    'acme-kk',
    '--owner-auth-user-id',
    FAKE_OWNER_UUID,
    '--location-name',
    'Main Store',
    ...extra,
  ];
}

test('parseOnboardingCliArgs parses valid minimal args', () => {
  const result = parseOnboardingCliArgs(validArgv());
  assert.ok(result.ok);
  assert.equal(result.value.tenantName, 'Acme KK');
  assert.equal(result.value.tenantSlug, 'acme-kk');
  assert.equal(result.value.ownerAuthUserId, FAKE_OWNER_UUID);
  assert.equal(result.value.locationName, 'Main Store');
  assert.equal(result.value.dryRun, false);
  assert.equal(result.value.commit, false);
  assert.equal(result.value.yes, false);
});

test('parseOnboardingCliArgs parses optional args and switches', () => {
  const result = parseOnboardingCliArgs(
    validArgv([
      '--owner-email',
      FAKE_OWNER_EMAIL,
      '--timezone',
      'America/New_York',
      '--modules',
      'core,workforce',
      '--dry-run',
    ]),
  );
  assert.ok(result.ok);
  assert.equal(result.value.ownerEmail, FAKE_OWNER_EMAIL);
  assert.equal(result.value.timezone, 'America/New_York');
  assert.equal(result.value.modules, 'core,workforce');
  assert.equal(result.value.dryRun, true);
});

test('parseOnboardingCliArgs parses the commit gate flags', () => {
  const result = parseOnboardingCliArgs(
    validArgv([
      '--commit',
      '--yes',
      '--i-understand-this-writes-local-db',
      '--target',
      'local',
      '--backup-artifact',
      '/tmp/linebos-20260101-090500.dump.enc',
    ]),
  );
  assert.ok(result.ok);
  assert.equal(result.value.commit, true);
  assert.equal(result.value.yes, true);
  assert.equal(result.value.iUnderstandThisWritesLocalDb, true);
  assert.equal(result.value.target, 'local');
  assert.equal(result.value.backupArtifact, '/tmp/linebos-20260101-090500.dump.enc');
});

test('parseOnboardingCliArgs leaves the commit gate flags unset by default', () => {
  const result = parseOnboardingCliArgs(validArgv());
  assert.ok(result.ok);
  assert.equal(result.value.iUnderstandThisWritesLocalDb, false);
  assert.equal(result.value.target, undefined);
  assert.equal(result.value.backupArtifact, undefined);
});

test('parseOnboardingCliArgs rejects an unknown flag', () => {
  const result = parseOnboardingCliArgs([...validArgv(), '--teleport', 'now']);
  assert.ok(!result.ok);
});

test('parseOnboardingCliArgs rejects a positional argument without echoing it', () => {
  const result = parseOnboardingCliArgs([...validArgv(), 'secret-positional@example.jp']);
  assert.ok(!result.ok);
  assert.ok(
    !result.errors.join(' ').includes('secret-positional@example.jp'),
    'must not echo a (possibly sensitive) positional value',
  );
});

test('parseOnboardingCliArgs rejects a missing value (end of argv)', () => {
  const result = parseOnboardingCliArgs(['--tenant-name']);
  assert.ok(!result.ok);
});

test('parseOnboardingCliArgs rejects a missing value (next token is a flag)', () => {
  const result = parseOnboardingCliArgs(['--tenant-name', '--tenant-slug', 'acme-kk']);
  assert.ok(!result.ok);
});

// --- resolveOnboardingMode --------------------------------------------------

test('resolveOnboardingMode defaults to dry-run when neither flag is set', () => {
  const result = resolveOnboardingMode({ dryRun: false, commit: false, yes: false });
  assert.ok(result.ok);
  assert.equal(result.value, 'dry-run');
});

test('resolveOnboardingMode honors an explicit --dry-run', () => {
  const result = resolveOnboardingMode({ dryRun: true, commit: false, yes: false });
  assert.ok(result.ok);
  assert.equal(result.value, 'dry-run');
});

test('resolveOnboardingMode rejects --dry-run and --commit together', () => {
  const result = resolveOnboardingMode({ dryRun: true, commit: true, yes: true });
  assert.ok(!result.ok);
});

test('resolveOnboardingMode rejects --commit without --yes', () => {
  const result = resolveOnboardingMode({ dryRun: false, commit: true, yes: false });
  assert.ok(!result.ok);
});

test('resolveOnboardingMode resolves commit with --commit --yes (still no live writes here)', () => {
  const result = resolveOnboardingMode({ dryRun: false, commit: true, yes: true });
  assert.ok(result.ok);
  assert.equal(result.value, 'commit');
  // The shell still refuses to write: createValidationOnlyCliSummary marks the
  // run as live-onboarding-not-implemented regardless of mode.
  const summary = createValidationOnlyCliSummary(parsedInput(), 'commit');
  assert.equal(summary.liveOnboarding, 'not-implemented');
  assert.equal(summary.dbConnection, 'none');
  assert.equal(summary.mode, 'commit');
});

// --- validateCommitGates (Stage 3c-4a) --------------------------------------

const FULL_GATES = {
  iUnderstandThisWritesLocalDb: true,
  target: COMMIT_TARGET_LOCAL,
  backupArtifact: '/tmp/linebos-20260101-090500.dump.enc',
};

test('validateCommitGates passes when every gate is present', () => {
  const result = validateCommitGates(FULL_GATES);
  assert.ok(result.ok);
  assert.equal(result.ok && result.backupArtifact, '/tmp/linebos-20260101-090500.dump.enc');
});

test('validateCommitGates requires --i-understand-this-writes-local-db', () => {
  const result = validateCommitGates({ ...FULL_GATES, iUnderstandThisWritesLocalDb: false });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.errors.some((e) => /i-understand-this-writes-local-db/.test(e)));
});

test('validateCommitGates requires --target local', () => {
  const missing = validateCommitGates({ ...FULL_GATES, target: undefined });
  assert.ok(!missing.ok);
  assert.ok(!missing.ok && missing.errors.some((e) => /--target local/.test(e)));
});

test('validateCommitGates rejects a non-local target (e.g. cloud) without echoing it', () => {
  const result = validateCommitGates({ ...FULL_GATES, target: 'cloud' });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.errors.some((e) => /must be local/i.test(e)));
  assert.ok(!result.ok && !result.errors.join(' ').includes('cloud'), 'must not echo the bad target');
});

test('validateCommitGates requires --backup-artifact', () => {
  for (const backupArtifact of [undefined, '', '   ']) {
    const result = validateCommitGates({ ...FULL_GATES, backupArtifact });
    assert.ok(!result.ok);
    assert.ok(!result.ok && result.errors.some((e) => /--backup-artifact/.test(e)));
  }
});

test('validateCommitGates aggregates all missing gates', () => {
  const result = validateCommitGates({
    iUnderstandThisWritesLocalDb: false,
    target: undefined,
    backupArtifact: undefined,
  });
  assert.ok(!result.ok);
  assert.ok(!result.ok && result.errors.length === 3);
});

// --- createValidationOnlyCliSummary (redaction) -----------------------------

test('createValidationOnlyCliSummary keeps the tenant slug and mode', () => {
  const summary = createValidationOnlyCliSummary(parsedInput({ modules: 'core,workforce' }), 'dry-run');
  assert.equal(summary.mode, 'dry-run');
  assert.equal(summary.plan.tenantSlug, 'acme-kk');
  assert.equal(summary.dbTarget, 'not-checked');
});

test('createValidationOnlyCliSummary reflects whether an email was provided (boolean only)', () => {
  const withEmail = createValidationOnlyCliSummary(parsedInput({ ownerEmail: FAKE_OWNER_EMAIL }), 'dry-run');
  const withoutEmail = createValidationOnlyCliSummary(parsedInput({ ownerEmail: undefined }), 'dry-run');
  assert.equal(withEmail.ownerEmailProvided, true);
  assert.equal(withoutEmail.ownerEmailProvided, false);
});

test('createValidationOnlyCliSummary leaks no raw email, owner id, or UUID-like string', () => {
  const summary = createValidationOnlyCliSummary(parsedInput(), 'dry-run');
  const serialized = JSON.stringify(summary);

  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'email leaked');
  assert.ok(!serialized.includes('@'), 'an email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');

  const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.ok(!uuidLike.test(serialized), 'a UUID-like string leaked');
});

// --- assertLocalDatabaseUrl -------------------------------------------------

test('assertLocalDatabaseUrl accepts the local 127.0.0.1:54322 target', () => {
  const target = assertLocalDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  assert.deepEqual(target, { target: 'local-postgres', port: 54322 });
});

test('assertLocalDatabaseUrl accepts localhost:54322', () => {
  const target = assertLocalDatabaseUrl('postgresql://postgres:postgres@localhost:54322/postgres');
  assert.equal(target.port, 54322);
});

test('assertLocalDatabaseUrl rejects a *.supabase.co host', () => {
  assert.throws(() => assertLocalDatabaseUrl('postgresql://postgres:pw@db.abcdefgh.supabase.co:54322/postgres'));
});

test('assertLocalDatabaseUrl rejects a *.pooler.supabase.com host', () => {
  assert.throws(() =>
    assertLocalDatabaseUrl('postgresql://postgres:pw@aws-0-ap-northeast-1.pooler.supabase.com:54322/postgres'),
  );
});

test('assertLocalDatabaseUrl rejects a non-local host', () => {
  assert.throws(() => assertLocalDatabaseUrl('postgresql://postgres:pw@example.com:54322/postgres'));
});

test('assertLocalDatabaseUrl rejects the wrong port', () => {
  assert.throws(() => assertLocalDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5432/postgres'));
});

test('assertLocalDatabaseUrl rejects a non-postgres protocol', () => {
  assert.throws(() => assertLocalDatabaseUrl('mysql://postgres:pw@127.0.0.1:54322/postgres'));
});

test('assertLocalDatabaseUrl rejects a malformed URL', () => {
  assert.throws(() => assertLocalDatabaseUrl('not a url'));
});

test('assertLocalDatabaseUrl error messages never include the raw URL, username, or password', () => {
  const raw = 'postgresql://secretuser:sup3rsecretpw@evil.supabase.co:54322/postgres';
  assert.throws(
    () => assertLocalDatabaseUrl(raw),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(!err.message.includes(raw), 'raw URL leaked');
      assert.ok(!err.message.includes('secretuser'), 'username leaked');
      assert.ok(!err.message.includes('sup3rsecretpw'), 'password leaked');
      assert.ok(!err.message.includes('evil.supabase.co'), 'host leaked');
      return true;
    },
  );
});

// --- source guards ----------------------------------------------------------

test('onboard helper does not import a DB driver or open a connection', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');

  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import the 'pg' driver");
  assert.ok(!/from\s+['"]postgres['"]/.test(source), "must not import the 'postgres' driver");
  assert.ok(!/require\(\s*['"](?:pg|postgres)['"]\s*\)/.test(source), 'must not require a DB driver');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not mention the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');

  // Stage 3c-1 may READ process.env.DATABASE_URL to guard it, but must never
  // open a connection and never print/log the URL value.
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
  assert.ok(
    !/console\.[a-z]+\([^)]*DATABASE_URL/i.test(source),
    'must not print DATABASE_URL',
  );
  assert.ok(
    !/console\.[a-z]+\([^)]*databaseUrl/.test(source),
    'must not print the parsed DATABASE_URL value',
  );
});

test('apps/web does not import the onboard helper', () => {
  const webSrc = path.join(REPO_ROOT, 'apps', 'web', 'src');
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // apps/web/src absent in some checkouts — nothing to guard.
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        if (readFileSync(full, 'utf8').includes('onboard-tenant')) {
          offenders.push(full);
        }
      }
    }
  };
  walk(webSrc);

  assert.deepEqual(offenders, [], `apps/web must not reference the onboard helper: ${offenders.join(', ')}`);
});

// --- runOnboardingCli (Stage 3c-3b routing; no real DB) ---------------------

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function fakeDryRunResult(
  overrides: Partial<CliDryRunTransactionResult> = {},
): CliDryRunTransactionResult {
  return {
    mode: 'dry-run',
    tenantSlug: 'acme-kk',
    ownerEmailProvided: false,
    dbTarget: { target: 'local-postgres', port: 54322 },
    rolledBack: true,
    persisted: false,
    write: { operationCounts: { 'tenant.reuse': 1, 'tenant_module.reuse.core': 1 } },
    ...overrides,
  };
}

test('runOnboardingCli: dry-run WITH DATABASE_URL takes the dry-run transaction path', async () => {
  let called = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: LOCAL_DB_URL },
    runDryRunTransaction: async (input) => {
      called += 1;
      assert.equal(input.tenantSlug, 'acme-kk');
      return fakeDryRunResult();
    },
  });

  assert.equal(called, 1, 'the dry-run transaction must be invoked');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'dry-run-transaction');
  assert.equal(outcome.connectionAttempted, true);
  assert.ok(outcome.lines.includes('local dry-run transaction executed'));
  assert.ok(outcome.lines.includes('transaction rolled back'));
  assert.ok(outcome.lines.includes('no DB rows persisted'));
  assert.ok(outcome.lines.includes('no live commit implemented'));
  assert.ok(outcome.lines.includes('db target: local-postgres:54322'));
});

test('runOnboardingCli: dry-run WITHOUT DATABASE_URL keeps the validation-only path', async () => {
  let called = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: {},
    runDryRunTransaction: async () => {
      called += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(called, 0, 'must not run a transaction without DATABASE_URL');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'validation-only');
  assert.equal(outcome.connectionAttempted, false);
  assert.ok(outcome.lines.includes('db target: not checked (DATABASE_URL not set)'));
  assert.ok(outcome.lines.some((l) => l.startsWith('validation complete (dry-run)')));
});

// --- commit gates + backup artifact + local commit (Stage 3c-4b) ------------

const VALID_BACKUP_NAME = 'linebos-20260101-090500.dump.enc';
const HOUR_MS = 60 * 60 * 1000;

/** Throwaway temp dir, cleaned up after the test. */
function makeTempDir(t: { after: (fn: () => void) => void }): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lbos-cli-3c4b-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function freshBackup(dir: string): string {
  const full = path.join(dir, VALID_BACKUP_NAME);
  writeFileSync(full, 'not-a-real-backup-payload');
  return full;
}

function commitArgv(extra: string[] = []): string[] {
  return validArgv(['--commit', '--yes', ...extra]);
}

function fakeCommitResult(
  overrides: Partial<CliCommitTransactionResult> = {},
): CliCommitTransactionResult {
  return {
    mode: 'commit',
    tenantSlug: 'acme-kk',
    ownerEmailProvided: false,
    dbTarget: { target: 'local-postgres', port: 54322 },
    committed: true,
    persisted: true,
    noop: false,
    changedOperationCount: 7,
    auditRowCount: 8,
    write: { operationCounts: { 'tenant.create': 1, 'tenant_module.enable.core': 1 } },
    ...overrides,
  };
}

/**
 * CLI spies for both transaction paths. Neither the dry-run nor the commit
 * transaction should ever open a real connection in these tests; both are
 * injected so the routing can be asserted without a DB. The commit behavior is
 * overridable per-test (e.g. a no-op result or a thrown safe error).
 */
function spyCli(): {
  deps: (opts?: {
    env?: Record<string, string>;
    commit?: (
      input: OnboardingInput,
      options: { backupArtifactPath: string },
    ) => Promise<CliCommitTransactionResult>;
  }) => Parameters<typeof runOnboardingCli>[1];
  dryRunCalls: () => number;
  commitCalls: () => number;
  lastBackupPath: () => string | undefined;
} {
  let dry = 0;
  let commit = 0;
  let lastBackup: string | undefined;
  return {
    deps: (opts = {}) => ({
      env: opts.env ?? {},
      runDryRunTransaction: async () => {
        dry += 1;
        return fakeDryRunResult();
      },
      runCommitTransaction: async (input, options) => {
        commit += 1;
        lastBackup = options.backupArtifactPath;
        return opts.commit ? opts.commit(input, options) : fakeCommitResult();
      },
    }),
    dryRunCalls: () => dry,
    commitCalls: () => commit,
    lastBackupPath: () => lastBackup,
  };
}

test('runOnboardingCli: commit without --yes fails as a mode error (no connection)', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(validArgv(['--commit']), spy.deps());
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'mode-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.dryRunCalls(), 0);
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit without --i-understand-this-writes-local-db is refused before connect', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--target', 'local', '--backup-artifact', `/tmp/${VALID_BACKUP_NAME}`]),
    spy.deps(),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'commit-gate-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.commitCalls(), 0);
  assert.ok(outcome.errors.some((e) => /i-understand-this-writes-local-db/.test(e)));
});

test('runOnboardingCli: commit without --backup-artifact is refused before connect', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local']),
    spy.deps(),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'commit-gate-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.commitCalls(), 0);
  assert.ok(outcome.errors.some((e) => /--backup-artifact/.test(e)));
});

test('runOnboardingCli: commit without --target local is refused before connect', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--backup-artifact', `/tmp/${VALID_BACKUP_NAME}`]),
    spy.deps(),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'commit-gate-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.commitCalls(), 0);
  assert.ok(outcome.errors.some((e) => /--target local/.test(e)));
});

test('runOnboardingCli: commit with --target cloud is refused (no echo of the bad value)', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv([
      '--i-understand-this-writes-local-db',
      '--target',
      'cloud',
      '--backup-artifact',
      `/tmp/${VALID_BACKUP_NAME}`,
    ]),
    spy.deps(),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'commit-gate-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.commitCalls(), 0);
  assert.ok(!JSON.stringify(outcome).includes('cloud'), 'must not echo the bad target');
});

test('runOnboardingCli: commit with a missing backup file fails (not found, before connect)', async (t) => {
  const dir = makeTempDir(t);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv([
      '--i-understand-this-writes-local-db',
      '--target',
      'local',
      '--backup-artifact',
      path.join(dir, VALID_BACKUP_NAME),
    ]),
    spy.deps(),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.equal(outcome.connectionAttempted, false);
  assert.equal(spy.commitCalls(), 0);
  assert.ok(outcome.errors.some((e) => /not found/i.test(e)));
});

test('runOnboardingCli: commit with a directory backup path fails', async (t) => {
  const dir = makeTempDir(t);
  const asDir = path.join(dir, VALID_BACKUP_NAME);
  mkdirSync(asDir);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', asDir]),
    spy.deps(),
  );
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.ok(outcome.errors.some((e) => /not a file/i.test(e)));
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit with an empty backup file fails', async (t) => {
  const dir = makeTempDir(t);
  const empty = path.join(dir, VALID_BACKUP_NAME);
  writeFileSync(empty, '');
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', empty]),
    spy.deps(),
  );
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.ok(outcome.errors.some((e) => /empty/i.test(e)));
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit with a wrong-extension backup file fails', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv([
      '--i-understand-this-writes-local-db',
      '--target',
      'local',
      '--backup-artifact',
      '/tmp/backup.txt',
    ]),
    spy.deps(),
  );
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.ok(outcome.errors.some((e) => /\.dump\.enc/i.test(e)));
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit with an invalid backup filename fails', async () => {
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv([
      '--i-understand-this-writes-local-db',
      '--target',
      'local',
      '--backup-artifact',
      '/tmp/not-a-backup.dump.enc',
    ]),
    spy.deps(),
  );
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.ok(outcome.errors.some((e) => /filename is invalid/i.test(e)));
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit with a stale (>24h) backup file fails', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  const old = new Date(Date.now() - 25 * HOUR_MS);
  utimesSync(full, old, old);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', full]),
    spy.deps(),
  );
  assert.equal(outcome.path, 'backup-artifact-error');
  assert.ok(outcome.errors.some((e) => /too old/i.test(e)));
  assert.equal(spy.commitCalls(), 0);
});

test('runOnboardingCli: commit with all gates + a valid backup runs the local commit path', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', full]),
    spy.deps({ env: { DATABASE_URL: LOCAL_DB_URL } }),
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'commit-executed');
  assert.equal(outcome.connectionAttempted, true);
  assert.equal(spy.commitCalls(), 1, 'the commit transaction must be invoked');
  assert.equal(spy.dryRunCalls(), 0, 'commit must never call the dry-run transaction');
  assert.equal(spy.lastBackupPath(), full, 'the validated backup path is handed to the commit runner');
  assert.ok(outcome.lines.includes('local committed onboarding executed'));
  assert.ok(outcome.lines.includes('backup artifact gate passed'));
  assert.ok(outcome.lines.includes('local target confirmed'));
  assert.ok(outcome.lines.includes('no Cloud touched'));
  assert.ok(outcome.lines.includes('db target: local-postgres:54322'));
});

test('runOnboardingCli: commit on an already-onboarded tenant reports a no-op (exit 0)', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', full]),
    spy.deps({
      env: { DATABASE_URL: LOCAL_DB_URL },
      commit: async () =>
        fakeCommitResult({
          committed: false,
          persisted: false,
          noop: true,
          changedOperationCount: 0,
          auditRowCount: 0,
        }),
    }),
  );
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'commit-noop');
  assert.equal(spy.commitCalls(), 1);
  assert.ok(outcome.lines.some((l) => /no-op/.test(l)));
  assert.ok(outcome.lines.includes('no rows persisted (transaction rolled back)'));
  assert.ok(!outcome.lines.includes('local committed onboarding executed'));
});

test('runOnboardingCli: a failing commit transaction surfaces a safe error', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', full]),
    spy.deps({
      env: { DATABASE_URL: LOCAL_DB_URL },
      commit: async () => {
        throw new Error('The local onboarding commit transaction failed and was rolled back.');
      },
    }),
  );
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'commit-error');
  assert.equal(spy.commitCalls(), 1);
  const joined = outcome.errors.join(' ');
  assert.ok(joined.length > 0);
  assert.ok(!joined.includes('@'));
  assert.ok(!UUID_LIKE.test(joined));
});

test('runOnboardingCli: commit output leaks no email, owner id, UUID, or DATABASE_URL', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv([
      '--owner-email',
      FAKE_OWNER_EMAIL,
      '--i-understand-this-writes-local-db',
      '--target',
      'local',
      '--backup-artifact',
      full,
    ]),
    spy.deps({
      env: { DATABASE_URL: LOCAL_DB_URL },
      commit: async () => fakeCommitResult({ ownerEmailProvided: true }),
    }),
  );
  assert.equal(outcome.path, 'commit-executed');
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'owner email leaked');
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');
  assert.ok(!serialized.includes(LOCAL_DB_URL), 'the connection string leaked');
  // The validated backup basename must not surface in the output either.
  assert.ok(!serialized.includes(VALID_BACKUP_NAME), 'the backup filename leaked into output');
});

test('runOnboardingCli: a Cloud-looking DATABASE_URL is blocked by preflight before any transaction', async () => {
  // Synthetic Cloud-looking Postgres URL: `u:p` is synthetic URL userinfo, not a
  // real email or secret; it exists only to prove Cloud DB URLs are blocked and
  // their value is never echoed.
  let called = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: 'postgresql://u:p@db.abc.supabase.co:5432/postgres' },
    runDryRunTransaction: async () => {
      called += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(called, 0, 'must not run a transaction for a Cloud-looking URL');
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'preflight-blocked');
  assert.equal(outcome.connectionAttempted, false);
  assert.ok(outcome.lines.includes('preflight: BLOCKED'), 'must clearly indicate preflight blocked');
  assert.ok(
    outcome.lines.includes('no BEGIN issued; no dry-run transaction started'),
    'must state no BEGIN / no transaction',
  );
  const joined = [...outcome.errors, ...outcome.lines].join(' ');
  assert.ok(!joined.includes('supabase.co'), 'must not echo the offending host');
  assert.ok(!joined.includes('db.abc.supabase.co'));
  assert.ok(!joined.includes('u:p'), 'must not echo the URL userinfo');
});

// --- Stage 4C: preflight before the local dry-run transaction ---------------

test('runOnboardingCli: dry-run WITH DATABASE_URL runs preflight BEFORE connecting', async () => {
  const order: string[] = [];
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: LOCAL_DB_URL },
    buildPreflightReport: (inputs) => {
      order.push('preflight');
      assert.equal(inputs.target, 'local');
      assert.equal(inputs.commitRequested, false, 'dry-run must not request the commit/backup gates');
      assert.equal(inputs.databaseUrl, LOCAL_DB_URL);
      return realBuildPreflightReport(inputs);
    },
    runDryRunTransaction: async () => {
      order.push('dry-run');
      return fakeDryRunResult();
    },
  });

  assert.deepEqual(order, ['preflight', 'dry-run'], 'preflight must run before the transaction');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'dry-run-transaction');
  assert.equal(outcome.connectionAttempted, true);
  assert.ok(outcome.lines.includes('preflight: PASS'));
  assert.ok(outcome.lines.includes('local dry-run transaction executed'));
  assert.ok(outcome.lines.includes('transaction rolled back'));
});

test('runOnboardingCli: a blocked preflight prevents the DB connection and returns non-zero', async () => {
  let dryCalled = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: LOCAL_DB_URL },
    // Force a block independently of the URL by reporting a Cloud target.
    buildPreflightReport: () => realBuildPreflightReport({ target: 'cloud' }),
    runDryRunTransaction: async () => {
      dryCalled += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(dryCalled, 0, 'the dry-run transaction must never be called when preflight is blocked');
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'preflight-blocked');
  assert.equal(outcome.connectionAttempted, false);
  assert.ok(outcome.lines.includes('preflight: BLOCKED'), 'must clearly indicate a blocked preflight');
  assert.ok(outcome.lines.includes('no DB connection opened (preflight failed before connect)'));
  assert.ok(outcome.errors.some((e) => /preflight blocked/.test(e)));
});

test('runOnboardingCli: a Cloud-looking NEXT_PUBLIC_SUPABASE_URL warns but does not block the dry-run', async () => {
  let dryCalled = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    // Real preflight: a Cloud-like web URL is a non-blocking warning only.
    env: {
      DATABASE_URL: LOCAL_DB_URL,
      NEXT_PUBLIC_SUPABASE_URL: 'https://exampleref.supabase.co',
    },
    runDryRunTransaction: async () => {
      dryCalled += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(dryCalled, 1, 'a Cloud-looking web URL must NOT block the dry-run by itself');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'dry-run-transaction');
  assert.ok(outcome.lines.includes('preflight: PASS'));
});

test('runOnboardingCli: dry-run WITHOUT DATABASE_URL does not run preflight (validation-only unchanged)', async () => {
  let pfCalled = 0;
  let dryCalled = 0;
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: {},
    buildPreflightReport: () => {
      pfCalled += 1;
      return realBuildPreflightReport({ target: 'local' });
    },
    runDryRunTransaction: async () => {
      dryCalled += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(pfCalled, 0, 'preflight must not run on the validation-only path');
  assert.equal(dryCalled, 0, 'no transaction without DATABASE_URL');
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'validation-only');
  assert.equal(outcome.connectionAttempted, false);
  assert.ok(outcome.lines.some((l) => l.startsWith('validation complete (dry-run)')));
});

test('runOnboardingCli: blocked preflight output leaks no DATABASE_URL, password, or host', async () => {
  // Synthetic Cloud-looking Postgres URL: `user`/`sup3rsecret` are synthetic URL
  // userinfo (not a real email or real secret), present only to prove the raw
  // URL and password never appear in the blocked output.
  const cloud = 'postgresql://user:sup3rsecret@db.exampleref.supabase.co:5432/postgres';
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: cloud },
    runDryRunTransaction: async () => fakeDryRunResult(),
  });

  assert.equal(outcome.path, 'preflight-blocked');
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(cloud), 'raw DATABASE_URL leaked');
  assert.ok(!serialized.includes('sup3rsecret'), 'DB password leaked');
  assert.ok(!serialized.includes('db.exampleref.supabase.co'), 'DB host leaked');
  assert.ok(!serialized.includes('service_role'), 'service_role leaked');
});

test('runOnboardingCli: the commit path does NOT run preflight (Stage 4C is dry-run only)', async (t) => {
  const dir = makeTempDir(t);
  const full = freshBackup(dir);
  let pfCalled = 0;
  const spy = spyCli();
  const outcome = await runOnboardingCli(
    commitArgv(['--i-understand-this-writes-local-db', '--target', 'local', '--backup-artifact', full]),
    {
      ...spy.deps({ env: { DATABASE_URL: LOCAL_DB_URL } }),
      buildPreflightReport: () => {
        pfCalled += 1;
        return realBuildPreflightReport({ target: 'local' });
      },
    },
  );

  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.path, 'commit-executed');
  assert.equal(pfCalled, 0, 'preflight must NOT be wired into the commit path in this stage');
  assert.equal(spy.commitCalls(), 1, 'commit behavior is unchanged');
});

test('runOnboardingCli: dry-run transaction lines leak no email, owner id, UUID, or DATABASE_URL', async () => {
  const outcome = await runOnboardingCli(validArgv(['--owner-email', FAKE_OWNER_EMAIL, '--dry-run']), {
    env: { DATABASE_URL: LOCAL_DB_URL },
    runDryRunTransaction: async () => fakeDryRunResult({ ownerEmailProvided: true }),
  });

  assert.equal(outcome.path, 'dry-run-transaction');
  const serialized = JSON.stringify(outcome);
  assert.ok(!serialized.includes(FAKE_OWNER_EMAIL), 'owner email leaked');
  assert.ok(!serialized.includes('@'), 'email-like token leaked');
  assert.ok(!serialized.includes(FAKE_OWNER_UUID), 'owner auth user id leaked');
  assert.ok(!UUID_LIKE.test(serialized), 'a UUID-like string leaked');
  assert.ok(!serialized.includes('DATABASE_URL'), 'DATABASE_URL leaked');
  assert.ok(!serialized.includes(LOCAL_DB_URL), 'the connection string leaked');
});

test('runOnboardingCli: surfaces a safe error when the dry-run transaction fails', async () => {
  const outcome = await runOnboardingCli(validArgv(['--dry-run']), {
    env: { DATABASE_URL: LOCAL_DB_URL },
    runDryRunTransaction: async () => {
      throw new Error('The local onboarding dry-run transaction failed and was rolled back.');
    },
  });

  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'dry-run-transaction-error');
  assert.ok(outcome.errors.length > 0);
  const joined = outcome.errors.join(' ');
  assert.ok(!joined.includes('@'));
  assert.ok(!UUID_LIKE.test(joined));
});

test('runOnboardingCli: invalid input fails before touching the database', async () => {
  let called = 0;
  const outcome = await runOnboardingCli(['--tenant-name', 'Acme KK', '--tenant-slug', 'no'], {
    env: { DATABASE_URL: LOCAL_DB_URL },
    runDryRunTransaction: async () => {
      called += 1;
      return fakeDryRunResult();
    },
  });

  assert.equal(called, 0);
  assert.equal(outcome.exitCode, 1);
  assert.equal(outcome.path, 'input-error');
  assert.equal(outcome.connectionAttempted, false);
});

// --- source guard: onboard-tenant.ts stays driver-free ----------------------

test('onboard-tenant.ts has no direct pg import / new Client / .connect', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg' directly");
  assert.ok(!/require\(\s*['"]pg['"]\s*\)/.test(source), "must not require 'pg'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
});

// --- Stage 3c-4b source guards ---------------------------------------------

test('onboard-commit.ts exists and is reached only via a lazy import', () => {
  assert.equal(
    existsSync(path.join(HERE, 'onboard-commit.ts')),
    true,
    'Stage 3c-4b adds onboard-commit.ts (the only file with the COMMIT token)',
  );
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');
  // The CLI must not statically import the commit module; it reaches it lazily
  // so this file stays driver-free and free of the transaction COMMIT token.
  assert.ok(
    !/import\s+[^;]*from\s+['"]\.\/onboard-commit\.js['"]/.test(source),
    'onboard-tenant.ts must not statically import onboard-commit',
  );
  assert.ok(
    /import\(\s*['"]\.\/onboard-commit\.js['"]\s*\)/.test(source),
    'onboard-tenant.ts must reach onboard-commit via a lazy import',
  );
});

test('onboard-tenant.ts stays driver-free and adds no service_role / Supabase client', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');
  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import 'pg'");
  assert.ok(!/from\s+['"]postgres['"]/.test(source), "must not import 'postgres'");
  assert.ok(!/new\s+Client\s*\(/.test(source), 'must not instantiate a DB client');
  assert.ok(!/\.connect\s*\(/.test(source), 'must not open a DB connection');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not read the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
  assert.ok(!/@supabase\/supabase-js/.test(source), 'must not import the Supabase client');
});

// --- sanity: module code coverage ------------------------------------------

test('VALID_MODULE_CODES includes core', () => {
  assert.ok(VALID_MODULE_CODES.includes('core'));
});
