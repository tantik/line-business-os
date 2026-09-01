// ============================================================================
// liff-entry -- Supabase Edge Function
// ----------------------------------------------------------------------------
// CAFE_MANAGER_PARITY Track B (docs/architecture/workforce-line-liff-entry-plan.md
// §8/§11, docs/ai/CAFE_MANAGER_PARITY_TRACK_B_HANDOFF_2026-08-18.md). First
// step of the LIFF login flow: verify a LINE ID token server-side, resolve it
// to an existing, manager-linked Workforce identity, and hand back a
// short-lived, single-use magic-link token_hash the caller exchanges for a
// real session -- never a session or long-lived credential directly.
//
// WHY THIS IS AN EDGE FUNCTION, NOT apps/api: `supabase/functions/invite-employee/
// index.ts`'s own header comment establishes the precedent -- "apps/api is an
// explicit local-only dev spike, never deployed -- neither is an acceptable
// home" for a call requiring the Auth Admin API / service_role. This function
// needs `auth.admin.generateLink`, so it follows that same precedent, not the
// original Track B handoff sketch (written before this precedent was found).
//
// SECURITY MODEL:
//   * No caller-supplied tenant id, employee id, or email is ever trusted.
//     Every identity fact is derived server-side from the LINE ID token's own
//     cryptographically verified claims, or from rows this function looks up
//     itself.
//   * Tenant is resolved from the verified token's `aud` claim (the LINE
//     Login Channel id) against `core.line_channels.channel_id` -- never from
//     a client-supplied tenantId. A forged/mismatched tenantId in the request
//     body would have been a cross-tenant spoofing vector; there is no such
//     field in the request body at all.
//   * service_role is used for exactly the calls that require it: reading
//     `workforce.employee_line_links`/`workforce.employees` before any
//     session exists (there is no caller JWT yet to scope a user-client to),
//     and `auth.admin.generateLink`. Nothing else uses it.
//   * The LINE user id is never persisted or logged in plaintext -- only its
//     blind-index hash is used for lookup, matching the pattern already
//     established for `workforce.employee_line_links` (0029) and
//     `core.line_accounts` (0004).
//   * Linking itself (associating a LINE user id with an employee) is NOT
//     done here and never will be by this endpoint -- that is exclusively
//     the Manager-only `bind_workforce_employee_line_user` RPC (0031),
//     already live via the Manage-staff popup's `LineLinkForm`. This
//     function only ever *resolves* an existing, manager-approved link. An
//     unlinked LINE user id gets `not_linked`, never an auto-created one.
//   * The response never contains an access/refresh token pair or the LINE
//     user id -- only an opaque, single-use `tokenHash` the client
//     immediately hands to `/auth/liff-callback` (apps/web), which calls
//     `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` using the
//     publishable (low-privilege) key server-side -- the exact same
//     token_hash/verifyOtp pattern
//     already proven by `apps/web/src/app/auth/accept-invite/route.ts`, not a
//     new bespoke session-minting mechanism.
//
// KNOWN GAPS (documented, not silently assumed away):
//   * No automated test harness exists for this function, same as
//     `invite-employee` (Deno-only, no `deno test` wiring in this repo's
//     CI). Reviewed and manually/live verified instead, consistent with the
//     bar already accepted for `invite-employee`.
//   * No per-IP rate limiting on this unauthenticated endpoint. Acceptable
//     for now (Track B is not deployed/enabled without separate Founder
//     approval, same gate as invite-employee's original rollout), but a real
//     gap to revisit before enabling this for a live tenant.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';
import { resolveSupabaseSecretKey } from '../_shared/supabase-secret-key.ts';

const LINE_ISSUER = 'https://access.line.me';
const LINE_JWKS_URL = 'https://api.line.me/oauth2/v2.1/certs';

// Cached across warm invocations of the same Edge Function instance --
// `createRemoteJWKSet` itself already caches the fetched key set internally.
const lineJwks = createRemoteJWKSet(new URL(LINE_JWKS_URL));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * AES-256-GCM decrypt, byte-for-byte identical to `invite-employee`'s own
 * reimplementation (which itself matches `packages/db/src/crypto.ts`'s
 * `decryptPII`) -- duplicated rather than imported because Edge Functions
 * (Deno) cannot resolve this repo's pnpm workspace packages.
 */
async function decryptPII(blob: Uint8Array, encryptionKeyBase64: string): Promise<string> {
  const keyBytes = base64ToBytes(encryptionKeyBase64);
  if (keyBytes.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).');
  }
  const iv = blob.slice(0, 12);
  const tag = blob.slice(12, 28);
  const ciphertext = blob.slice(28);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
  return new TextDecoder().decode(plaintext);
}

/** Decode PostgREST's hex bytea text (`\x...`) into raw bytes. Same as invite-employee's. */
function byteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Deterministic HMAC-SHA256 blind index, matching
 * `packages/db/src/crypto.ts`'s `blindIndex(value, pepper, 'raw')` exactly
 * (trim, no case-folding -- LINE user ids are case-sensitive opaque ids, not
 * emails). Reimplemented with Web Crypto for the same reason as `decryptPII`
 * above.
 */
