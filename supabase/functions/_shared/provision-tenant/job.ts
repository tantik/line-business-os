// ============================================================================
// _shared/provision-tenant/job.ts -- tenant provisioning orchestration (4B-2)
// ----------------------------------------------------------------------------
// Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §2, §4, §7.
// Called by `provision-tenant/index.ts` AFTER it verified the caller's JWT and
// platform-staff flag; `actorId` is that verified Auth user id (= core.users.id,
// 0002), never a value from the request body (DEBT-109 b).
//
//   1. parse + validate the operator input (the SAME pure code as packages/db,
//      generated copy in ../provisioning/) and build the payload from the
//      code template (the caller cannot send its own payload);
//   2. api.provision_tenant(request_id, payload, actor) -- ONE transaction
//      (0133). On a refusal before any write (not staff, slug taken, slug /
//      request mismatch, rate limit) nothing is recorded; on any other DB
//      failure api.mark_provisioning_failed(SAME request_id, slug, code) so the
//      console can retry the same request (DEBT-109 a);
//   3. status db_done / invite_failed -> Owner invite: protect the email
//      (AES-GCM + blind index), resolve the Auth user (inviteUserByEmail, or
//      listUsers when already registered -- same as invite-employee), then
//      api.create_tenant_owner_invitation (0134: core.users row + pending
//      invitation + status invite_sent, one transaction). Any failure ->
//      api.set_provisioning_status(invite_failed, code);
//   4. status invite_sent / ready -> nothing to do (idempotent replay).
//
// Retry = the SAME request_id with the same input: step 2 returns the stored
// result without writing, so only the invite step runs again.
//
// Responses and logs carry ids, statuses and machine codes only -- never the
// email, names or raw DB / Auth error text.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports; every side effect is
// injected, so this is unit-testable under Node/tsx.
// ============================================================================

import {
  buildProvisioningPayload,
  parseProvisioningRequestInput,
  validateProvisioningPayload,
} from '../provisioning/provisioning-payload.ts';

export interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** Injected RPC caller -- in the Edge Function: the service-role client on the `api` schema. */
export type ProvisionRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

export interface AdminUser {
  id: string;
  email?: string | null;
}

/** The two Supabase Auth Admin calls this job uses (service-role client `auth.admin`). */
export interface AuthAdmin {
  inviteUserByEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{ data: { user?: AdminUser | null } | null; error: { message?: string } | null }>;
  listUsers(params: { page: number; perPage: number }): Promise<{
    data: { users?: AdminUser[] } | null;
    error: { message?: string } | null;
  }>;
}

export interface ProvisionDeps {
  rpc: ProvisionRpc;
  authAdmin: AuthAdmin;
  /** Encrypt + blind-index the Owner email (`_shared/pii-protect.ts` bound to the env keys). */
  protectEmail(email: string): Promise<{ emailEncryptedBytea: string; emailHash: string }>;
  /** Where the Auth invite email lands (the app's auth callback). */
  ownerRedirectTo: string;
  /** Structured, PII-free log sink. */
  log?(event: Record<string, unknown>): void;
}

export interface ProvisionRequest {
  requestId: string;
  /** Verified caller (JWT) -- never from the body. */
  actorId: string;
  input: unknown;
}

export type ProvisionStatus = 'db_done' | 'invite_sent' | 'ready' | 'failed_db' | 'invite_failed';

export interface ProvisionResponseBody {
  status?: ProvisionStatus;
  request_id: string;
  tenant_id?: string | null;
  error?: string;
  errors?: string[];
  invitation_id?: string;
  expires_at?: string;
  outcome?: 'invited_new_user' | 'invited_existing_user_no_email' | 'already_done';
  idempotent?: boolean;
}

export interface ProvisionOutcome {
  httpStatus: number;
  body: ProvisionResponseBody;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALREADY_REGISTERED_MARKERS = ['already been registered', 'already registered', 'already exists', 'duplicate'];
const MAX_LIST_PAGES = 50;
const LIST_PAGE_SIZE = 200;

/** Request body: exactly `{ request_id, input }`. Anything else (e.g. an actor id) is refused. */
export function parseProvisionBody(
  body: unknown,
): { ok: true; requestId: string; input: unknown } | { ok: false; error: 'invalid_body' | 'unknown_field' | 'invalid_request_id' } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'request_id' && key !== 'input') return { ok: false, error: 'unknown_field' };
  }
  if (typeof obj.request_id !== 'string' || !UUID_RE.test(obj.request_id)) return { ok: false, error: 'invalid_request_id' };
  return { ok: true, requestId: obj.request_id.toLowerCase(), input: obj.input };
}

