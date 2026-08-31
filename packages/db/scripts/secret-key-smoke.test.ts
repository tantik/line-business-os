import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLOUD_DEV_API_HOST,
  NIL_UUID,
  classifyProbeOutcome,
  parseSecretKeySmokeEnv,
  runSecretKeySmoke,
  type SecretKeySmokeProbeClient,
} from './secret-key-smoke.js';
import { runSecretKeySmokeCli } from './secret-key-smoke-cli.js';

const VALID_URL = `https://${CLOUD_DEV_API_HOST}`;
// Built at runtime so the literal token never appears in source (GitHub
// secret-scanning push protection matches a full `sb_secret_…` literal).
const FAKE_SECRET_KEY = ['sb', 'secret', 'FAKEvalueNeverRealForTestsOnly'].join('_');
const FAKE_LEGACY_JWT = ['eyFAKE', 'eyFAKE', 'legacyMustNotBeUsed'].join('.');

function probeClient(outcome: { status: number | null; threw?: boolean }): SecretKeySmokeProbeClient {
  return {
    probePrivilegedRead: async () => ({ status: outcome.status, threw: outcome.threw ?? false }),
  };
}

// --- parseSecretKeySmokeEnv -------------------------------------------------

test('parse: accepts exactly SUPABASE_URL + SUPABASE_SECRET_KEY', () => {
  const r = parseSecretKeySmokeEnv({ SUPABASE_URL: VALID_URL, SUPABASE_SECRET_KEY: FAKE_SECRET_KEY });
  assert.equal(r.ok, true);
});

test('parse: missing both -> ENV_MISSING naming both variables', () => {
  const r = parseSecretKeySmokeEnv({});
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.category, 'SMOKE_FAIL_ENV_MISSING');
    assert.deepEqual(r.problems.sort(), ['SUPABASE_SECRET_KEY', 'SUPABASE_URL']);
  }
});

test('parse: blank / whitespace values count as missing', () => {
  const r = parseSecretKeySmokeEnv({ SUPABASE_URL: '   ', SUPABASE_SECRET_KEY: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.category, 'SMOKE_FAIL_ENV_MISSING');
});

test('parse: rejects a URL that is not the reviewed Cloud DEV host', () => {
  for (const bad of [
    'https://evil.example.com',
    'https://jsgmmsdkuptdsxtcxhsv.supabase.co', // a different project
    'http://127.0.0.1:54321',
    `https://${CLOUD_DEV_API_HOST}/rest/v1`,
    `https://${CLOUD_DEV_API_HOST}?x=1`,
    `https://user:pw@${CLOUD_DEV_API_HOST}`,
    'not-a-url',
  ]) {
    const r = parseSecretKeySmokeEnv({ SUPABASE_URL: bad, SUPABASE_SECRET_KEY: FAKE_SECRET_KEY });
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.equal(r.category, 'SMOKE_FAIL_ENV_INVALID');
  }
});

test('parse: rejects a non-sb_secret key (e.g. a legacy JWT)', () => {
  const r = parseSecretKeySmokeEnv({ SUPABASE_URL: VALID_URL, SUPABASE_SECRET_KEY: FAKE_LEGACY_JWT });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.category, 'SMOKE_FAIL_ENV_INVALID');
    assert.ok(r.problems.some((p) => p.startsWith('SUPABASE_SECRET_KEY')));
  }
});

test('parse: never echoes the secret value in problems', () => {
  const r = parseSecretKeySmokeEnv({ SUPABASE_URL: 'not-a-url', SUPABASE_SECRET_KEY: FAKE_SECRET_KEY });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(!r.problems.join(' ').includes(FAKE_SECRET_KEY));
});

// --- classifyProbeOutcome -------------------------------------------------

test('classify: 200 / 404 -> OK', () => {
  assert.equal(classifyProbeOutcome({ status: 200, threw: false }).category, 'SECRET_KEY_SMOKE_OK');
  assert.equal(classifyProbeOutcome({ status: 404, threw: false }).category, 'SECRET_KEY_SMOKE_OK');
});

test('classify: 401 / 403 -> KEY_REJECTED', () => {
  assert.equal(classifyProbeOutcome({ status: 401, threw: false }).category, 'SMOKE_FAIL_KEY_REJECTED');
  assert.equal(classifyProbeOutcome({ status: 403, threw: false }).category, 'SMOKE_FAIL_KEY_REJECTED');
});

