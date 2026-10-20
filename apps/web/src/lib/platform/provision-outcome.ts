/**
 * Maps a provision-tenant Edge Function response (Stage 4B-2 contract,
 * `supabase/functions/_shared/provision-tenant/job.ts` ProvisionResponseBody)
 * to one UI outcome for the admin console (4B-3). PURE: no I/O.
 *
 * Only machine codes are read. The response never carries PII (the function
 * guarantees that); this mapper still never passes a free-text field through.
 */

export type ProvisioningStatus = 'requested' | 'db_done' | 'invite_sent' | 'ready' | 'failed_db' | 'invite_failed';

export type ProvisionOutcomeKind =
  /** Tenant created, Auth sent the Owner an invite email. */
  | 'invited'
  /** Tenant created; the address already had an account -> no email, the Owner accepts from the in-app banner. */
  | 'invited_existing'
  /** Same request_id replayed after it had already finished (invite_sent / ready). */
  | 'already_done'
  | 'invalid_input'
  | 'slug_taken'
  /** The request_id was already used with another slug (a recorded failed_db) -> start a new request. */
  | 'request_mismatch'
  | 'rate_limited'
  | 'not_staff'
  /** The DB transaction rolled back (nothing created); retry with the SAME request_id. */
  | 'failed_db'
  /** Tenant exists, the Owner invite step failed; retry with the SAME request_id re-runs only the invite. */
  | 'invite_failed'
  /** Tenant exists, but its Owner invitation needs an operator fix (other address pending / owner already in). */
  | 'invite_blocked'
  /** Function not reachable / not deployed / unreadable response. */
  | 'unavailable'
  | 'error';

export interface ProvisionOutcome {
  kind: ProvisionOutcomeKind;
  requestId: string;
  tenantId: string | null;
  status: ProvisioningStatus | null;
  /** Machine code from the function (snake_case) -- safe to show as a reference, never free text. */
  errorCode: string | null;
  /** True when a retry with the SAME request_id is the right next step. */
  retryable: boolean;
  /** True when the operator must start a NEW request (new request_id). */
  needsNewRequest: boolean;
}

const STATUSES: ReadonlySet<string> = new Set(['requested', 'db_done', 'invite_sent', 'ready', 'failed_db', 'invite_failed']);
const CODE_RE = /^[a-z0-9_]{1,64}$/;

function asStatus(value: unknown): ProvisioningStatus | null {
  return typeof value === 'string' && STATUSES.has(value) ? (value as ProvisioningStatus) : null;
}

function asCode(value: unknown): string | null {
  return typeof value === 'string' && CODE_RE.test(value) ? value : null;
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value.toLowerCase() : null;
}

/**
 * @param httpStatus HTTP status of the function response, or `null` when the
 *   call failed before any response (network) or the body was unreadable.
 * @param body Parsed JSON body (unknown shape), or `null`.
 * @param requestId The request_id this submission used.
 */
export function mapProvisionResponse(httpStatus: number | null, body: unknown, requestId: string): ProvisionOutcome {
  const obj = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const status = asStatus(obj.status);
  const errorCode = asCode(obj.error);
  const tenantId = asId(obj.tenant_id);
  const base = { requestId, tenantId, status, errorCode, retryable: false, needsNewRequest: false };

  if (httpStatus === null) return { ...base, kind: 'unavailable', retryable: true };

  if (httpStatus >= 200 && httpStatus < 300) {
    if (obj.outcome === 'already_done' || status === 'ready') return { ...base, kind: 'already_done' };
    if (status === 'invite_sent') {
      return { ...base, kind: obj.outcome === 'invited_existing_user_no_email' ? 'invited_existing' : 'invited' };
    }
    return { ...base, kind: 'error' };
  }

  switch (errorCode) {
    case 'invalid_input':
    case 'invalid_json_body':
    case 'invalid_body':
    case 'unknown_field':
    case 'invalid_request_id':
      return { ...base, kind: 'invalid_input' };
    case 'slug_taken':
      return { ...base, kind: 'slug_taken' };
    case 'request_slug_mismatch':
      return { ...base, kind: 'request_mismatch', needsNewRequest: true };
    case 'rate_limited':
      return { ...base, kind: 'rate_limited', retryable: true };
    case 'not_platform_staff':
    case 'not_authenticated':
    case 'missing_bearer_token':
      return { ...base, kind: 'not_staff' };
    case 'owner_invitation_conflict':
    case 'owner_already_accepted':
      return { ...base, kind: 'invite_blocked' };
    // Function configuration / its own permission read: an environment problem, not the request.
    case 'missing_configuration':
    case 'permission_check_failed':
      return { ...base, kind: 'unavailable', retryable: true };
    // The payload the code template built was refused: the same data fails again.
    case 'invalid_payload':
    case 'template_invalid':
      return { ...base, kind: 'error' };
    default:
      break;
  }

  if (status === 'invite_failed' || (tenantId && status === 'db_done')) return { ...base, kind: 'invite_failed', retryable: true };
  if (status === 'failed_db' || errorCode === 'db_error') {
    return { ...base, kind: 'failed_db', retryable: true };
  }
  if (httpStatus === 401 || httpStatus === 403) return { ...base, kind: 'not_staff' };
  // 404 = function not deployed; 5xx without a known code = transient / config.
  if (httpStatus === 404 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
    return { ...base, kind: 'unavailable', retryable: true };
  }
  return { ...base, kind: 'error', retryable: httpStatus >= 500 };
}

/** Which stored statuses get a Retry button on the detail view (same request_id). */
export function isRetryableStatus(status: string | null): boolean {
  return status === 'failed_db' || status === 'invite_failed';
}
