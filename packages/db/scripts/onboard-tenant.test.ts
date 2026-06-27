import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESERVED_TENANT_SLUGS,
  VALID_MODULE_CODES,
  buildOnboardingPlan,
  normalizeLocationName,
  normalizeTenantSlug,
  parseModules,
  parseOnboardingInput,
  redactOnboardingSummary,
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

// --- source guards ----------------------------------------------------------

test('onboard helper does not import a DB driver or read connection config', () => {
  const source = readFileSync(path.join(HERE, 'onboard-tenant.ts'), 'utf8');

  assert.ok(!/from\s+['"]pg['"]/.test(source), "must not import the 'pg' driver");
  assert.ok(!/from\s+['"]postgres['"]/.test(source), "must not import the 'postgres' driver");
  assert.ok(!/require\(\s*['"](?:pg|postgres)['"]\s*\)/.test(source), 'must not require a DB driver');
  assert.ok(!source.includes('DATABASE_URL'), 'must not read DATABASE_URL');
  assert.ok(!/service_role/i.test(source), 'must not mention service_role');
  assert.ok(!source.includes('SUPABASE_SERVICE_ROLE'), 'must not mention the service role key');
  assert.ok(!source.includes('createServiceClient'), 'must not use the service client');
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
