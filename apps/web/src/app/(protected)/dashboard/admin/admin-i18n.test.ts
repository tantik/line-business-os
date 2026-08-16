import { test } from 'node:test';
import assert from 'node:assert/strict';
import { membershipStatusLabel, tenantKindLabel } from './admin-i18n.js';

/**
 * F5 (`docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md`): the Admin
 * member table previously showed raw `tenantKind`/`membershipStatus` DB
 * enum values. Proves the new label maps cover every value of both fixed
 * enums (`@/lib/tenant/types.ts`) in both languages, with distinct JA/EN
 * copy -- same convention as the other dashboard i18n test files.
 */
const TENANT_KINDS = ['demo', 'client_template', 'client'] as const;
const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'revoked'] as const;

test('tenantKindLabel returns a non-empty, ja/en-distinct string for every TenantKind', () => {
  for (const kind of TENANT_KINDS) {
    const en = tenantKindLabel('en', kind);
    const ja = tenantKindLabel('ja', kind);
    assert.ok(en.length > 0, `tenantKindLabel(en, ${kind}) must not be empty`);
    assert.ok(ja.length > 0, `tenantKindLabel(ja, ${kind}) must not be empty`);
    assert.notEqual(en, ja, `tenantKindLabel(${kind}) should have distinct ja/en copy`);
  }
});

test('membershipStatusLabel returns a non-empty, ja/en-distinct string for every MembershipStatus', () => {
  for (const status of MEMBERSHIP_STATUSES) {
    const en = membershipStatusLabel('en', status);
    const ja = membershipStatusLabel('ja', status);
    assert.ok(en.length > 0, `membershipStatusLabel(en, ${status}) must not be empty`);
    assert.ok(ja.length > 0, `membershipStatusLabel(ja, ${status}) must not be empty`);
    assert.notEqual(en, ja, `membershipStatusLabel(${status}) should have distinct ja/en copy`);
  }
});
