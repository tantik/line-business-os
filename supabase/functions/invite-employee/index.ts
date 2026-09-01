// ============================================================================
// invite-employee -- Supabase Edge Function
// ----------------------------------------------------------------------------
// STAFF_AUTH_PROVISIONING (see docs/ai/STAFF_AUTH_PROVISIONING_HANDOFF_2026-08-13.md,
// Founder decision 9): the ONLY place in this codebase where the Supabase
// Auth Admin API (`inviteUserByEmail`/`listUsers`) is called, and the ONLY
// place a `service_role` key is held for this feature. `apps/web` never
// imports `createServiceClient` or reads `SUPABASE_SERVICE_ROLE_KEY`
// (test-enforced, `.cursor/rules/01-security.mdc`); `apps/api` is an
// explicit local-only dev spike, never deployed -- neither is an acceptable
// home for this call.
//
// PRIVILEGED KEY: resolved via `_shared/supabase-secret-key.ts` — the current
// `SUPABASE_SECRET_KEYS["default"]` (an `sb_secret_*` value), REQUIRED. No
// legacy `SUPABASE_SERVICE_ROLE_KEY` fallback — Cloud DEV's legacy JWT-based
// API keys are disabled (Phase 9,
// docs/operations/supabase-secret-key-migration-runbook.md).
//
// USER-SCOPED KEY: the user-scoped client's API key is resolved via
// `_shared/supabase-publishable-key.ts` — the current
// `SUPABASE_PUBLISHABLE_KEYS["default"]` publishable key, REQUIRED, no legacy
// `SUPABASE_ANON_KEY` fallback. This is only the application API key; the
// caller's forwarded JWT is still the identity/auth context and RLS is
// unchanged.
//
// SECURITY MODEL:
//   * the privileged key is used for EXACTLY TWO calls: `admin.inviteUserByEmail`
//     and (on its "already registered" error) `admin.listUsers`. Nothing
//     else in this function uses the service_role client -- in particular,
//     the actual `workforce.employee_invitations` row write goes through
//     `api.upsert_employee_invitation` (0065) called with the CALLER'S OWN
//     forwarded JWT (a user-scoped client), not service_role. That RPC is
//     SECURITY DEFINER and independently re-verifies
//     core.has_permission_in_tenant(tenant, 'workforce.staff.manage') itself
//     -- so even if the Manager-permission check below were ever removed or
//     buggy, the DB-layer RPC is still the real, re-verified authorization
//     boundary, not this function's own logic.
//   * The Manager-permission check (`api.has_permission`) and the employee
//     email read (`api.workforce_staff_manage`) both run through the
//     user-scoped client (the caller's own forwarded Authorization header),
//     so RLS applies exactly as it would for any other authenticated
//     request -- this function does not widen what a caller can read.
//   * The employee's email is read ONLY from the server-side-decrypted
//     `email_encrypted` column of the manager-only `api.workforce_staff_manage`
//     view -- never accepted as a request parameter. A request body may only
//     name a `tenantId`/`employeeId`; it can never supply an email or a
//     target user id directly.
//   * `target_user_id` passed to `api.upsert_employee_invitation` is always
//     a value THIS function resolved itself via the Auth Admin API
//     (inviteUserByEmail's own response for a new user, or an existing-user
//     listUsers lookup) -- never taken from the request body.
//   * Deactivated employees are refused (409) before any Auth Admin API call
//     is made -- an ex-employee is never re-invited by this path.
//   * No email/password/token is ever included in this function's HTTP
//     response -- only an outcome tag, the invitation id, and its expiry.
//
// INVITE vs RESEND: the caller does not choose -- there is one request
// shape (`{ tenantId, employeeId }`) and `api.upsert_employee_invitation`
// itself decides (upsert semantics on the one-pending-per-employee unique
// index): no pending row -> insert (invite); a pending row already exists
// -> refresh it in place (resend), re-resolving target_user_id via the Auth
// Admin API again in case the resend is meant to recover from a lost email.
//
// RECOVERY (Defect C, docs/ai/ORUWA_CAFE_V2_1_WHOLE_PRODUCT_INTEGRITY_GATE.md
// / docs/ai/CAFE_V2_1_STAFF_SURFACE_RECONCILIATION_HANDOFF_2026-08-15.md §4):
// `{ tenantId, employeeId, action: 'recover' }` is a distinct request shape
// for a pending, unbound invitation. The normal resend path deliberately
// sends NO email once `inviteUserByEmail` reports the target address is
// already a registered Auth user (Founder decision 8) -- correct for an
// existing ORUWA user who can just use the in-app PendingInvitationBanner,
// but a dead end for a first-time hire whose Auth identity exists (their
// invite email was already consumed once) but who never finished password
// setup: they have no session yet, so they can never reach that banner.
// `action: 'recover'` sends a real Supabase password-recovery email instead
// -- `auth.resetPasswordForEmail`, not an Admin API call, but issued from
// this service-role client purely because it is the only place in this
// codebase already holding the decrypted employee email. The resulting
// `type=recovery` token_hash is handled by the SAME
// `/auth/accept-invite` callback as a normal invite (see that route for the
// corresponding `ALLOWED_TOKEN_HASH_TYPES` change) -- recovery and invite
// both land the caller on the identical password-setup step, because a
// fresh password is the only thing either flow is actually missing.
//
// EXISTING-USER CASE (Founder decision 8): when `inviteUserByEmail` reports
// the email already belongs to a registered Auth user, NO new email is
// sent -- this function falls back to `listUsers` to resolve that user's id
// and still records the invitation row so the existing-user in-app
// "pending invitation" banner (apps/web) can offer a one-click accept via
// `api.accept_employee_invitation` (0064) on their next authenticated
// session, anywhere in ORUWA.
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveSupabaseSecretKey } from '../_shared/supabase-secret-key.ts';
import { resolveSupabasePublishableKey } from '../_shared/supabase-publishable-key.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALREADY_REGISTERED_MARKERS = ['already been registered', 'already registered', 'already exists', 'duplicate'];
const MAX_LIST_PAGES = 50;
const LIST_PAGE_SIZE = 200;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return ALREADY_REGISTERED_MARKERS.some((marker) => lower.includes(marker));
}

