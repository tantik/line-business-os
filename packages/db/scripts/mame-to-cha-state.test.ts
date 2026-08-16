import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QueryRunner } from './onboard-db.js';
import {
  MAME_TO_CHA_STATE_SQL,
  loadExistingMameToChaFixtureState,
  validateMameToChaIdentityOrThrow,
} from './mame-to-cha-state.js';
import type { MameToChaFixtureIdentity } from './mame-to-cha-state.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { localDateTimeToUtcIso, resolveIsoDate } from './mame-to-cha-dates.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const LOCATION_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_USER_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_USER_ID = '66666666-6666-4666-8666-666666666666';
const EMPLOYEE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const IDENTITY: MameToChaFixtureIdentity = { managerUserId: MANAGER_USER_ID, staffUserId: STAFF_USER_ID };
const NOW = new Date('2026-06-01T00:00:00Z');

class FakeRunner implements QueryRunner {
  constructor(private readonly responses: Record<string, unknown[] | ((v: readonly unknown[]) => unknown[])> = {}) {}
  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    const resp = this.responses[text];
    if (typeof resp === 'function') return { rows: resp(values ?? []) as T[] };
    return { rows: (resp ?? []) as T[] };
  }
}

test('when the tenant does not exist, every dependent read is skipped and everything reports absent', async () => {
  const runner = new FakeRunner({ [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [] });
  const loaded = await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, NOW);
  assert.equal(loaded.ids.tenantId, null);
  assert.equal(loaded.ids.locationId, null);
  assert.equal(loaded.state.tenantExists, false);
  assert.equal(loaded.state.locationExists, false);
  assert.equal(loaded.ids.staffEmployeeId, null);
});

test('reports the tenant/location/module/membership state accurately when everything exists', async () => {
  const shiftDate = resolveIsoDate(NOW, MAME_TO_CHA_FIXTURE.acceptanceData.shiftAssignmentDayOffset);
  const startsAtIso = localDateTimeToUtcIso(
    shiftDate,
    MAME_TO_CHA_FIXTURE.shiftTypes[0]!.startsAtLocal,
    MAME_TO_CHA_FIXTURE.location.timezone,
  );

  const runner = new FakeRunner({
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [{ id: TENANT_ID, name: MAME_TO_CHA_FIXTURE.tenant.displayName, kind: 'client' }],
    [MAME_TO_CHA_STATE_SQL.locationsByTenant]: [{ id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: true }],
    [MAME_TO_CHA_STATE_SQL.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
    [MAME_TO_CHA_STATE_SQL.roleByKey]: (v) => [{ id: v[0] === 'manager' ? 'role-manager' : 'role-employee' }],
    [MAME_TO_CHA_STATE_SQL.userMirrorExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.membershipStatus]: [{ status: 'active' }],
    [MAME_TO_CHA_STATE_SQL.roleAssignmentExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.employeeByUser]: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }],
    [MAME_TO_CHA_STATE_SQL.shiftTypeCodes]: MAME_TO_CHA_FIXTURE.shiftTypes.map((s) => ({ code: s.code })),
    [MAME_TO_CHA_STATE_SQL.recipeCategoryLabels]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ label_ja: r.categoryLabelJa })),
    [MAME_TO_CHA_STATE_SQL.recipeTitles]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ title_ja: r.titleJa })),
    [MAME_TO_CHA_STATE_SQL.shiftAssignmentExists]: (v) => [{ exists: v[2] === startsAtIso }],
    [MAME_TO_CHA_STATE_SQL.shiftPreferenceExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.workReportExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.correctionRequestExists]: [{ exists: true }],
  });

  const loaded = await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, NOW);
  assert.equal(loaded.ids.tenantId, TENANT_ID);
  assert.equal(loaded.ids.locationId, LOCATION_ID);
  assert.equal(loaded.state.tenantExists, true);
  assert.equal(loaded.state.locationExists, true);
  assert.deepEqual(loaded.state.enabledModules, ['core', 'workforce']);
  assert.equal(loaded.state.membershipsByLogicalId?.['manager-1'], 'active');
  assert.equal(loaded.state.membershipsByLogicalId?.['staff-1'], 'active');
  assert.equal(loaded.state.employeeBindingsByLogicalId?.['staff-1'], true);
  assert.equal(loaded.ids.staffEmployeeId, EMPLOYEE_ID);
  assert.equal(loaded.state.acceptanceDataPresent?.shiftAssignment, true);
  assert.equal(loaded.state.acceptanceDataPresent?.workReport, true);
  assert.equal(loaded.state.userMirrorsByLogicalId?.['manager-1'], true);
  assert.equal(loaded.state.userMirrorsByLogicalId?.['staff-1'], true);
});

