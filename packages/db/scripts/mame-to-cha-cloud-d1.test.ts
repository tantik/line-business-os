import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryRunner } from './onboard-db.js';
import { MAME_TO_CHA_FIXTURE } from './mame-to-cha-fixture.js';
import { MAME_TO_CHA_WRITE_SQL } from './mame-to-cha-write.js';
import { cloudGateConfirmation, MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';
import {
  assertMameToChaAcceptanceDatabaseUrl,
  executeMameToChaCloudD1,
  MAME_TO_CHA_CLOUD_D1_SQL,
  runMameToChaCloudD1FromEnv,
  type CloudD1Client,
} from './mame-to-cha-cloud-d1.js';

const REF = MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
const DIRECT_URL = `postgresql://postgres:test-only@db.${REF}.supabase.co/postgres?sslmode=require`;
const POOLER_URL = `postgresql://postgres.${REF}:test-only@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`;
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

class StateRunner implements QueryRunner {
  calls: { text: string; values?: readonly unknown[] }[] = [];
  tenant: { id: string; name: string; kind: string } | undefined;
  locations: { id: string; name: string; timezone: string; is_active: boolean }[] = [];

  async query<R = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: R[] }> {
    this.calls.push({ text, values });
    if (text === MAME_TO_CHA_CLOUD_D1_SQL.selectTenant) {
      return { rows: (this.tenant === undefined ? [] : [this.tenant]) as R[] };
    }
    if (text === MAME_TO_CHA_WRITE_SQL.insertTenant) {
      this.tenant = {
        id: TENANT_ID,
        name: String(values?.[1]),
        kind: String(values?.[2]),
      };
    }
    if (text === MAME_TO_CHA_CLOUD_D1_SQL.selectLocations) {
      return { rows: this.locations as R[] };
    }
    if (text === MAME_TO_CHA_WRITE_SQL.insertLocation) {
      this.locations.push({
        id: '20000000-0000-4000-8000-000000000002',
        name: String(values?.[1]),
        timezone: String(values?.[2]),
        is_active: true,
      });
    }
    return { rows: [] };
  }
}

test('database URL guard accepts only the exact reviewed direct or pooler target with TLS', () => {
  assert.equal(assertMameToChaAcceptanceDatabaseUrl(DIRECT_URL).connectionMode, 'direct');
  assert.equal(assertMameToChaAcceptanceDatabaseUrl(POOLER_URL).connectionMode, 'pooler');
  assert.throws(
    () => assertMameToChaAcceptanceDatabaseUrl(DIRECT_URL.replace(REF, 'another-project')),
    /reviewed acceptance project/,
  );
  assert.throws(
    () => assertMameToChaAcceptanceDatabaseUrl(DIRECT_URL.replace('sslmode=require', 'sslmode=disable')),
    /require TLS/,
  );
  assert.throws(() => assertMameToChaAcceptanceDatabaseUrl('not-a-url'), /not a valid URL/);
});

test('fresh D1 creates only tenant/location plus changed-only audit rows', async () => {
  const runner = new StateRunner();
  const result = await executeMameToChaCloudD1(runner);
  assert.equal(result.changedOperationCount, 2);
  assert.equal(result.auditRowCount, 3);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertTenant).length, 1);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertLocation).length, 1);
  assert.equal(runner.calls.filter((call) => call.text === MAME_TO_CHA_WRITE_SQL.insertAudit).length, 3);
  assert.ok(
    runner.calls.every(
      (call) =>
        !call.text.includes('tenant_modules') &&
        !call.text.includes('tenant_memberships') &&
        !call.text.includes('workforce.'),
    ),
  );
});

test('fully existing exact D1 state is a no-write no-audit result', async () => {
  const runner = new StateRunner();
  runner.tenant = {
    id: TENANT_ID,
    name: MAME_TO_CHA_FIXTURE.tenant.displayName,
    kind: MAME_TO_CHA_FIXTURE.tenant.kind,
  };
  runner.locations = [{
    id: '20000000-0000-4000-8000-000000000002',
    name: MAME_TO_CHA_FIXTURE.location.name,
    timezone: MAME_TO_CHA_FIXTURE.location.timezone,
    is_active: true,
  }];
  const result = await executeMameToChaCloudD1(runner);
  assert.equal(result.changedOperationCount, 0);
  assert.equal(result.auditRowCount, 0);
  assert.equal(runner.calls.some((call) => call.text.startsWith('insert ')), false);
});