test('classify: 5xx -> UPSTREAM, transport throw -> TRANSPORT, null -> UNKNOWN', () => {
  assert.equal(classifyProbeOutcome({ status: 503, threw: false }).category, 'SMOKE_FAIL_UPSTREAM');
  assert.equal(classifyProbeOutcome({ status: null, threw: true }).category, 'SMOKE_FAIL_TRANSPORT');
  assert.equal(classifyProbeOutcome({ status: null, threw: false }).category, 'SMOKE_FAIL_UNKNOWN');
  assert.equal(classifyProbeOutcome({ status: 418, threw: false }).category, 'SMOKE_FAIL_UNKNOWN');
});

// --- runSecretKeySmoke --------------------------------------------------

test('run: happy path with an injected client -> OK, buildClient got the pinned URL + key', async () => {
  let seenUrl = '';
  let seenKey = '';
  const result = await runSecretKeySmoke({
    env: { SUPABASE_URL: VALID_URL, SUPABASE_SECRET_KEY: FAKE_SECRET_KEY },
    buildClient: async (url, key) => {
      seenUrl = url;
      seenKey = key;
      return probeClient({ status: 404 });
    },
  });
  assert.equal(result.category, 'SECRET_KEY_SMOKE_OK');
  assert.equal(seenUrl, VALID_URL);
  assert.equal(seenKey, FAKE_SECRET_KEY);
});

test('run: env failure short-circuits before any client is built', async () => {
  let built = false;
  const result = await runSecretKeySmoke({
    env: { SUPABASE_URL: VALID_URL },
    buildClient: async () => {
      built = true;
      return probeClient({ status: 404 });
    },
  });
  assert.equal(built, false);
  assert.equal(result.category, 'SMOKE_FAIL_ENV_MISSING');
});

test('run: a throwing probe is contained as TRANSPORT, not propagated', async () => {
  const result = await runSecretKeySmoke({
    env: { SUPABASE_URL: VALID_URL, SUPABASE_SECRET_KEY: FAKE_SECRET_KEY },
    buildClient: async () => ({
      probePrivilegedRead: async () => {
        throw new Error('boom');
      },
    }),
  });
  assert.equal(result.category, 'SMOKE_FAIL_TRANSPORT');
});

// --- CLI -------------------------------------------------------------------

test('cli: prints the OK token and returns 0', async () => {
  const lines: string[] = [];
  const code = await runSecretKeySmokeCli({
    print: (l) => lines.push(l),
    run: async () => ({ category: 'SECRET_KEY_SMOKE_OK', detail: 'status=404' }),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, ['SECRET_KEY_SMOKE_OK (status=404)']);
});

test('cli: non-OK category returns 1', async () => {
  const lines: string[] = [];
  const code = await runSecretKeySmokeCli({
    print: (l) => lines.push(l),
    run: async () => ({ category: 'SMOKE_FAIL_KEY_REJECTED', detail: 'status=401' }),
  });
  assert.equal(code, 1);
  assert.deepEqual(lines, ['SMOKE_FAIL_KEY_REJECTED (status=401)']);
});

// --- source-level guardrails --------------------------------------------

test('source does not consume the legacy key, serverEnv, createServiceClient, or Mame To Cha env', () => {
  for (const f of ['secret-key-smoke.ts', 'secret-key-smoke-cli.ts']) {
    // Strip block + line comments so doc prose may still discuss these names.
    const raw = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\bSUPABASE_SERVICE_ROLE_KEY\b/.test(code), `${f} consumes the legacy key`);
    assert.ok(!/\bcreateServiceClient\b/.test(code), `${f} calls createServiceClient`);
    assert.ok(!/\bserverEnv\b/.test(code), `${f} calls serverEnv`);
    assert.ok(!/@line-os\/config/.test(code), `${f} imports @line-os/config`);
    assert.ok(!/\bMAME_TO_CHA\w*/.test(code), `${f} references Mame To Cha tooling`);
    // No `process.env.<NAME>` member reads (the ESLint guardrail bans the
    // privileged-key ones; we avoid the pattern entirely and pass the whole
    // env object down instead — same shape as `serverEnv()`).
    assert.ok(!/process\.env\.[A-Za-z]/.test(code), `${f} reads process.env by member`);
    assert.ok(!/process\.env\[/.test(code), `${f} reads process.env by subscript`);
  }
});

test('probe targets the nil UUID', () => {
  assert.equal(NIL_UUID, '00000000-0000-0000-0000-000000000000');
});