test('state loader reads both manager and staff core.users mirrors independently', async () => {
  const runner = new FakeRunner({
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [],
    [MAME_TO_CHA_STATE_SQL.roleByKey]: (v) => [{ id: v[0] === 'manager' ? 'role-manager' : 'role-employee' }],
    // Only the manager's auth user id has a core.users mirror; staff does not.
    [MAME_TO_CHA_STATE_SQL.userMirrorExists]: (v) => [{ exists: v[0] === MANAGER_USER_ID }],
  });
  const loaded = await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, NOW);
  assert.equal(loaded.state.userMirrorsByLogicalId?.['manager-1'], true);
  assert.equal(loaded.state.userMirrorsByLogicalId?.['staff-1'], false);
});

test('user mirror lookup runs even when the tenant does not exist (core.users is not tenant-scoped)', async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const runner: QueryRunner = {
    async query<T = unknown>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values: values ?? [] });
      if (text === MAME_TO_CHA_STATE_SQL.tenantBySlug) return { rows: [] as T[] };
      if (text === MAME_TO_CHA_STATE_SQL.roleByKey) return { rows: [{ id: 'some-role-id' }] as T[] };
      if (text === MAME_TO_CHA_STATE_SQL.userMirrorExists) return { rows: [{ exists: false }] as T[] };
      return { rows: [] as T[] };
    },
  };
  await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, NOW);
  const mirrorCalls = calls.filter((c) => c.text === MAME_TO_CHA_STATE_SQL.userMirrorExists);
  assert.equal(mirrorCalls.length, 2, 'both manager and staff mirrors must be checked regardless of tenant existence');
});

// ===========================================================================
// validateMameToChaIdentityOrThrow -- reject identical manager/staff ids
// ===========================================================================

test('validateMameToChaIdentityOrThrow accepts distinct manager/staff ids', () => {
  assert.doesNotThrow(() => validateMameToChaIdentityOrThrow(IDENTITY));
});

test('validateMameToChaIdentityOrThrow rejects identical manager/staff ids', () => {
  assert.throws(
    () => validateMameToChaIdentityOrThrow({ managerUserId: MANAGER_USER_ID, staffUserId: MANAGER_USER_ID }),
    /distinct/,
  );
});

test('loadExistingMameToChaFixtureState rejects identical manager/staff ids before any query', async () => {
  let queried = false;
  const runner: QueryRunner = {
    async query() {
      queried = true;
      return { rows: [] };
    },
  };
  await assert.rejects(
    loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, { managerUserId: MANAGER_USER_ID, staffUserId: MANAGER_USER_ID }, NOW),
    /distinct/,
  );
  assert.equal(queried, false, 'no query should run once the identity gate throws');
});

test('an inactive location with a matching name is never treated as the resolved location', async () => {
  const runner = new FakeRunner({
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [{ id: TENANT_ID, name: MAME_TO_CHA_FIXTURE.tenant.displayName, kind: 'client' }],
    [MAME_TO_CHA_STATE_SQL.locationsByTenant]: [{ id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: false }],
    [MAME_TO_CHA_STATE_SQL.enabledModules]: [],
    [MAME_TO_CHA_STATE_SQL.roleByKey]: [],
    [MAME_TO_CHA_STATE_SQL.membershipStatus]: [],
    [MAME_TO_CHA_STATE_SQL.roleAssignmentExists]: [{ exists: false }],
    [MAME_TO_CHA_STATE_SQL.employeeByUser]: [],
    [MAME_TO_CHA_STATE_SQL.recipeCategoryLabels]: [],
    [MAME_TO_CHA_STATE_SQL.recipeTitles]: [],
  });
  const loaded = await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, NOW);
  assert.equal(loaded.ids.locationId, null, 'an inactive location must never be resolved as the active one');
  assert.equal(loaded.state.locationExists, false);
  assert.equal(loaded.anchorNow, NOW);
});

