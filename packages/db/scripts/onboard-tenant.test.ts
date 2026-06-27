import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
  validateOwnerAuthUserId,
  validateOwnerEmail,
  validateTenantSlug,
  validateTimezone,
  type ExistingOnboardingState,
  type OnboardingInput,
  type RawOnboardingInput,
} from './onboard-tenant.js';

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

// --- sanity: module code coverage ------------------------------------------

test('VALID_MODULE_CODES includes core', () => {
  assert.ok(VALID_MODULE_CODES.includes('core'));
});