/** DB error -> machine code + HTTP status + whether a failed_db record makes sense. */
export function classifyProvisionDbError(error: { code?: string; message?: string }): {
  code: string;
  httpStatus: number;
  record: boolean;
} {
  const message = error.message ?? '';
  if (error.code === '42501' || message.includes('actor_not_platform_staff')) return { code: 'not_platform_staff', httpStatus: 403, record: false };
  if (message.includes('request_slug_mismatch')) return { code: 'request_slug_mismatch', httpStatus: 409, record: false };
  if (message.includes('slug_taken')) return { code: 'slug_taken', httpStatus: 409, record: false };
  if (message.includes('rate_limited')) return { code: 'rate_limited', httpStatus: 429, record: false };
  if (error.code === '22023' || message.includes('invalid_payload')) return { code: 'invalid_payload', httpStatus: 422, record: true };
  return { code: 'db_error', httpStatus: 500, record: true };
}

function isAlreadyRegisteredError(message: string): boolean {
  const lower = message.toLowerCase();
  return ALREADY_REGISTERED_MARKERS.some((marker) => lower.includes(marker));
}

class InviteStepError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InviteStepError';
  }
}

/**
 * Resolve the Owner's Auth user: invite a new user (Supabase sends its invite
 * email), or -- when the address is already registered -- find that user via
 * listUsers WITHOUT sending anything (invite-employee, Founder decision 8).
 */
export async function resolveOwnerAuthUser(
  authAdmin: AuthAdmin,
  email: string,
  redirectTo: string,
): Promise<{ userId: string; wasNewUser: boolean }> {
  const invited = await authAdmin.inviteUserByEmail(email, { redirectTo });
  if (invited.error === null) {
    const user = invited.data?.user;
    if (!user?.id) throw new InviteStepError('auth_invite_no_user');
    return { userId: user.id, wasNewUser: true };
  }
  if (!isAlreadyRegisteredError(invited.error.message ?? '')) throw new InviteStepError('auth_invite_failed');

  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_LIST_PAGES; page += 1) {
    const listed = await authAdmin.listUsers({ page, perPage: LIST_PAGE_SIZE });
    if (listed.error) throw new InviteStepError('auth_list_failed');
    const users = listed.data?.users ?? [];
    const match = users.find((u) => (u.email ?? '').trim().toLowerCase() === normalizedEmail);
    if (match) return { userId: match.id, wasNewUser: false };
    if (users.length < LIST_PAGE_SIZE) break;
  }
  throw new InviteStepError('auth_existing_user_not_found');
}

interface ProvisionResultRow {
  status: ProvisionStatus;
  tenant_id: string | null;
  idempotent?: boolean;
}

