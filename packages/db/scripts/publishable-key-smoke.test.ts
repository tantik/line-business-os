import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLOUD_DEV_API_HOST,
  NONEXISTENT_PROBE_RELATION,
  classifyProbeOutcome,
  parsePublishableKeySmokeEnv,
  runPublishableKeySmoke,
  type PublishableKeySmokeProbe,
} from './publishable-key-smoke.js';
import { runPublishableKeySmokeCli } from './publishable-key-smoke-cli.js';

const VALID_URL = `https://${CLOUD_DEV_API_HOST}`;
// Built at runtime so no full key-shaped literal ever appears in source.
const FAKE_PUBLISHABLE_KEY = ['sb', 'publishable', 'FAKEvalueNeverRealForTestsOnly'].join('_');
const FAKE_LEGACY_ANON_JWT = ['eyFAKE', 'eyFAKE', 'legacyAnonMustNotBeUsed'].join('.');

function probe(outcome: { status: number | null; threw?: boolean }): PublishableKeySmokeProbe {
  return {
    probeGatewayAcceptsKey: async () => ({ status: outcome.status, threw: outcome.threw ?? false }),
  };
}

// --- parsePublishableKeySmokeEnv -----------------------------------------

test('parse: accepts exactly SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY', () => {
  const r = parsePublishableKeySmokeEnv({
    SUPABASE_URL: VALID_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(r.ok, true);
});

test('parse: missing both -> ENV_MISSING naming both variables', () => {
  const r = parsePublishableKeySmokeEnv({});
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.category, 'SMOKE_FAIL_ENV_MISSING');
    assert.deepEqual(r.problems.sort(), ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL']);
  }
});

test('parse: blank / whitespace values count as missing', () => {
  const r = parsePublishableKeySmokeEnv({ SUPABASE_URL: '   ', SUPABASE_PUBLISHABLE_KEY: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.category, 'SMOKE_FAIL_ENV_MISSING');
});

test('parse: rejects a URL that is not the reviewed Cloud DEV host', () => {
  for (const bad of [
    'https://evil.example.com',
    'https://jsgmmsdkuptdsxtcxhsv.supabase.co', // production — a different project
    'http://127.0.0.1:54321',
    `https://${CLOUD_DEV_API_HOST}/rest/v1`,
    `https://${CLOUD_DEV_API_HOST}?x=1`,
    `https://user:pw@${CLOUD_DEV_API_HOST}`,
    'not-a-url',
  ]) {
    const r = parsePublishableKeySmokeEnv({
      SUPABASE_URL: bad,
      SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
    });
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.equal(r.category, 'SMOKE_FAIL_ENV_INVALID');
  }
});

test('parse: rejects a non-sb_publishable key (e.g. a legacy anon JWT)', () => {
  const r = parsePublishableKeySmokeEnv({
    SUPABASE_URL: VALID_URL,
    SUPABASE_PUBLISHABLE_KEY: FAKE_LEGACY_ANON_JWT,
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.category, 'SMOKE_FAIL_ENV_INVALID');
    assert.ok(r.problems.some((p) => p.startsWith('SUPABASE_PUBLISHABLE_KEY')));
  }
});

test('parse: never echoes the key value in problems', () => {
  const r = parsePublishableKeySmokeEnv({
    SUPABASE_URL: 'not-a-url',
    SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(!r.problems.join(' ').includes(FAKE_PUBLISHABLE_KEY));
});

// --- classifyProbeOutcome ----------------------------------------------

test('classify: 404 (PostgREST reached) / 2xx -> OK', () => {
  assert.equal(classifyProbeOutcome({ status: 404, threw: false }).category, 'PUBLISHABLE_KEY_SMOKE_OK');
  assert.equal(classifyProbeOutcome({ status: 200, threw: false }).category, 'PUBLISHABLE_KEY_SMOKE_OK');
});

test('classify: 401 / 403 (gateway rejected the key) -> KEY_REJECTED', () => {
  assert.equal(classifyProbeOutcome({ status: 401, threw: false }).category, 'SMOKE_FAIL_KEY_REJECTED');
  assert.equal(classifyProbeOutcome({ status: 403, threw: false }).category, 'SMOKE_FAIL_KEY_REJECTED');
});

test('classify: 429 -> RATE_LIMITED', () => {
  assert.equal(classifyProbeOutcome({ status: 429, threw: false }).category, 'SMOKE_FAIL_RATE_LIMITED');
});

test('classify: 5xx -> UPSTREAM, transport throw -> TRANSPORT, null -> UNKNOWN, other -> UNKNOWN', () => {
  assert.equal(classifyProbeOutcome({ status: 503, threw: false }).category, 'SMOKE_FAIL_UPSTREAM');
  assert.equal(classifyProbeOutcome({ status: null, threw: true }).category, 'SMOKE_FAIL_TRANSPORT');
  assert.equal(classifyProbeOutcome({ status: null, threw: false }).category, 'SMOKE_FAIL_UNKNOWN');
  assert.equal(classifyProbeOutcome({ status: 418, threw: false }).category, 'SMOKE_FAIL_UNKNOWN');
});

// --- runPublishableKeySmoke ------------------------------------------

test('run: happy path with an injected probe -> OK, buildProbe got the pinned URL + key', async () => {
  let seenUrl = '';
  let seenKey = '';
  const result = await runPublishableKeySmoke({
    env: { SUPABASE_URL: VALID_URL, SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    buildProbe: async (url, key) => {
      seenUrl = url;
      seenKey = key;
      return probe({ status: 404 });
    },
  });
  assert.equal(result.category, 'PUBLISHABLE_KEY_SMOKE_OK');
  assert.equal(seenUrl, VALID_URL);
  assert.equal(seenKey, FAKE_PUBLISHABLE_KEY);
});

test('run: env failure short-circuits before any probe is built', async () => {
  let built = false;
  const result = await runPublishableKeySmoke({
    env: { SUPABASE_URL: VALID_URL },
    buildProbe: async () => {
      built = true;
      return probe({ status: 404 });
    },
  });
  assert.equal(built, false);
  assert.equal(result.category, 'SMOKE_FAIL_ENV_MISSING');
});

test('run: a rejected key surfaces as KEY_REJECTED', async () => {
  const result = await runPublishableKeySmoke({
    env: { SUPABASE_URL: VALID_URL, SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    buildProbe: async () => probe({ status: 401 }),
  });
  assert.equal(result.category, 'SMOKE_FAIL_KEY_REJECTED');
});

test('run: a throwing probe is contained as TRANSPORT, not propagated', async () => {
  const result = await runPublishableKeySmoke({
    env: { SUPABASE_URL: VALID_URL, SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY },
    buildProbe: async () => ({
      probeGatewayAcceptsKey: async () => {
        throw new Error('boom');
      },
    }),
  });
  assert.equal(result.category, 'SMOKE_FAIL_TRANSPORT');
});

// --- CLI --------------------------------------------------------------

test('cli: prints the OK token and returns 0', async () => {
  const lines: string[] = [];
  const code = await runPublishableKeySmokeCli({
    print: (l) => lines.push(l),
    run: async () => ({ category: 'PUBLISHABLE_KEY_SMOKE_OK', detail: 'status=404' }),
  });
  assert.equal(code, 0);
  assert.deepEqual(lines, ['PUBLISHABLE_KEY_SMOKE_OK (status=404)']);
});

test('cli: non-OK category returns 1', async () => {
  const lines: string[] = [];
  const code = await runPublishableKeySmokeCli({
    print: (l) => lines.push(l),
    run: async () => ({ category: 'SMOKE_FAIL_KEY_REJECTED', detail: 'status=401' }),
  });
  assert.equal(code, 1);
  assert.deepEqual(lines, ['SMOKE_FAIL_KEY_REJECTED (status=401)']);
});

// --- source-level guardrails ----------------------------------------

test('source consumes no legacy key, no secret key, no serverEnv, no client factories, no Mame To Cha', () => {
  for (const f of ['publishable-key-smoke.ts', 'publishable-key-smoke-cli.ts']) {
    // Strip block + line comments so doc prose may still discuss these names.
    const raw = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\bSUPABASE_ANON_KEY\b/.test(code), `${f} consumes the legacy anon key`);
    assert.ok(!/\bSUPABASE_SERVICE_ROLE_KEY\b/.test(code), `${f} consumes the legacy service_role key`);
    assert.ok(!/\bSUPABASE_SECRET_KEY\b/.test(code), `${f} consumes the secret key`);
    assert.ok(!/\bserverEnv\b/.test(code), `${f} calls serverEnv`);
    assert.ok(!/\bcreateServiceClient\b/.test(code), `${f} calls createServiceClient`);
    assert.ok(!/\bcreateUserClient\b/.test(code), `${f} calls createUserClient`);
    assert.ok(!/@line-os\/config/.test(code), `${f} imports @line-os/config`);
    assert.ok(!/@supabase\/supabase-js/.test(code), `${f} builds a supabase-js client`);
    assert.ok(!/\bMAME_TO_CHA\w*/.test(code), `${f} references Mame To Cha tooling`);
    assert.ok(!/process\.env\.[A-Za-z]/.test(code), `${f} reads process.env by member`);
    assert.ok(!/process\.env\[/.test(code), `${f} reads process.env by subscript`);
  }
});

test('probe targets a non-existent relation and only /rest/v1', () => {
  assert.equal(NONEXISTENT_PROBE_RELATION, 'publishable_key_smoke_probe_nonexistent');
  const raw = readFileSync(new URL('./publishable-key-smoke.ts', import.meta.url), 'utf8');
  assert.ok(raw.includes('/rest/v1/${NONEXISTENT_PROBE_RELATION}'));
  // read-only: only a GET is ever issued
  assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(raw), 'a mutating method is present');
});