async function blindIndexRaw(value: string, pepperUtf8: string): Promise<string> {
  const normalized = value.trim();
  const keyBytes = new TextEncoder().encode(pepperUtf8);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface LiffEntryBody {
  idToken?: unknown;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  let body: LiffEntryBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' });
  }

  const idToken = body.idToken;
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 4096) {
    return jsonResponse(400, { error: 'invalid_id_token' });
  }

  // Verify the LINE ID token's signature against LINE's own live JWKS and its
  // issuer -- audience is checked below once we know which channel_id to
  // expect isn't yet known, so it's validated against the resolved channel
  // row instead of a fixed expected value here.
  let lineUserId: string;
  let channelId: string;
  try {
    const { payload } = await jwtVerify(idToken, lineJwks, { issuer: LINE_ISSUER });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      return jsonResponse(401, { error: 'invalid_token_claims' });
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (typeof aud !== 'string' || aud.length === 0) {
      return jsonResponse(401, { error: 'invalid_token_claims' });
    }
    lineUserId = payload.sub;
    channelId = aud;
  } catch {
    // Expired, malformed, wrong-issuer, or bad-signature tokens all collapse
    // to the same generic rejection -- never reveal which check failed to an
    // unauthenticated caller.
    return jsonResponse(401, { error: 'invalid_id_token' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY');
  const hashPepper = Deno.env.get('PII_HASH_PEPPER');
  if (!supabaseUrl || !encryptionKey || !hashPepper) {
    return jsonResponse(500, { error: 'missing_configuration' });
  }
  // Privileged key: the Supabase-injected `SUPABASE_SECRET_KEYS["default"]`
  // (`sb_secret_*`), REQUIRED. No legacy `SUPABASE_SERVICE_ROLE_KEY` fallback --
  // Cloud DEV's legacy JWT-based API keys are disabled (Phase 9,
  // docs/operations/supabase-secret-key-migration-runbook.md). This function is
  // NOT deployed (deferred LINE/LIFF work); it shares the strict resolver for
  // consistency. Local `supabase functions serve` needs SUPABASE_SECRET_KEYS in
  // supabase/functions/.env (see .env.example there).
  let privilegedKey: string;
  try {
    privilegedKey = resolveSupabaseSecretKey({
      SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
    }).key;
  } catch {
    return jsonResponse(500, { error: 'missing_configuration' });
  }

  // Privileged client: no caller session exists yet at this point in the flow,
  // so there is no user-scoped client to use. Scoped strictly to the
  // reads/call documented in the header comment above.
  const serviceClient = createClient(supabaseUrl, privilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: channel, error: channelErr } = await serviceClient
    .schema('core')
    .from('line_channels')
    .select('tenant_id')
    .eq('channel_id', channelId)
    .eq('is_active', true)
    .maybeSingle();
  if (channelErr) return jsonResponse(500, { error: 'channel_lookup_failed' });
  if (!channel) return jsonResponse(404, { error: 'channel_not_configured' });
  const tenantId = (channel as { tenant_id: string }).tenant_id;

  const lineUserIdHash = await blindIndexRaw(lineUserId, hashPepper);

  const { data: link, error: linkErr } = await serviceClient
    .schema('workforce')
    .from('employee_line_links')
    .select('employee_id')
    .eq('tenant_id', tenantId)
    .eq('line_user_id_hash', lineUserIdHash)
    .eq('is_active', true)
    .maybeSingle();
  if (linkErr) return jsonResponse(500, { error: 'link_lookup_failed' });
  if (!link) return jsonResponse(404, { error: 'not_linked' });
  const employeeId = (link as { employee_id: string }).employee_id;

  const { data: employee, error: employeeErr } = await serviceClient
    .schema('workforce')
    .from('employees')
    .select('user_id, is_active, email_encrypted')
    .eq('tenant_id', tenantId)
    .eq('id', employeeId)
    .maybeSingle();
  if (employeeErr) return jsonResponse(500, { error: 'employee_lookup_failed' });
  if (!employee) return jsonResponse(404, { error: 'not_linked' });
  if (!employee.is_active) return jsonResponse(409, { error: 'employee_inactive' });
  if (!employee.user_id) return jsonResponse(409, { error: 'employee_not_onboarded' });
  if (!employee.email_encrypted) return jsonResponse(400, { error: 'employee_missing_email' });

  let email: string;
  try {
    email = await decryptPII(byteaToBytes(employee.email_encrypted as string), encryptionKey);
  } catch {
    return jsonResponse(500, { error: 'email_decrypt_failed' });
  }

  const generated = await serviceClient.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error) {
    return jsonResponse(502, { error: 'auth_admin_error', detail: generated.error.message });
  }

  const resolvedUserId = generated.data.user?.id;
  const hashedToken = generated.data.properties?.hashed_token;
  if (!resolvedUserId || !hashedToken) {
    return jsonResponse(502, { error: 'auth_admin_incomplete_response' });
  }
  // Defense in depth: `generateLink` resolves by email, not by user id. If
  // the employee's contact email were ever reassigned to a *different* Auth
  // user since this employee row was last synced, this catches it instead of
  // silently handing out a session for the wrong identity.
  if (resolvedUserId !== employee.user_id) {
    return jsonResponse(409, { error: 'employee_identity_mismatch' });
  }

  return jsonResponse(200, { tokenHash: hashedToken, type: 'magiclink' });
});