export async function runProvisionTenant(deps: ProvisionDeps, req: ProvisionRequest): Promise<ProvisionOutcome> {
  const log = deps.log ?? (() => {});
  const requestId = req.requestId;
  if (!UUID_RE.test(requestId)) return { httpStatus: 400, body: { error: 'invalid_request_id', request_id: requestId } };
  if (!UUID_RE.test(req.actorId)) return { httpStatus: 401, body: { error: 'not_authenticated', request_id: requestId } };

  // 1. input -> payload (code template; the caller never sends a payload)
  const parsed = parseProvisioningRequestInput(req.input);
  if (!parsed.ok) return { httpStatus: 400, body: { error: 'invalid_input', errors: parsed.errors, request_id: requestId } };
  const payload = buildProvisioningPayload(parsed.value.tenant);
  const checked = validateProvisioningPayload(payload);
  if (!checked.ok) {
    log({ event: 'provision-tenant.template_invalid', request_id: requestId });
    return { httpStatus: 500, body: { error: 'template_invalid', request_id: requestId } };
  }
  const slug = payload.slug;

  // 2. the provisioning transaction
  const provisioned = await deps.rpc('provision_tenant', { p_request_id: requestId, p_payload: payload, p_actor_id: req.actorId });
  if (provisioned.error) {
    const failure = classifyProvisionDbError(provisioned.error);
    log({ event: 'provision-tenant.db_failed', request_id: requestId, code: failure.code, db_code: provisioned.error.code ?? null });
    let status: ProvisionStatus | undefined;
    if (failure.record) {
      const marked = await deps.rpc('mark_provisioning_failed', {
        p_request_id: requestId,
        p_slug: slug,
        p_error_code: failure.code,
        p_actor_id: req.actorId,
      });
      if (marked.error) log({ event: 'provision-tenant.mark_failed_error', request_id: requestId, db_code: marked.error.code ?? null });
      else status = ((marked.data as ProvisionResultRow | null)?.status ?? 'failed_db');
    }
    return { httpStatus: failure.httpStatus, body: { error: failure.code, request_id: requestId, ...(status ? { status } : {}) } };
  }

  const row = provisioned.data as ProvisionResultRow | null;
  if (!row || typeof row.status !== 'string' || !row.tenant_id) {
    log({ event: 'provision-tenant.unexpected_result', request_id: requestId });
    return { httpStatus: 500, body: { error: 'unexpected_result', request_id: requestId } };
  }
  const tenantId = row.tenant_id;
  if (row.status === 'invite_sent' || row.status === 'ready') {
    return { httpStatus: 200, body: { status: row.status, tenant_id: tenantId, request_id: requestId, outcome: 'already_done', idempotent: true } };
  }
  if (row.status !== 'db_done' && row.status !== 'invite_failed') {
    return { httpStatus: 500, body: { error: 'unexpected_status', request_id: requestId, tenant_id: tenantId } };
  }

  // 3. the Owner invite (resumable: the same request_id re-runs only this part)
  const inviteFailed = async (code: string, httpStatus: number): Promise<ProvisionOutcome> => {
    log({ event: 'provision-tenant.invite_failed', request_id: requestId, code });
    const marked = await deps.rpc('set_provisioning_status', {
      p_request_id: requestId,
      p_status: 'invite_failed',
      p_error_code: code,
      p_actor_id: req.actorId,
    });
    if (marked.error) log({ event: 'provision-tenant.set_status_error', request_id: requestId, db_code: marked.error.code ?? null });
    const status = marked.error ? row.status : ((marked.data as ProvisionResultRow | null)?.status ?? 'invite_failed');
    return { httpStatus, body: { error: code, status, tenant_id: tenantId, request_id: requestId } };
  };

  let protectedEmail: { emailEncryptedBytea: string; emailHash: string };
  try {
    // before the Auth call: a config problem must not send an email without a row
    protectedEmail = await deps.protectEmail(parsed.value.ownerEmail);
  } catch {
    return inviteFailed('pii_protect_failed', 500);
  }

  let owner: { userId: string; wasNewUser: boolean };
  try {
    owner = await resolveOwnerAuthUser(deps.authAdmin, parsed.value.ownerEmail, deps.ownerRedirectTo);
  } catch (err) {
    return inviteFailed(err instanceof InviteStepError ? err.code : 'auth_admin_error', 502);
  }

  const created = await deps.rpc('create_tenant_owner_invitation', {
    p_request_id: requestId,
    p_tenant_id: tenantId,
    p_target_user_id: owner.userId,
    p_email_encrypted: protectedEmail.emailEncryptedBytea,
    p_email_hash: protectedEmail.emailHash,
    p_actor_id: req.actorId,
  });
  if (created.error) {
    const message = created.error.message ?? '';
    if (message.includes('owner_invitation_conflict')) return inviteFailed('owner_invitation_conflict', 409);
    if (message.includes('owner_already_accepted')) return inviteFailed('owner_already_accepted', 409);
    return inviteFailed('invitation_write_failed', 500);
  }
  const invitation = created.data as { invitation_id?: string; expires_at?: string } | null;
  log({ event: 'provision-tenant.invite_sent', request_id: requestId, new_user: owner.wasNewUser });
  return {
    httpStatus: 200,
    body: {
      status: 'invite_sent',
      tenant_id: tenantId,
      request_id: requestId,
      ...(invitation?.invitation_id ? { invitation_id: invitation.invitation_id } : {}),
      ...(invitation?.expires_at ? { expires_at: invitation.expires_at } : {}),
      outcome: owner.wasNewUser ? 'invited_new_user' : 'invited_existing_user_no_email',
      idempotent: false,
    },
  };
}
