// ============================================================================
// provision-tenant -- Supabase Edge Function (Stage 4B-2)
// ----------------------------------------------------------------------------
// Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §2, §4, §7.
// POST { request_id, input: { businessName, tenantSlug, locationName,
// timezone?, ownerEmail } } with the platform-staff caller's own JWT.
// Creates the tenant in ONE DB transaction (0133) and invites its Owner
// (0134). The orchestration lives in `../_shared/provision-tenant/job.ts`
// (pure, unit-tested); this file is only HTTP + auth + client wiring.
//
// CALLER: server-to-server only (the admin console's server action, 4B-3,
// forwards the signed-in staff user's access token), same as invite-employee:
// no browser CORS surface. verify_jwt = true (supabase/config.toml).
//
// IDENTITY (DEBT-109 b): the actor is ALWAYS the user behind the forwarded
// JWT (`auth.getUser()`, verified by Supabase Auth); its id equals
// core.users.id (0002). The body may only contain `request_id` and `input`
// (anything else -> 400), so an actor id can never be supplied. The
// platform-staff gate is `api.is_platform_staff()` called with the CALLER'S
// OWN JWT (no service-role read of anyone's row); every service function
// re-checks the actor in the DB (core.assert_platform_staff_actor).
//
// PRIVILEGED KEY: `SUPABASE_SECRET_KEYS["default"]` via
// `_shared/supabase-secret-key.ts`, used for the `api` schema's
// service-role-only provisioning RPCs (0133/0134) and the two Auth Admin
// calls (inviteUserByEmail / listUsers). Never returned or logged.
//
// PII: the Owner email is used for the Auth invite and stored only encrypted
// + blind-indexed (PII_ENCRYPTION_KEY / PII_HASH_PEPPER, same values as
// apps/web). Logs and responses carry ids, statuses and machine codes only.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabase-secret-key.ts';
import { resolveSupabasePublishableKey } from '../_shared/supabase-publishable-key.ts';
import { protectEmail } from '../_shared/pii-protect.ts';
import { parseProvisionBody, runProvisionTenant, type AuthAdmin } from '../_shared/provision-tenant/job.ts';

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
  const body = parseProvisionBody(rawBody);
  if (!body.ok) return jsonResponse(400, { error: body.error });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY');
  const hashPepper = Deno.env.get('PII_HASH_PEPPER');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!supabaseUrl || !encryptionKey || !hashPepper || !siteUrl) {
    return jsonResponse(500, { error: 'missing_configuration' });
  }
  let privilegedKey: string;
  let publishableKey: string;
  try {
    privilegedKey = resolveSupabaseSecretKey({ SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS') }).key;
    publishableKey = resolveSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') }).key;
  } catch {
    log({ event: 'provision-tenant.config_error', code: 'missing_api_key' });
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

  // Service-role client: api-schema provisioning RPCs + Auth Admin only.
  const serviceClient = createClient(supabaseUrl, privilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'api' },
  });

  try {
    const outcome = await runProvisionTenant(
      {
        rpc: async (fn, args) => {
          const { data, error } = await serviceClient.rpc(fn, args);
          return { data, error: error ? { code: error.code, message: error.message } : null };
        },
        authAdmin: serviceClient.auth.admin as unknown as AuthAdmin,
        protectEmail: (email) => protectEmail(email, { encryptionKey, pepper: hashPepper }),
        ownerRedirectTo: `${siteUrl.replace(/\/$/, '')}/auth/accept-invite?flow=tenant_invite`,
        log,
      },
      { requestId: body.requestId, actorId, input: body.input },
    );
    return jsonResponse(outcome.httpStatus, outcome.body);
  } catch {
    log({ event: 'provision-tenant.unexpected_error', request_id: body.requestId });
    return jsonResponse(500, { error: 'unexpected_error', request_id: body.requestId });
  }
});
