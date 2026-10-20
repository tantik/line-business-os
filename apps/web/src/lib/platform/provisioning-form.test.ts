import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestId, validateProvisioningForm } from './provisioning-form.js';

const VALID = {
  businessName: ' Cafe Sakura ',
  tenantSlug: 'Cafe-Sakura',
  locationName: '本店',
  timezone: 'Asia/Tokyo',
  ownerEmail: 'owner+qa@example.com',
};

test('valid input is trimmed and the slug normalized', () => {
  const out = validateProvisioningForm(VALID);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.value.businessName, 'Cafe Sakura');
  assert.equal(out.value.tenantSlug, 'cafe-sakura');
  assert.deepEqual(Object.keys(out.value).sort(), ['businessName', 'locationName', 'ownerEmail', 'tenantSlug', 'timezone']);
});

test('field errors are codes, one per field', () => {
  const out = validateProvisioningForm({ businessName: '', tenantSlug: 'a', locationName: 'x'.repeat(201), timezone: 'Mars/Base', ownerEmail: 'nope' });
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.deepEqual(out.fieldErrors, {
    businessName: 'required',
    tenantSlug: 'slug_length',
    locationName: 'too_long',
    timezone: 'timezone_invalid',
    ownerEmail: 'email_invalid',
  });
});

test('slug format vs reserved vs empty', () => {
  const bad = validateProvisioningForm({ ...VALID, tenantSlug: 'cafe--x!' });
  assert.equal(!bad.ok && bad.fieldErrors.tenantSlug, 'slug_format');
  const reserved = validateProvisioningForm({ ...VALID, tenantSlug: 'admin' });
  assert.equal(!reserved.ok && reserved.fieldErrors.tenantSlug, 'slug_reserved');
  const empty = validateProvisioningForm({ ...VALID, tenantSlug: '' });
  assert.equal(!empty.ok && empty.fieldErrors.tenantSlug, 'required');
});

test('an empty owner email is "required", and the address never appears in an error value', () => {
  const out = validateProvisioningForm({ ...VALID, ownerEmail: '  ' });
  assert.equal(!out.ok && out.fieldErrors.ownerEmail, 'required');
  const bad = validateProvisioningForm({ ...VALID, ownerEmail: 'secret-person@' });
  assert.ok(!JSON.stringify(bad).includes('secret-person'));
});

test('parseRequestId accepts a UUID only, lowercased', () => {
  assert.equal(parseRequestId('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'), 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(parseRequestId('not-a-uuid'), null);
  assert.equal(parseRequestId(null), null);
});
