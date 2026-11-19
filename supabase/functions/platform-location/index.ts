// ============================================================================
// platform-location -- Supabase Edge Function (DEBT-139 L3c)
// ----------------------------------------------------------------------------
// The ORUWA admin console (/admin/tenants) adds, renames, archives and
// restores a tenant's stores (locations) through the 0151 service-role-only
// RPCs api.platform_create_location / platform_rename_location /
// platform_set_location_active. POST with the platform-staff caller's own JWT:
//   { request_id, action: 'create',     tenant_id, name, timezone? }
//   { request_id, action: 'rename',     location_id, name }
//   { request_id, action: 'set_active', location_id, is_active }
// The orchestration lives in `../_shared/platform-location/job.ts` (pure,
// unit-tested); this file is only HTTP + auth + client wiring.
//
// CALLER: server-to-server only (the console's Server Action forwards the
// signed-in staff user's access token), same as provision-tenant: no browser
// CORS surface. verify_jwt = true (supabase/config.toml).
//
// IDENTITY: the actor is ALWAYS the user behind the forwarded JWT
// (`auth.getUser()`, verified by Supabase Auth); its id equals core.users.id
// (0002). The body is whitelisted per action (anything else -> 400), so an
// actor id can never be supplied. The platform-staff gate is
// `api.is_platform_staff()` called with the CALLER'S OWN JWT (no service-role
// read of anyone's row); every service function re-checks the actor in the DB
// (core.assert_platform_staff_actor) and writes the audit row.
//
// PRIVILEGED KEY: `SUPABASE_SECRET_KEYS["default"]` via
// `_shared/supabase-secret-key.ts`, used only for the three `api` RPCs above.
// Never returned or logged.
//
// No PII: logs and responses carry ids, the action and machine codes only
// (never the store name, never raw DB error text).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabase-secret-key.ts';
import { resolveSupabasePublishableKey } from '../_shared/supabase-publishable-key.ts';
import { parseLocationBody, runPlatformLocation } from '../_shared/platform-location/job.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse(401, { error: 'missing_bearer_token' });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' });
  }
  const body = parseLocationBody(rawBody);
  if (!body.ok) return jsonResponse(400, { error: body.error });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return jsonResponse(500, { error: 'missing_configuration' });
  let privilegedKey: string;
  let publishableKey: string;
  try {
    privilegedKey = resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS') }).key;
    publishableKey = resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') }).key;
  } catch {
    log({ event: 'platform-location.config_error', code: 'missing_api_key' });
    return jsonResponse(500, { error: 'missing_configuration' });
  }

  // User-scoped client: the CALLER'S OWN JWT; identity + platform-staff gate.
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse(401, { error: 'not_authenticated' });
  const actorId = userData.user.id;

  const { data: isStaff, error: staffErr } = await userClient.schema('api').rpc('is_platform_staff');
  if (staffErr) return jsonResponse(500, { error: 'permission_check_failed' });
  if (isStaff !== true) return jsonResponse(403, { error: 'not_platform_staff' });

  // Service-role client: the three api-schema location RPCs only.
  const serviceClient = createClient(supabaseUrl, privilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'api' },
  });

  try {
    const outcome = await runPlatformLocation(
      {
        rpc: async (fn, args) => {
          const { data, error } = await serviceClient.rpc(fn, args);
          return { data, error: error ? { code: error.code, message: error.message } : null };
        },
        log,
      },
      { requestId: body.requestId, actorId, command: body.command },
    );
    return jsonResponse(outcome.httpStatus, outcome.body);
  } catch {
    log({ event: 'platform-location.unexpected_error', request_id: body.requestId });
    return jsonResponse(500, { error: 'unexpected_error', request_id: body.requestId });
  }
});
