import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source guards for the auto-schedule-monthly Edge Function (Deno, top-level
 * `Deno.serve` -- not importable under node:test). The orchestration it
 * calls is tested behaviourally in `_shared/auto-schedule/job.test.ts`.
 */
const SOURCE = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const CONFIG = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8');

test('POST only', () => {
  assert.match(SOURCE, /if \(req\.method !== 'POST'\) return jsonResponse\(405/);
});

test('missing / malformed bearer token (not exactly 64 lowercase hex) -> 401 before any DB call', () => {
  assert.match(SOURCE, /const CRON_TOKEN_FORMAT = \/\^\[0-9a-f\]\{64\}\$\/;/);
  const gate = SOURCE.indexOf("if (!CRON_TOKEN_FORMAT.test(token)) return jsonResponse(401, { error: 'unauthorized' });");
  const client = SOURCE.indexOf('createClient(supabaseUrl');
  const firstRpc = SOURCE.indexOf('.rpc(');
  assert.ok(gate > 0 && client > gate && firstRpc > gate, 'format gate precedes client creation and every RPC');

  // The exact regex, exercised: only 64 lowercase hex chars pass.
  const format = /^[0-9a-f]{64}$/;
  assert.ok(format.test('a'.repeat(64)));
  for (const bad of ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(63)}g`, `${'a'.repeat(64)}\n`, 'x'.repeat(64)]) {
    assert.equal(format.test(bad), false, JSON.stringify(bad));
  }
});

test('token is verified in the DB before the job runs; mismatch -> 401 with no detail', () => {
  const verify = SOURCE.indexOf("rpc('verify_auto_schedule_cron_token', { p_token: token })");
  const mismatch = SOURCE.indexOf("if (tokenOk !== true) return jsonResponse(401, { error: 'unauthorized' });");
  const run = SOURCE.indexOf('runAutoScheduleMonthly(rpc');
  assert.ok(verify > 0 && mismatch > verify && run > mismatch, 'verify -> 401 -> run order');
});

test("service client targets the 'api' schema with the resolved secret key", () => {
  assert.match(SOURCE, /db: \{ schema: 'api' \}/);
  assert.match(SOURCE, /resolveSupabaseSecretKey\(/);
  assert.doesNotMatch(SOURCE, /\.schema\('(workforce|core)'\)/);
  assert.doesNotMatch(SOURCE, /\.from\(/, 'no direct table access -- RPCs only');
});

test('no raw error text in responses or logs', () => {
  assert.doesNotMatch(SOURCE, /\.message/);
  assert.doesNotMatch(SOURCE, /detail:/);
  assert.doesNotMatch(SOURCE, /String\(err\)|err\.stack/);
});

test('config.toml: verify_jwt = false for auto-schedule-monthly (own token auth)', () => {
  assert.match(CONFIG, /\[functions\.auto-schedule-monthly\]\s*\nverify_jwt = false/);
});