/** Decode PostgREST's hex bytea text (`\x...`) into raw bytes. */
function byteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * AES-256-GCM decrypt matching packages/db/src/crypto.ts's `decryptPII`
 * byte layout exactly: [12-byte IV][16-byte tag][ciphertext]. Re-implemented
 * with Web Crypto (not `node:crypto`) because this function targets the
 * Supabase Edge Runtime (Deno), where Web Crypto is the guaranteed-available
 * primitive; Node's `crypto.createDecipheriv` keeps the tag separate from
 * the ciphertext, while `SubtleCrypto.decrypt('AES-GCM', ...)` expects the
 * tag appended to the ciphertext -- the two are reassembled below.
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

interface AdminUser {
  id: string;
  email?: string | null;
}

/**
 * Resolve the Supabase Auth user id for `email`: invite a brand-new user
 * (sends Supabase's own invite email), or -- on "already registered" --
 * look the existing user up WITHOUT sending anything (Founder decision 8).
 */
async function resolveTargetUser(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  email: string,
  redirectTo: string,
): Promise<{ userId: string; wasNewUser: boolean }> {
  const invited = await serviceClient.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (invited.error === null) {
    const user = invited.data?.user as AdminUser | undefined;
    if (!user) throw new Error('auth_admin_invite_no_user');
    return { userId: user.id, wasNewUser: true };
  }

  const message: string = invited.error.message ?? '';
  if (!isAlreadyRegisteredError(message)) {
    throw new Error(`auth_admin_invite_failed: ${message}`);
  }

  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const listed = await serviceClient.auth.admin.listUsers({ page, perPage: LIST_PAGE_SIZE });
    if (listed.error) throw new Error(`auth_admin_list_failed: ${listed.error.message}`);
    const users: AdminUser[] = listed.data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match) return { userId: match.id, wasNewUser: false };
    if (users.length < LIST_PAGE_SIZE) break;
  }

  throw new Error('auth_admin_existing_user_not_found');
}

/**
 * Look up an existing Auth user by email WITHOUT ever creating one --
 * `action: 'recover'`'s own resolution step. Reuses the same
 * `listUsers` pagination as `resolveTargetUser`'s existing-user branch, but
 * never calls `inviteUserByEmail` first (recovery is only ever valid for
 * someone already invited at least once; a brand-new Auth user being
 * created as a side effect of a "recover access" click would be a bug, not
 * a fallback).
 */
