import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryRunner } from './onboard-db.js';
import {
  MAME_TO_CHA_VERIFY_SQL,
  REQUIRED_MANAGER_PERMISSIONS,
  runMameToChaVerifyChecks,
} from './mame-to-cha-verify.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const MANAGER_USER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_USER_ID = '66666666-6666-4666-8666-666666666666';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const NOW = new Date('2026-06-01T00:00:00Z');

type Response = unknown[] | ((v: readonly unknown[]) => unknown[]);

class FakeRunner implements QueryRunner {
  public calls: { text: string; values: readonly unknown[] }[] = [];
  constructor(private readonly responses: Record<string, Response> = {}) {}
  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values: values ?? [] });
    const resp = this.responses[text];
    if (typeof resp === 'function') return { rows: resp(values ?? []) as T[] };
    return { rows: (resp ?? []) as T[] };
  }
}

function fullPassResponses(): Record<string, Response> {
  const shiftDate = resolveIsoDate(NOW, MAME_TO_CHA_FIXTURE.acceptanceData.shiftAssignmentDayOffset);
  const startsAtIso = localDateTimeToUtcIso(
    shiftDate,
    MAME_TO_CHA_FIXTURE.shiftTypes[0]!.startsAtLocal,
    MAME_TO_CHA_FIXTURE.location.timezone,
  );
  return {
    [MAME_TO_CHA_VERIFY_SQL.tenantCount]: [{ count: 1, id: TENANT_ID, kind: 'client' }],
    [MAME_TO_CHA_VERIFY_SQL.activeLocationCount]: [{ count: 1 }],
    [MAME_TO_CHA_VERIFY_SQL.workforceModuleEnabled]: [{ is_enabled: true }],
    [MAME_TO_CHA_VERIFY_SQL.membershipStatus]: [{ status: 'active' }],
    [MAME_TO_CHA_VERIFY_SQL.roleAssignmentRoleId]: (v) => [{ role_id: v[1] === MANAGER_USER_ID ? MANAGER_ROLE_ID : 'employee-role-id' }],
    [MAME_TO_CHA_VERIFY_SQL.rolePermissions]: [...REQUIRED_MANAGER_PERMISSIONS].map((permission_key) => ({ permission_key })),
    [MAME_TO_CHA_VERIFY_SQL.employeeRowsForUser]: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }],
    ['select id from core.locations where tenant_id = $1 and is_active = true']: [{ id: LOCATION_ID }],
    [MAME_TO_CHA_VERIFY_SQL.shiftTypeByCode]: [{ id: 'shift-type-id', is_active: true, location_id: LOCATION_ID }],
    [MAME_TO_CHA_VERIFY_SQL.recipeCountByTitle]: [{ count: 1 }],
    [MAME_TO_CHA_VERIFY_SQL.shiftAssignmentExists]: (v) => [{ exists: v[2] === startsAtIso }],
    [MAME_TO_CHA_VERIFY_SQL.shiftPreferenceExists]: [{ exists: true }],
    [MAME_TO_CHA_VERIFY_SQL.workReportExists]: [{ exists: true }],
    [MAME_TO_CHA_VERIFY_SQL.correctionRequestExists]: [{ exists: true }],
  };
}

test('a fully-correct fixture reports ok with no failures', async () => {
  const runner = new FakeRunner(fullPassResponses());
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {
    managerUserId: MANAGER_USER_ID,
    staffUserId: STAFF_USER_ID,
  }, NOW);
  assert.equal(report.ok, true, `expected ok, got failures: ${report.failures.join('; ')}`);
});

test('refuses to verify a wrong or protected tenant slug', async () => {
  const runner = new FakeRunner(fullPassResponses());
  const badFixture = { ...MAME_TO_CHA_FIXTURE, tenant: { ...MAME_TO_CHA_FIXTURE.tenant, slug: 'mame-to-cha-tokyo' as never } };
  const report = await runMameToChaVerifyChecks(runner, badFixture, {}, NOW);
  assert.equal(report.ok, false);
  assert.equal(runner.calls.length, 0, 'no query should run for a protected/invalid slug');
});

