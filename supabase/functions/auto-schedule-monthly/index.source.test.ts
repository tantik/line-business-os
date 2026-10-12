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

test('missing bearer token -> 401 before any DB call', () => {
  const missing = SOURCE.indexOf("if (!token) return jsonResponse(401, { error: 'unauthorized' });");
  const firstRpc = SOURCE.indexOf('.rpc(');
  assert.ok(missing > 0 && firstRpc > missing);
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