async function findExistingAuthUser(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const listed = await serviceClient.auth.admin.listUsers({ page, perPage: LIST_PAGE_SIZE });
    if (listed.error) throw new Error(`auth_admin_list_failed: ${listed.error.message}`);
    const users: AdminUser[] = listed.data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match) return match.id;
    if (users.length < LIST_PAGE_SIZE) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return jsonResponse(401, { error: 'missing_bearer_token' });

  let body: { tenantId?: unknown; employeeId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid_json_body' });
  }

  const tenantId = body.tenantId;
  const employeeId = body.employeeId;
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    return jsonResponse(400, { error: 'invalid_tenant_id' });
  }
  if (typeof employeeId !== 'string' || !UUID_RE.test(employeeId)) {
    return jsonResponse(400, { error: 'invalid_employee_id' });
  }
  const isRecoveryAction = body.action === 'recover';
  if (body.action !== undefined && body.action !== 'recover') {
    return jsonResponse(400, { error: 'invalid_action' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const encryptionKey = Deno.env.get('PII_ENCRYPTION_KEY');
  const siteUrl = Deno.env.get('SITE_URL');
  if (!supabaseUrl || !encryptionKey || !siteUrl) {
    return jsonResponse(500, { error: 'missing_configuration' });
  }
  // Privileged key for the Auth Admin API calls below: the Supabase-injected
  // `SUPABASE_SECRET_KEYS["default"]` (`sb_secret_*`). No legacy
  // `SUPABASE_SERVICE_ROLE_KEY` fallback -- Cloud DEV's legacy JWT-based API
  // keys are disabled (Phase 9,
  // docs/operations/supabase-secret-key-migration-runbook.md).
  let privilegedKey: string;
  try {
    const resolved = resolveSupabaseSecretKey({
      SUPABASE_SECRET_KEYS: Deno.env.get('SUPABASE_SECRET_KEYS'),
    });
    // Migration diagnostic: emit ONLY which source the privileged key resolved
    // from -- the `SupabaseSecretKeySourceKind` enum (`secret_keys_default`) --
    // a deployment sanity signal confirming the strict new-key resolver is
    // live. Never logs the key, any env value, the Authorization header/JWT,
    // the request body, or any PII (email/tenantId/employeeId).
    console.log(JSON.stringify({
      event: 'invite-employee.privileged_key_source',
      source: resolved.source,
    }));
    privilegedKey = resolved.key;
  } catch {
    return jsonResponse(500, { error: 'missing_configuration' });
  }

  // User-scoped client API key: the Supabase-injected
  // `SUPABASE_PUBLISHABLE_KEYS["default"]` publishable key. No legacy
  // `SUPABASE_ANON_KEY` fallback (Phase 9). This is ONLY the application's API
  // key -- it is not privileged and does not bypass RLS. The caller's own JWT
  // (forwarded below as the Authorization header) remains the identity/auth
  // context; RLS and the permission checks apply unchanged.
  let publishableKey: string;
  try {
    const resolvedPublishable = resolveSupabasePublishableKey({
      SUPABASE_PUBLISHABLE_KEYS: Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    });
    // Migration diagnostic: emit ONLY which source the publishable key resolved
    // from -- the `SupabasePublishableKeySourceKind` enum
    // (`publishable_keys_default`) -- a deployment sanity signal. Never logs the
    // key, any env value, the Authorization header/JWT, the request body, or
    // any PII.
    console.log(JSON.stringify({
      event: 'invite-employee.publishable_key_source',
      source: resolvedPublishable.source,
    }));
    publishableKey = resolvedPublishable.key;
  } catch {
    return jsonResponse(500, { error: 'missing_configuration' });
  }

  // User-scoped client: every call below carries the CALLER'S OWN JWT, so
  // RLS/has_permission checks apply exactly as they would for any other
  // authenticated request -- this function never widens what the caller
  // can read or do beyond what their own token already permits.
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse(401, { error: 'not_authenticated' });

  // Tenant-wide check, NOT api.has_permission(tenant, perm, null) -- that
  // call's p_location_id=null only matches a tenant-wide role assignment,
  // never a location-scoped one (the common case for a Manager). See
  // 0066_api_has_permission_in_tenant_facade.sql for why this is a distinct
  // RPC, found the hard way by this function's own local smoke test.
  const { data: allowed, error: permErr } = await userClient
    .schema('api')
    .rpc('has_permission_in_tenant', { p_tenant_id: tenantId, p_permission: 'workforce.staff.manage' });
  if (permErr) return jsonResponse(500, { error: 'permission_check_failed' });
  if (!allowed) return jsonResponse(403, { error: 'not_authorized' });

  const { data: employee, error: employeeErr } = await userClient
    .schema('api')
    .from('workforce_staff_manage')
    .select('staff_id, tenant_id, email_encrypted, is_active')
    .eq('tenant_id', tenantId)
    .eq('staff_id', employeeId)
    .maybeSingle();
  if (employeeErr) return jsonResponse(500, { error: 'employee_read_failed' });
  if (!employee) return jsonResponse(404, { error: 'employee_not_found' });
  if (!employee.is_active) return jsonResponse(409, { error: 'employee_inactive' });
  if (!employee.email_encrypted) return jsonResponse(400, { error: 'employee_missing_email' });

  let email: string;
  try {
    email = await decryptPII(byteaToBytes(employee.email_encrypted as string), encryptionKey);
  } catch {
    return jsonResponse(500, { error: 'email_decrypt_failed' });
  }

  const invitationId = crypto.randomUUID();
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/accept-invite?invitation_id=${invitationId}`;

  // The ONLY use of the privileged key in this entire function: the Supabase
  // Auth Admin API calls. Nothing else below uses this client.
  const serviceClient = createClient(supabaseUrl, privilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let targetUserId: string;
  let wasNewUser: boolean;
  let recoveryEmailSent = false;
  try {
    if (isRecoveryAction) {
      const existingUserId = await findExistingAuthUser(serviceClient, email);
      if (!existingUserId) return jsonResponse(409, { error: 'employee_not_yet_invited' });
      targetUserId = existingUserId;
      wasNewUser = false;
      // The one place this function sends a real password-recovery email
      // instead of an invite -- see the RECOVERY comment above this
      // handler. Not an Admin API call (no service-role-only method
      // exists for it), but issued from this client purely because it is
      // the only place in this codebase already holding the decrypted
      // employee email.
      const recovery = await serviceClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (recovery.error) {
        return jsonResponse(502, { error: 'auth_recovery_email_failed', detail: recovery.error.message });
      }
      recoveryEmailSent = true;
    } else {
      const resolved = await resolveTargetUser(serviceClient, email, redirectTo);
      targetUserId = resolved.userId;
      wasNewUser = resolved.wasNewUser;
    }
  } catch (err) {
    return jsonResponse(502, { error: 'auth_admin_error', detail: err instanceof Error ? err.message : 'unknown' });
  }

  // The DB write itself uses the CALLER'S OWN JWT (userClient), not
  // service_role -- api.upsert_employee_invitation (0065) is SECURITY
  // DEFINER and re-verifies core.has_permission_in_tenant itself.
  const { data: upserted, error: upsertErr } = await userClient
    .schema('api')
    .rpc('upsert_employee_invitation', {
      p_tenant_id: tenantId,
      p_employee_id: employeeId,
      p_target_user_id: targetUserId,
      p_invitation_id: invitationId,
    })
    .maybeSingle();

  if (upsertErr) {
    const message = upsertErr.message ?? '';
    if (message.includes('not_authorized')) return jsonResponse(403, { error: 'not_authorized' });
    if (message.includes('employee_not_found')) return jsonResponse(404, { error: 'employee_not_found' });
    if (message.includes('employee_already_bound')) return jsonResponse(409, { error: 'employee_already_bound' });
    return jsonResponse(500, { error: 'invitation_write_failed' });
  }
  if (!upserted) return jsonResponse(500, { error: 'invitation_write_failed' });

  const wasResend = Boolean((upserted as { out_was_resend: boolean }).out_was_resend);
  const outcome = recoveryEmailSent
    ? 'recovery_email_sent'
    : wasResend
      ? wasNewUser
        ? 'resent_new_user_email'
        : 'resent_existing_user_no_email'
      : wasNewUser
        ? 'invited_new_user'
        : 'invited_existing_user_no_email';

  return jsonResponse(200, {
    outcome,
    invitationId: (upserted as { out_invitation_id: string }).out_invitation_id,
    expiresAt: (upserted as { out_expires_at: string }).out_expires_at,
  });
});