test('detects a missing tenant', async () => {
  const runner = new FakeRunner({ [MAME_TO_CHA_VERIFY_SQL.tenantCount]: [] });
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {}, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('exactly one tenant')));
});

test('detects a duplicate tenant row', async () => {
  const runner = new FakeRunner({
    [MAME_TO_CHA_VERIFY_SQL.tenantCount]: [
      { count: 1, id: TENANT_ID, kind: 'client' },
      { count: 1, id: 'other-tenant-id', kind: 'client' },
    ],
  });
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {}, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('exactly one tenant')));
});

test('detects zero or ambiguous (2+) active locations', async () => {
  const responses = fullPassResponses();
  responses[MAME_TO_CHA_VERIFY_SQL.activeLocationCount] = [{ count: 2 }];
  const runner = new FakeRunner(responses);
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, { managerUserId: MANAGER_USER_ID, staffUserId: STAFF_USER_ID }, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('active location')));
});

test('detects the Workforce module disabled', async () => {
  const responses = fullPassResponses();
  responses[MAME_TO_CHA_VERIFY_SQL.workforceModuleEnabled] = [{ is_enabled: false }];
  const runner = new FakeRunner(responses);
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {}, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('Workforce module')));
});

test('detects a manager missing one of the three required B2a permissions', async () => {
  const responses = fullPassResponses();
  responses[MAME_TO_CHA_VERIFY_SQL.rolePermissions] = [{ permission_key: 'workforce.shift.write' }];
  const runner = new FakeRunner(responses);
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {
    managerUserId: MANAGER_USER_ID,
    staffUserId: STAFF_USER_ID,
  }, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('workforce.staff.manage')));
  assert.ok(report.failures.some((m) => m.includes('workforce.request.manage')));
});

test('detects a duplicate employee binding for the staff user', async () => {
  const responses = fullPassResponses();
  responses[MAME_TO_CHA_VERIFY_SQL.employeeRowsForUser] = [
    { id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true },
    { id: 'duplicate-employee-id', location_id: LOCATION_ID, is_active: true },
  ];
  const runner = new FakeRunner(responses);
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {
    managerUserId: MANAGER_USER_ID,
    staffUserId: STAFF_USER_ID,
  }, NOW);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((m) => m.includes('duplicate')));
});

test('missing identity skips (not_checked) identity-scoped checks instead of failing', async () => {
  const runner = new FakeRunner(fullPassResponses());
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {}, NOW);
  const membershipChecks = report.checks.filter((c) => c.id.startsWith('membership.'));
  assert.ok(membershipChecks.every((c) => c.status === 'not_checked'));
  // Structural checks (tenant/location/module) still ran and passed.
  assert.ok(report.checks.some((c) => c.id === 'tenant.exists-exactly-once' && c.status === 'pass'));
});

test('report never carries a UUID or secret-shaped value in check messages', async () => {
  const runner = new FakeRunner(fullPassResponses());
  const report = await runMameToChaVerifyChecks(runner, MAME_TO_CHA_FIXTURE, {
    managerUserId: MANAGER_USER_ID,
    staffUserId: STAFF_USER_ID,
  }, NOW);
  const serialized = report.checks.map((c) => c.message).join(' ');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized));
  assert.ok(!serialized.includes('@'));
});

test('this file issues only SELECT statements (read-only)', () => {
  for (const text of Object.values(MAME_TO_CHA_VERIFY_SQL)) {
    assert.ok(/^select/i.test(text.trim()), `expected a read-only SELECT: ${text}`);
  }
});

test('this file never queries the protected mame-to-cha-tokyo tenant literally', () => {
  const allSql = Object.values(MAME_TO_CHA_VERIFY_SQL).join(' ');
  assert.ok(!allSql.includes('mame-to-cha-tokyo'));
});
