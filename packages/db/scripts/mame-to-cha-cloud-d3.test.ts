import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseAdminClient, SupabaseAdminUser } from './mame-to-cha-auth.js';
import {
  assertMameToChaAcceptanceSupabaseUrl,
  MAME_TO_CHA_CLOUD_D3_IDENTITIES,
  runMameToChaCloudD3FromEnv,
} from './mame-to-cha-cloud-d3.js';
import { cloudGateConfirmation, MAME_TO_CHA_ACCEPTANCE_TARGET } from './mame-to-cha-cloud-gates.js';

const REF = MAME_TO_CHA_ACCEPTANCE_TARGET.projectRef;
const EXECUTE_INPUT = {
  gate: 'D3',
  projectRef: REF,
  targetEnvironment: 'acceptance',
  confirm: cloudGateConfirmation('D3'),
  mode: 'execute' as const,
};
const ENV = {
  MAME_TO_CHA_CLOUD_SUPABASE_URL: `https://${REF}.supabase.co`,
  MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  MAME_TO_CHA_CLOUD_MANAGER_PASSWORD: 'test-manager-password',
  MAME_TO_CHA_CLOUD_STAFF_PASSWORD: 'test-staff-password',
};

class FakeAdminClient implements SupabaseAdminClient {
  users: SupabaseAdminUser[] = [];
  creates: { email: string; password: string; emailConfirm: boolean }[] = [];

  async listUsers(): Promise<{ users: SupabaseAdminUser[]; error: string | null }> {
    return { users: this.users, error: null };
  }

  async createUser(params: { email: string; password: string; emailConfirm: boolean }): Promise<{
    user: SupabaseAdminUser | null;
    error: string | null;
  }> {
    this.creates.push(params);
    const existing = this.users.find((user) => user.email === params.email);
    if (existing) return { user: null, error: 'User already registered' };
    const user = { id: `user-${this.users.length + 1}`, email: params.email };
    this.users.push(user);
    return { user, error: null };
  }
}

test('D3 Auth URL guard accepts only the exact reviewed HTTPS project origin', () => {
  assert.doesNotThrow(() => assertMameToChaAcceptanceSupabaseUrl(`https://${REF}.supabase.co`));
  assert.throws(
    () => assertMameToChaAcceptanceSupabaseUrl(`https://wrong.supabase.co`),
    /reviewed acceptance project/,
  );
  assert.throws(
    () => assertMameToChaAcceptanceSupabaseUrl(`http://${REF}.supabase.co`),
    /reviewed acceptance project/,
  );
  assert.throws(
    () => assertMameToChaAcceptanceSupabaseUrl(`https://${REF}.supabase.co/auth`),
    /exact project origin/,
  );
});

test('D3 creates only the two fixed synthetic identities and is idempotent', async () => {
  const client = new FakeAdminClient();
  const first = await runMameToChaCloudD3FromEnv(EXECUTE_INPUT, ENV, {
    buildClient: async () => client,
  });
  assert.equal(first.changedOperationCount, 2);
  assert.equal(first.noop, false);
  assert.deepEqual(
    client.creates.map(({ email, emailConfirm }) => ({ email, emailConfirm })),
    [
      { email: MAME_TO_CHA_CLOUD_D3_IDENTITIES.managerEmail, emailConfirm: true },
      { email: MAME_TO_CHA_CLOUD_D3_IDENTITIES.staffEmail, emailConfirm: true },
    ],
  );

  const second = await runMameToChaCloudD3FromEnv(EXECUTE_INPUT, ENV, {
    buildClient: async () => client,
  });
  assert.equal(second.changedOperationCount, 0);
  assert.equal(second.noop, true);
  assert.equal(second.managerUserId, first.managerUserId);
  assert.equal(second.staffUserId, first.staffUserId);
  assert.equal(client.creates.length, 2, 'the no-op run must not call createUser again');
});

test('D3 validates gate, target, and all secrets before constructing a client', async () => {
  let constructed = 0;
  const buildClient = async () => {
    constructed += 1;
    return new FakeAdminClient();
  };
  await assert.rejects(
    () => runMameToChaCloudD3FromEnv({ ...EXECUTE_INPUT, confirm: undefined }, ENV, { buildClient }),
    /confirmation phrase/,
  );
  await assert.rejects(
    () => runMameToChaCloudD3FromEnv(EXECUTE_INPUT, { ...ENV, MAME_TO_CHA_CLOUD_STAFF_PASSWORD: '' }, { buildClient }),
    /STAFF_PASSWORD is required/,
  );
  assert.equal(constructed, 0);
});

test('D3 prefers MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY over the legacy service-role key', async () => {
  let usedKey: string | undefined;
  const client = new FakeAdminClient();
  await runMameToChaCloudD3FromEnv(
    EXECUTE_INPUT,
    {
      ...ENV,
      MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY: 'FAKE-secret-key-d3',
      MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY: 'legacy-synthetic-d3',
    },
    {
      buildClient: async (_url, key) => {
        usedKey = key;
        return client;
      },
    },
  );
  assert.equal(usedKey, 'FAKE-secret-key-d3');
});

test('D3 falls back to the legacy service-role key when SECRET_KEY is absent', async () => {
  let usedKey: string | undefined;
  const client = new FakeAdminClient();
  await runMameToChaCloudD3FromEnv(EXECUTE_INPUT, ENV, {
    buildClient: async (_url, key) => {
      usedKey = key;
      return client;
    },
  });
  assert.equal(usedKey, ENV.MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY);
});

test('D3 fails closed (value-free) when neither privileged key is set', async () => {
  const { MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY: _drop, ...envNoKey } = ENV;
  await assert.rejects(
    () => runMameToChaCloudD3FromEnv(EXECUTE_INPUT, envNoKey, { buildClient: async () => new FakeAdminClient() }),
    /MAME_TO_CHA_CLOUD_SUPABASE_SECRET_KEY \(preferred\) or MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY \(legacy\) is required/,
  );
});

test('D3 never echoes a password, key, or email when Auth fails', async () => {
  const secret = 'do-not-echo-this-secret';
  const client = new FakeAdminClient();
  client.createUser = async () => ({ user: null, error: secret });
  await assert.rejects(
    () => runMameToChaCloudD3FromEnv(
      EXECUTE_INPUT,
      {
        ...ENV,
        MAME_TO_CHA_CLOUD_SUPABASE_SERVICE_ROLE_KEY: secret,
        MAME_TO_CHA_CLOUD_MANAGER_PASSWORD: secret,
      },
      { buildClient: async () => client },
    ),
    (error: Error) =>
      !error.message.includes(secret) &&
      !error.message.includes(MAME_TO_CHA_CLOUD_D3_IDENTITIES.managerEmail),
  );
});
