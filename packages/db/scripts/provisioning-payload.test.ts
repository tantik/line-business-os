import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAFE_HACCP_PRESETS_MANIFEST } from './cafe-haccp-presets.js';
import { CAFE_PACKAGE_TEMPLATE } from './cafe-package-template.js';
import {
  buildProvisioningPayload,
  parseProvisioningInput,
  validateProvisioningPayload,
  type ProvisioningInput,
} from './provisioning-payload.js';

const INPUT: ProvisioningInput = {
  businessName: 'Sample Cafe',
  tenantSlug: 'sample-cafe',
  locationName: '本店',
  timezone: 'Asia/Tokyo',
};

function payload(): Record<string, unknown> {
  return structuredClone(buildProvisioningPayload(INPUT)) as unknown as Record<string, unknown>;
}

test('parseProvisioningInput normalizes the slug, defaults the timezone and trims names', () => {
  const result = parseProvisioningInput({ businessName: '  Sample Cafe ', tenantSlug: ' Sample-Cafe ', locationName: ' 本店 ' });
  assert.deepEqual(result, {
    ok: true,
    value: { businessName: 'Sample Cafe', tenantSlug: 'sample-cafe', locationName: '本店', timezone: 'Asia/Tokyo' },
  });
});

test('parseProvisioningInput collects every error (onboard-tenant.ts rules)', () => {
  const result = parseProvisioningInput({ businessName: '', tenantSlug: 'admin', locationName: 'x'.repeat(201), timezone: 'Mars/Olympus' });
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.length === 4);
});

test('buildProvisioningPayload maps the v3 template and the HACCP manifest', () => {
  const p = buildProvisioningPayload(INPUT);
  assert.equal(p.slug, 'sample-cafe');
  assert.equal(p.package_code, 'cafe');
  assert.equal(p.template_version, CAFE_PACKAGE_TEMPLATE.version);
  assert.deepEqual(p.plan, { code: 'trial', trial_days: 30 });
  assert.deepEqual(p.location, { name: '本店', timezone: 'Asia/Tokyo' });
  assert.deepEqual(p.schedule_settings, {
    required_headcount_by_weekday: [1, 2, 2, 2, 2, 2, 1],
    max_monthly_hours: 160,
    max_weekly_hours: 40,
    max_days_per_week: 5,
    auto_create_day_of_month: 15,
    auto_create_enabled: false,
  });
  assert.deepEqual(p.shift_types.map((t) => [t.label_ja, t.starts_at_local, t.ends_at_local]), [
    ['早番', '07:00', '12:00'],
    ['中番', '10:00', '14:00'],
    ['遅番', '12:00', '17:00'],
  ]);
  assert.equal(p.operations.manifest_version, CAFE_HACCP_PRESETS_MANIFEST.manifestVersion);
  assert.equal(p.operations.templates.length, 4);
  assert.equal(p.operations.templates.flatMap((t) => t.items).length, 12);
  const freezer = p.operations.templates.flatMap((t) => t.items).find((i) => i.label.includes('Freezer'));
  assert.deepEqual([freezer?.numeric_min, freezer?.numeric_max, freezer?.numeric_unit], [null, -15, '°C']);
});

test('buildProvisioningPayload is deterministic and its output validates', () => {
  assert.deepEqual(buildProvisioningPayload(INPUT), buildProvisioningPayload(INPUT));
  assert.equal(validateProvisioningPayload(buildProvisioningPayload(INPUT)).ok, true);
});

test('the payload never carries owner identity or secrets', () => {
  assert.doesNotMatch(JSON.stringify(buildProvisioningPayload(INPUT)), /email|password|secret|token|phone|owner/i);
});

test('validator refuses unknown keys, e.g. a plaintext owner email', () => {
  const p = payload();
  p.owner_email = 'owner@example.com';
  const result = validateProvisioningPayload(p);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.errors.some((e) => e.includes('unknown key "owner_email"')));
  assert.ok(!result.ok && result.errors.every((e) => !e.includes('owner@example.com')), 'errors never echo values');
});

test('validator refuses a non-normalized or reserved slug', () => {
  const upper = payload();
  upper.slug = 'Sample-Cafe';
  assert.equal(validateProvisioningPayload(upper).ok, false);
  const reserved = payload();
  reserved.slug = 'admin';
  assert.equal(validateProvisioningPayload(reserved).ok, false);
});

test('validator refuses an unknown template version', () => {
  const p = payload();
  p.template_version = 2;
  assert.equal(validateProvisioningPayload(p).ok, false);
});

test('validator refuses auto-create on and a bad headcount array', () => {
  const p = payload();
  (p.schedule_settings as Record<string, unknown>).auto_create_enabled = true;
  (p.schedule_settings as Record<string, unknown>).required_headcount_by_weekday = [1, 2, 3];
  const result = validateProvisioningPayload(p);
  assert.ok(!result.ok && result.errors.length === 2);
});

test('validator refuses duplicate shift codes and an end before the start', () => {
  const p = payload();
  const shifts = p.shift_types as Record<string, unknown>[];
  shifts[1]!.code = shifts[0]!.code;
  shifts[2]!.ends_at_local = '11:00';
  const result = validateProvisioningPayload(p);
  assert.ok(!result.ok && result.errors.some((e) => e.includes('duplicate')));
  assert.ok(!result.ok && result.errors.some((e) => e.includes('end after start')));
});

test('validator refuses numeric bounds on a non-numeric HACCP item', () => {
  const p = payload();
  const ops = p.operations as { templates: { items: Record<string, unknown>[] }[] };
  ops.templates[0]!.items[0]!.numeric_min = 1;
  const result = validateProvisioningPayload(p);
  assert.ok(!result.ok && result.errors.some((e) => e.includes('numeric bounds only on numeric items')));
});

test('validator refuses a non-object payload and a bad timezone', () => {
  assert.equal(validateProvisioningPayload(null).ok, false);
  const p = payload();
  (p.location as Record<string, unknown>).timezone = 'Mars/Olympus';
  assert.equal(validateProvisioningPayload(p).ok, false);
});