test('existing tenant creation time anchors acceptance lookups across later runs', async () => {
  const createdAt = new Date('2026-07-18T07:33:20.000Z');
  const laterNow = new Date('2026-07-24T00:00:00.000Z');
  const expectedShiftDate = resolveIsoDate(createdAt, MAME_TO_CHA_FIXTURE.acceptanceData.shiftAssignmentDayOffset);
  const expectedStartsAt = localDateTimeToUtcIso(
    expectedShiftDate,
    MAME_TO_CHA_FIXTURE.shiftTypes[0]!.startsAtLocal,
    MAME_TO_CHA_FIXTURE.location.timezone,
  );
  const runner = new FakeRunner({
    [MAME_TO_CHA_STATE_SQL.tenantBySlug]: [{
      id: TENANT_ID,
      name: MAME_TO_CHA_FIXTURE.tenant.displayName,
      kind: 'client',
      created_at: createdAt,
    }],
    [MAME_TO_CHA_STATE_SQL.locationsByTenant]: [{ id: LOCATION_ID, name: MAME_TO_CHA_FIXTURE.location.name, is_active: true }],
    [MAME_TO_CHA_STATE_SQL.enabledModules]: [{ module: 'core' }, { module: 'workforce' }],
    [MAME_TO_CHA_STATE_SQL.roleByKey]: (v) => [{ id: v[0] === 'manager' ? 'role-manager' : 'role-employee' }],
    [MAME_TO_CHA_STATE_SQL.userMirrorExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.membershipStatus]: [{ status: 'active' }],
    [MAME_TO_CHA_STATE_SQL.roleAssignmentExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.employeeByUser]: [{ id: EMPLOYEE_ID, location_id: LOCATION_ID, is_active: true }],
    [MAME_TO_CHA_STATE_SQL.shiftTypeCodes]: MAME_TO_CHA_FIXTURE.shiftTypes.map((s) => ({ code: s.code })),
    [MAME_TO_CHA_STATE_SQL.recipeCategoryLabels]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ label_ja: r.categoryLabelJa })),
    [MAME_TO_CHA_STATE_SQL.recipeTitles]: MAME_TO_CHA_FIXTURE.recipes.map((r) => ({ title_ja: r.titleJa })),
    [MAME_TO_CHA_STATE_SQL.shiftAssignmentExists]: (v) => [{ exists: v[2] === expectedStartsAt }],
    [MAME_TO_CHA_STATE_SQL.shiftPreferenceExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.workReportExists]: [{ exists: true }],
    [MAME_TO_CHA_STATE_SQL.correctionRequestExists]: [{ exists: true }],
  });

  const loaded = await loadExistingMameToChaFixtureState(runner, MAME_TO_CHA_FIXTURE, IDENTITY, laterNow);
  assert.equal(loaded.anchorNow.toISOString(), createdAt.toISOString());
  assert.equal(loaded.state.acceptanceDataPresent?.shiftAssignment, true);
});

test('this file issues only SELECT statements (read-only)', async () => {
  const texts = Object.values(MAME_TO_CHA_STATE_SQL);
  for (const text of texts) {
    assert.ok(/^select/i.test(text.trim()), `expected a read-only SELECT: ${text}`);
  }
});

test('existence queries return PostgreSQL booleans instead of integer sentinel rows', () => {
  const existenceQueries = [
    MAME_TO_CHA_STATE_SQL.userMirrorExists,
    MAME_TO_CHA_STATE_SQL.roleAssignmentExists,
    MAME_TO_CHA_STATE_SQL.shiftAssignmentExists,
    MAME_TO_CHA_STATE_SQL.shiftPreferenceExists,
    MAME_TO_CHA_STATE_SQL.workReportExists,
    MAME_TO_CHA_STATE_SQL.correctionRequestExists,
  ];
  for (const text of existenceQueries) {
    assert.match(text, /^select exists \(/i);
    assert.doesNotMatch(text, /^select 1 as exists/i);
  }
});
