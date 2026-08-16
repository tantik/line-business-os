import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLocalSupabaseUrl,
  findOrCreateLocalAuthUser,
  provisionMameToChaLocalAuthUsers,
  type MameToChaAuthEnv,
  type SupabaseAdminClient,
  type SupabaseAdminUser,
} from './mame-to-cha-auth.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const LOCAL_URL = 'http://127.0.0.1:54321';
const CLOUD_URL = 'https://abcxyz.supabase.co';
const SECRET_SERVICE_ROLE_KEY = 'synthetic-local-service-role-key-should-never-leak';
const SECRET_PASSWORD = 'synthetic-local-only-password-should-never-leak';

function fullEnv(overrides: Partial<MameToChaAuthEnv> = {}): MameToChaAuthEnv {
  return {
    MAME_TO_CHA_LOCAL_SUPABASE_URL: LOCAL_URL,
    MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE_ROLE_KEY,
    MAME_TO_CHA_LOCAL_MANAGER_EMAIL: 'manager@example.test',
    MAME_TO_CHA_LOCAL_MANAGER_PASSWORD: SECRET_PASSWORD,
    MAME_TO_CHA_LOCAL_STAFF_EMAIL: 'staff@example.test',
    MAME_TO_CHA_LOCAL_STAFF_PASSWORD: SECRET_PASSWORD,
    ...overrides,
  };
}

// ===========================================================================
// assertLocalSupabaseUrl
// ===========================================================================

test('assertLocalSupabaseUrl accepts a loopback URL', () => {
  assert.doesNotThrow(() => assertLocalSupabaseUrl(LOCAL_URL));
  assert.doesNotThrow(() => assertLocalSupabaseUrl('http://localhost:54321'));
});

test('assertLocalSupabaseUrl rejects a Cloud host', () => {
  assert.throws(() => assertLocalSupabaseUrl(CLOUD_URL));
});

test('assertLocalSupabaseUrl rejects a malformed URL', () => {
  assert.throws(() => assertLocalSupabaseUrl('not-a-url'));
});

test('assertLocalSupabaseUrl rejects a non-loopback public host', () => {
  assert.throws(() => assertLocalSupabaseUrl('https://example.com'));
});

// ===========================================================================
// findOrCreateLocalAuthUser — idempotent find-or-create
// ===========================================================================

function fakeClient(users: SupabaseAdminUser[] = []): SupabaseAdminClient & { createCalls: number } {
  let createCalls = 0;
  return {
    get createCalls() {
      return createCalls;
    },
    async createUser({ email }) {
      createCalls += 1;
      const existing = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
      if (existing) return { user: null, error: 'Email already registered' };
      const created = { id: `generated-${users.length + 1}`, email };
      users.push(created);
      return { user: created, error: null };
    },
    async listUsers({ page, perPage }) {
      const start = (page - 1) * perPage;
      return { users: users.slice(start, start + perPage), error: null };
    },
  };
}

test('creates a new user when none exists', async () => {
  const client = fakeClient();
  const result = await findOrCreateLocalAuthUser(client, 'manager@example.test', 'pw');
  assert.equal(result.created, true);
  assert.ok(result.userId);
});

test('finds the existing user idempotently on a second call (no duplicate)', async () => {
  const client = fakeClient();
  const first = await findOrCreateLocalAuthUser(client, 'manager@example.test', 'pw');
  const second = await findOrCreateLocalAuthUser(client, 'manager@example.test', 'pw');
  assert.equal(second.created, false);
  assert.equal(second.userId, first.userId);
  assert.equal(client.createCalls, 2, 'createUser is still attempted first each time (idempotent via the already-registered fallback)');
});

test('an already-registered email is matched case-insensitively', async () => {
  const client = fakeClient([{ id: 'existing-id', email: 'Manager@Example.Test' }]);
  const result = await findOrCreateLocalAuthUser(client, 'manager@example.test', 'pw');
  assert.equal(result.created, false);
  assert.equal(result.userId, 'existing-id');
});

test('a non-"already registered" createUser failure surfaces a safe error, not raw driver text', async () => {
  const client: SupabaseAdminClient = {
    async createUser() {
      return { user: null, error: 'connection reset by peer at 10.0.0.5' };
    },
    async listUsers() {
      return { users: [], error: null };
    },
  };
  await assert.rejects(findOrCreateLocalAuthUser(client, 'manager@example.test', 'pw'), (err: Error) => {
    assert.ok(!err.message.includes('10.0.0.5'));
    return true;
  });
});

