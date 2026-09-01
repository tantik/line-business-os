import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getHealthReport,
  probeSupabaseAuthHealth,
  deriveHealthStatus,
  httpStatusForHealth,
  type HealthReport,
} from './health.js';
import type { ReadPublicSupabaseEnvResult } from '../supabase/env.js';

// Recognizable fakes so the serialization-safety test can prove these values
// never leak into the response. They are NOT real secrets.
const FAKE_URL = 'https://fake-project-ref.supabase.co';
const FAKE_PUBLISHABLE = 'sb_publishable_fake-value-should-never-leak';
const FIXED_NOW = new Date('2026-06-26T11:30:00.000Z');

const okEnv = (): ReadPublicSupabaseEnvResult => ({
  ok: true,
  config: { url: FAKE_URL, key: FAKE_PUBLISHABLE },
});
const missingEnv = (): ReadPublicSupabaseEnvResult => ({
  ok: false,
  missing: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
});

/** Minimal `fetch` stub returning a Response-like object with `.ok`. */
function fetchReturning(ok: boolean): typeof fetch {
  return (async () => ({ ok }) as Response) as unknown as typeof fetch;
}
const fetchThatThrows: typeof fetch = (async () => {
  throw new Error('network down');
}) as unknown as typeof fetch;
const fetchThatMustNotRun: typeof fetch = (() => {
  throw new Error('fetch must not be called when config is missing');
}) as unknown as typeof fetch;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('healthy report returns the safe JSON shape (200, ok)', async () => {
  const { report, httpStatus } = await getHealthReport({
    readEnv: okEnv,
    fetchImpl: fetchReturning(true),
    now: () => FIXED_NOW,
  });

  assert.equal(report.status, 'ok');
  assert.equal(httpStatus, 200);
  assert.deepEqual(report.checks, { app: 'ok', config: 'ok', supabase: 'ok' });
  assert.match(report.timestamp, ISO_RE);

  // Exact key sets — no extra fields can sneak in.
  assert.deepEqual(Object.keys(report).sort(), ['checks', 'status', 'timestamp']);
  assert.deepEqual(Object.keys(report.checks).sort(), ['app', 'config', 'supabase']);
});

test('missing config returns unhealthy (503) with config "missing" and supabase "skipped"', async () => {
  const { report, httpStatus } = await getHealthReport({
    readEnv: missingEnv,
    // Probe must never run without config; this throws if called.
    fetchImpl: fetchThatMustNotRun,
    now: () => FIXED_NOW,
  });

  assert.equal(report.status, 'unhealthy');
  assert.equal(httpStatus, 503);
  assert.equal(report.checks.config, 'missing');
  assert.equal(report.checks.supabase, 'skipped');
});

test('supabase probe failure (non-2xx) returns unhealthy (503) and supabase "unreachable"', async () => {
  const { report, httpStatus } = await getHealthReport({
    readEnv: okEnv,
    fetchImpl: fetchReturning(false),
    now: () => FIXED_NOW,
  });

  assert.equal(report.status, 'unhealthy');
  assert.equal(httpStatus, 503);
  assert.equal(report.checks.config, 'ok');
  assert.equal(report.checks.supabase, 'unreachable');
});

test('supabase probe throw/timeout maps to "unreachable" (no raw error surfaced)', async () => {
  const result = await probeSupabaseAuthHealth(FAKE_URL, FAKE_PUBLISHABLE, {
    fetchImpl: fetchThatThrows,
    timeoutMs: 50,
  });
  assert.equal(result, 'unreachable');
});

test('probe hits the auth health path only and sends the apikey header', async () => {
  let calledUrl = '';
  let sentApiKey = false;
  const recordingFetch = (async (input: unknown, init?: RequestInit) => {
    calledUrl = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    sentApiKey = headers.apikey === FAKE_PUBLISHABLE;
    return { ok: true } as Response;
  }) as unknown as typeof fetch;

  const result = await probeSupabaseAuthHealth(FAKE_URL, FAKE_PUBLISHABLE, { fetchImpl: recordingFetch });
  assert.equal(result, 'ok');
  assert.equal(calledUrl, `${FAKE_URL}/auth/v1/health`);
  assert.ok(sentApiKey, 'probe must send the publishable key as the apikey header');
});

test('status/code helpers: degraded is 200, unhealthy is 503', () => {
  assert.equal(deriveHealthStatus({ app: 'ok', config: 'ok', supabase: 'ok' }), 'ok');
  assert.equal(
    deriveHealthStatus({ app: 'ok', config: 'missing', supabase: 'skipped' }),
    'unhealthy',
  );
  assert.equal(
    deriveHealthStatus({ app: 'ok', config: 'ok', supabase: 'unreachable' }),
    'unhealthy',
  );
  assert.equal(httpStatusForHealth('ok'), 200);
  assert.equal(httpStatusForHealth('degraded'), 200);
  assert.equal(httpStatusForHealth('unhealthy'), 503);
});

test('serialized report leaks no secrets, ids, URLs, or tenant data', async () => {
  const { report } = await getHealthReport({
    readEnv: okEnv,
    fetchImpl: fetchReturning(true),
    now: () => FIXED_NOW,
  });
  const serialized = JSON.stringify(report);

  // No raw config values.
  assert.ok(!serialized.includes(FAKE_URL), 'must not include the Supabase URL');
  assert.ok(!serialized.includes(FAKE_PUBLISHABLE), 'must not include the publishable key');
  assert.ok(!/supabase\.co/i.test(serialized), 'must not include any supabase host');

  // No service-role references.
  assert.ok(!/service_role/i.test(serialized));
  assert.ok(!/SUPABASE_SERVICE_ROLE/i.test(serialized));
  assert.ok(!/createServiceClient/.test(serialized));

  // No DB URL / JWT / UUID patterns.
  assert.ok(!/postgres(ql)?:\/\//i.test(serialized), 'must not include a DB URL');
  assert.ok(
    !/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(serialized),
    'must not include a JWT-like string',
  );
  assert.ok(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized),
    'must not include a UUID',
  );

  // No tenant data fields.
  assert.ok(!/tenant/i.test(serialized), 'must not include any tenant field');
  assert.ok(!/version|commit|sha/i.test(serialized), 'must not include app version / commit SHA');
});

test('health source files reference no service-role / service client', () => {
  const healthSrc = readFileSync(new URL('./health.ts', import.meta.url), 'utf8');
  const routeSrc = readFileSync(
    new URL('../../app/api/health/route.ts', import.meta.url),
    'utf8',
  );

  for (const [name, src] of [
    ['health.ts', healthSrc],
    ['route.ts', routeSrc],
  ] as const) {
    assert.ok(!/createServiceClient/.test(src), `${name} must not import createServiceClient`);
    assert.ok(!/SUPABASE_SERVICE_ROLE/.test(src), `${name} must not read SUPABASE_SERVICE_ROLE`);
    // The literal service_role token must not appear (comments included).
    assert.ok(
      !/service_role/.test(src),
      `${name} must not reference service_role`,
    );
  }
});

// Type-only usage guard: keep the exported report type referenced so the test
// file documents the public shape it asserts against.
const _shape: HealthReport = {
  status: 'ok',
  timestamp: FIXED_NOW.toISOString(),
  checks: { app: 'ok', config: 'ok', supabase: 'ok' },
};
void _shape;