test('conflicting tenant or location fails before a fixture insert', async () => {
  const tenantConflict = new StateRunner();
  tenantConflict.tenant = { id: TENANT_ID, name: 'Other', kind: 'client' };
  await assert.rejects(() => executeMameToChaCloudD1(tenantConflict), /conflicting tenant/);
  assert.equal(tenantConflict.calls.some((call) => call.text.startsWith('insert ')), false);

  const locationConflict = new StateRunner();
  locationConflict.tenant = {
    id: TENANT_ID,
    name: MAME_TO_CHA_FIXTURE.tenant.displayName,
    kind: MAME_TO_CHA_FIXTURE.tenant.kind,
  };
  locationConflict.locations = [{
    id: '20000000-0000-4000-8000-000000000002',
    name: MAME_TO_CHA_FIXTURE.location.name,
    timezone: 'UTC',
    is_active: true,
  }];
  await assert.rejects(() => executeMameToChaCloudD1(locationConflict), /conflicting fixture location/);
  assert.equal(locationConflict.calls.some((call) => call.text.startsWith('insert ')), false);
});

class FakeClient implements CloudD1Client {
  events: string[] = [];
  readonly runner: StateRunner;
  constructor(runner: StateRunner) {
    this.runner = runner;
  }
  async connect(): Promise<void> {
    this.events.push('connect');
  }
  async query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }> {
    this.events.push(text);
    return this.runner.query(text, values);
  }
  async end(): Promise<void> {
    this.events.push('end');
  }
}

const EXECUTE_INPUT = {
  gate: 'D1',
  projectRef: REF,
  targetEnvironment: 'acceptance',
  confirm: cloudGateConfirmation('D1'),
  mode: 'execute' as const,
};

test('wrapper validates gate and URL before constructing or connecting a client', async () => {
  let constructed = 0;
  const createClient = () => {
    constructed += 1;
    return new FakeClient(new StateRunner());
  };
  await assert.rejects(
    () => runMameToChaCloudD1FromEnv({ ...EXECUTE_INPUT, confirm: undefined }, { MAME_TO_CHA_CLOUD_DATABASE_URL: DIRECT_URL }, { createClient }),
    /confirmation phrase/,
  );
  assert.equal(constructed, 0);

  await assert.rejects(
    () => runMameToChaCloudD1FromEnv(EXECUTE_INPUT, { MAME_TO_CHA_CLOUD_DATABASE_URL: DIRECT_URL.replace(REF, 'wrong') }, { createClient }),
    /reviewed acceptance project/,
  );
  assert.equal(constructed, 0);
});

test('wrapper commits changed D1 once and rolls back an exact no-op', async () => {
  const freshClient = new FakeClient(new StateRunner());
  const fresh = await runMameToChaCloudD1FromEnv(
    EXECUTE_INPUT,
    { MAME_TO_CHA_CLOUD_DATABASE_URL: DIRECT_URL },
    { createClient: () => freshClient },
  );
  assert.equal(fresh.committed, true);
  assert.equal(freshClient.events.filter((event) => event === MAME_TO_CHA_CLOUD_D1_SQL.commit).length, 1);

  const existingRunner = new StateRunner();
  existingRunner.tenant = {
    id: TENANT_ID,
    name: MAME_TO_CHA_FIXTURE.tenant.displayName,
    kind: MAME_TO_CHA_FIXTURE.tenant.kind,
  };
  existingRunner.locations = [{
    id: '20000000-0000-4000-8000-000000000002',
    name: MAME_TO_CHA_FIXTURE.location.name,
    timezone: MAME_TO_CHA_FIXTURE.location.timezone,
    is_active: true,
  }];
  const existingClient = new FakeClient(existingRunner);
  const existing = await runMameToChaCloudD1FromEnv(
    EXECUTE_INPUT,
    { MAME_TO_CHA_CLOUD_DATABASE_URL: DIRECT_URL },
    { createClient: () => existingClient },
  );
  assert.equal(existing.noop, true);
  assert.equal(existingClient.events.includes(MAME_TO_CHA_CLOUD_D1_SQL.commit), false);
  assert.equal(existingClient.events.includes(MAME_TO_CHA_CLOUD_D1_SQL.rollback), true);
});
