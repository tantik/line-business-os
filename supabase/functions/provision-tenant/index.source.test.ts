import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source guards for the provision-tenant Edge Function (Deno, top-level
 * `Deno.serve` -- not importable under node:test). The orchestration is
 * tested behaviourally in `_shared/provision-tenant/job.test.ts`.
 */
const SOURCE = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const CONFIG = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8');

test('POST only, bearer required', () => {
  assert.match(SOURCE, /if \(req\.method !== 'POST'\) return jsonResponse\(405/);
  assert.match(SOURCE, /if \(!authHeader\?\.startsWith\('Bearer '\)\) return jsonResponse\(401/);
});

test('actor = the verified JWT user (auth.getUser), never the body (DEBT-109 b)', () => {
  assert.match(SOURCE, /await userClient\.auth\.getUser\(\)/);
  assert.match(SOURCE, /const actorId = userData\.user\.id;/);
  assert.match(SOURCE, /actorId, input: body\.input/);
  assert.doesNotMatch(SOURCE, /body\.(actor|actorId|actor_id|p_actor_id)\b/);
  assert.match(SOURCE, /parseProvisionBody\(rawBody\)/, 'body shape is whitelisted (request_id + input only)');
});

test('platform-staff gate runs with the caller JWT before the service-role client exists', () => {
  const gate = SOURCE.indexOf("userClient.schema('api').rpc('is_platform_staff')");
  const refusal = SOURCE.indexOf("if (isStaff !== true) return jsonResponse(403, { error: 'not_platform_staff' });");
  const serviceClient = SOURCE.indexOf('const serviceClient = createClient(supabaseUrl, privilegedKey');
  assert.ok(gate > 0 && refusal > gate && serviceClient > refusal, 'getUser -> is_platform_staff -> 403 -> service client');
});

test('service client: api schema only, resolved secret key, no direct table access', () => {
  assert.match(SOURCE, /db: \{ schema: 'api' \}/);
  assert.match(SOURCE, /resolveSupabaseSecretKey\(/);
  assert.doesNotMatch(SOURCE, /\.schema\('(core|workforce|audit)'\)/);
  assert.doesNotMatch(SOURCE, /\.from\(/);
});

test('no PII or raw error text in responses or logs', () => {
  assert.doesNotMatch(SOURCE, /detail:/);
  assert.doesNotMatch(SOURCE, /String\(err\)|err\.stack/);
  assert.doesNotMatch(SOURCE, /console\.(log|error)\([^)]*(email|input|body\b)/i);
  // error.message is only handed to the pure job for code mapping, never returned
  assert.doesNotMatch(SOURCE, /jsonResponse\([^)]*message/);
});

test('Owner invite lands on the existing auth callback, tenant-invite flow', () => {
  assert.match(SOURCE, /\/auth\/accept-invite\?flow=tenant_invite/);
});

test('config.toml: verify_jwt = true for provision-tenant', () => {
  assert.match(CONFIG, /\[functions\.provision-tenant\]\s*\nverify_jwt = true/);
});
