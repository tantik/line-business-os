import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FIXTURE_MANIFEST_VERSION,
  FIXTURE_TENANT_SLUG,
  MAME_TO_CHA_FIXTURE,
  PROTECTED_TENANT_SLUGS,
  validateMameToChaFixtureManifest,
  type MameToChaFixtureManifest,
} from './mame-to-cha-fixture.js';

function clone(): MameToChaFixtureManifest {
  return structuredClone(MAME_TO_CHA_FIXTURE);
}

test('the tracked fixture manifest is exactly "mame-to-cha" and not protected', () => {
  assert.equal(MAME_TO_CHA_FIXTURE.tenant.slug, FIXTURE_TENANT_SLUG);
  assert.equal(FIXTURE_TENANT_SLUG, 'mame-to-cha');
  assert.ok(!(PROTECTED_TENANT_SLUGS as readonly string[]).includes(FIXTURE_TENANT_SLUG));
});

test('mame-to-cha-tokyo (sales demo) is protected', () => {
  assert.ok((PROTECTED_TENANT_SLUGS as readonly string[]).includes('mame-to-cha-tokyo'));
});

test('the tracked fixture manifest validates cleanly', () => {
  const result = validateMameToChaFixtureManifest(MAME_TO_CHA_FIXTURE);
  assert.ok(result.ok, `expected valid manifest, got: ${result.ok ? '' : result.errors.join(', ')}`);
});

test('rejects a manifest with the wrong tenant slug', () => {
  const bad = clone();
  // @ts-expect-error -- intentionally invalid for the test
  bad.tenant.slug = 'mame-to-cha-tokyo';
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects an unsupported manifest version', () => {
  const bad = clone();
  // @ts-expect-error -- intentionally invalid for the test
  bad.manifestVersion = 2;
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects zero manager role identities', () => {
  const bad = clone();
  bad.roles = [bad.roles[1], bad.roles[1]];
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects a staff role without requiresEmployeeBinding', () => {
  const bad = clone();
  bad.roles[1].requiresEmployeeBinding = false;
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects duplicate shift type codes', () => {
  const bad = clone();
  // @ts-expect-error -- intentionally invalid for the test
  bad.shiftTypes = [bad.shiftTypes[0], bad.shiftTypes[0]];
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects an inverted shift type window', () => {
  const bad = clone();
  // @ts-expect-error -- intentionally invalid for the test
  bad.shiftTypes = [{ ...bad.shiftTypes[0], startsAtLocal: '13:00', endsAtLocal: '09:00' }];
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('rejects an invalid location timezone', () => {
  const bad = clone();
  bad.location.timezone = 'Not/AZone';
  const result = validateMameToChaFixtureManifest(bad);
  assert.equal(result.ok, false);
});

test('fixture manifest version matches the module constant', () => {
  assert.equal(MAME_TO_CHA_FIXTURE.manifestVersion, FIXTURE_MANIFEST_VERSION);
});