// ===========================================================================
// provisionMameToChaLocalAuthUsers — fail-closed gates
// ===========================================================================

test('provisions both users idempotently and returns only ids + created flags', async () => {
  const users: SupabaseAdminUser[] = [];
  const result = await provisionMameToChaLocalAuthUsers(fullEnv(), () => fakeClient(users));
  assert.ok(result.managerUserId);
  assert.ok(result.staffUserId);
  assert.notEqual(result.managerUserId, result.staffUserId);
  assert.equal(result.managerCreated, true);
  assert.equal(result.staffCreated, true);
  assert.equal(Object.keys(result).length, 4, 'result must carry no extra fields (no email, no password)');
});

test('rejects a missing Supabase URL before constructing any client', async () => {
  let built = false;
  await assert.rejects(
    provisionMameToChaLocalAuthUsers(fullEnv({ MAME_TO_CHA_LOCAL_SUPABASE_URL: undefined }), () => {
      built = true;
      return fakeClient();
    }),
    /MAME_TO_CHA_LOCAL_SUPABASE_URL is required/,
  );
  assert.equal(built, false);
});

test('rejects a Cloud-like Supabase URL before constructing any client', async () => {
  let built = false;
  await assert.rejects(
    provisionMameToChaLocalAuthUsers(fullEnv({ MAME_TO_CHA_LOCAL_SUPABASE_URL: CLOUD_URL }), () => {
      built = true;
      return fakeClient();
    }),
  );
  assert.equal(built, false);
});

test('rejects a missing service-role key before constructing any client', async () => {
  let built = false;
  await assert.rejects(
    provisionMameToChaLocalAuthUsers(fullEnv({ MAME_TO_CHA_LOCAL_SUPABASE_SERVICE_ROLE_KEY: undefined }), () => {
      built = true;
      return fakeClient();
    }),
    /SERVICE_ROLE_KEY is required/,
  );
  assert.equal(built, false);
});

test('rejects a real-looking (non-local-test) manager email before constructing any client', async () => {
  let built = false;
  await assert.rejects(
    provisionMameToChaLocalAuthUsers(fullEnv({ MAME_TO_CHA_LOCAL_MANAGER_EMAIL: 'owner@mame-to-cha.jp' }), () => {
      built = true;
      return fakeClient();
    }),
  );
  assert.equal(built, false);
});

test('never leaks the service-role key or password in a thrown error message', async () => {
  await assert.rejects(
    provisionMameToChaLocalAuthUsers(fullEnv({ MAME_TO_CHA_LOCAL_SUPABASE_URL: CLOUD_URL }), () => fakeClient()),
    (err: Error) => {
      assert.ok(!err.message.includes(SECRET_SERVICE_ROLE_KEY));
      assert.ok(!err.message.includes(SECRET_PASSWORD));
      return true;
    },
  );
});

// ===========================================================================
// Structural guarantees
// ===========================================================================

test('mame-to-cha-auth.ts is never imported by apps/web', () => {
  const grepDir = (dir: string): boolean => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue;
        if (grepDir(full)) return true;
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const content = readFileSync(full, 'utf8');
        if (content.includes('mame-to-cha-auth')) return true;
      }
    }
    return false;
  };
  const webSrc = path.join(REPO_ROOT, 'apps', 'web', 'src');
  assert.equal(grepDir(webSrc), false, 'apps/web must never import the local Auth admin script');
});

test('no NEXT_PUBLIC_ variable is actually read by this module (doc-comment mentions are fine)', () => {
  const source = readFileSync(path.join(HERE, 'mame-to-cha-auth.ts'), 'utf8');
  assert.ok(!/env\.NEXT_PUBLIC_|process\.env\.NEXT_PUBLIC_|NEXT_PUBLIC_\w+\??:/.test(source));
});

test('this module never imports a service worker/no Data API tables directly (no core./workforce. SQL)', () => {
  const source = readFileSync(path.join(HERE, 'mame-to-cha-auth.ts'), 'utf8');
  assert.ok(!/from\s+(core|workforce)\./i.test(source));
});
