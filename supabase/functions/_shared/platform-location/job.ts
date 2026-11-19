// ============================================================================
// _shared/platform-location/job.ts -- console store management (DEBT-139 L3c)
// ----------------------------------------------------------------------------
// Called by `platform-location/index.ts` AFTER it verified the caller's JWT and
// platform-staff flag; `actorId` is that verified Auth user id (= core.users.id,
// 0002), never a value from the request body (same rule as provision-tenant,
// DEBT-109 b).
//
// Body: { request_id: uuid, action, ...per-action keys } -- any other key -> 400
//   create     { tenant_id, name, timezone? }  -> api.platform_create_location
//              (timezone default Asia/Tokyo; p_source_location_id NULL so the
//              DB copies the defaults from the tenant's oldest open store)
//   rename     { location_id, name }           -> api.platform_rename_location
//   set_active { location_id, is_active }      -> api.platform_set_location_active
// The 0151 functions re-check the actor (core.assert_platform_staff_actor) and
// own every rule (name 1-60 + unique among open stores, timezone, store limit,
// last open store, active staff) and the audit row (actor_kind platform).
//
// request_id is a correlation id for logs / responses only. A double create is
// refused by the DB (location_name_taken), rename / set_active are no-ops when
// nothing changes, so no idempotency table is needed.
//
// Responses and logs carry ids, the action and machine codes only -- never the
// store name or raw DB error text.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports; every side effect is
// injected, so this is unit-testable under Node/tsx.
// ============================================================================

export interface RpcResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

/** Injected RPC caller -- in the Edge Function: the service-role client on the `api` schema. */
export type LocationRpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

export interface LocationDeps {
  rpc: LocationRpc;
  /** Structured, PII-free log sink. */
  log?(event: Record<string, unknown>): void;
}

export type LocationAction = 'create' | 'rename' | 'set_active';

export type LocationCommand =
  | { action: 'create'; tenantId: string; name: string; timezone: string }
  | { action: 'rename'; locationId: string; name: string }
  | { action: 'set_active'; locationId: string; isActive: boolean };

export interface LocationRequest {
  requestId: string;
  /** Verified caller (JWT) -- never from the body. */
  actorId: string;
  command: LocationCommand;
}

export interface LocationResponseBody {
  request_id: string;
  action?: LocationAction;
  error?: string;
  location_id?: string;
  tenant_id?: string;
  changed?: boolean;
  is_active?: boolean;
}

export interface LocationOutcome {
  httpStatus: number;
  body: LocationResponseBody;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_TIMEZONE = 'Asia/Tokyo';
/** Generous transport bounds; the DB owns the real rules (name 1-60 after trim, pg_timezone_names). */
const MAX_NAME_RAW_LENGTH = 400;
const MAX_TIMEZONE_LENGTH = 64;

const ALLOWED_KEYS: Record<LocationAction, readonly string[]> = {
  create: ['request_id', 'action', 'tenant_id', 'name', 'timezone'],
  rename: ['request_id', 'action', 'location_id', 'name'],
  set_active: ['request_id', 'action', 'location_id', 'is_active'],
};

export type ParseError = 'invalid_body' | 'invalid_request_id' | 'invalid_action' | 'unknown_field' | 'invalid_field';

function isAction(value: unknown): value is LocationAction {
  return value === 'create' || value === 'rename' || value === 'set_active';
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function rawName(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME_RAW_LENGTH ? value : null;
}

/**
 * Request body: `{ request_id, action }` plus exactly the keys of that action.
 * Anything else (e.g. an actor id, a source location) is refused.
 */
export function parseLocationBody(
  body: unknown,
): { ok: true; requestId: string; command: LocationCommand } | { ok: false; error: ParseError } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'invalid_body' };
  const obj = body as Record<string, unknown>;
  const requestId = uuid(obj.request_id);
  if (!requestId) return { ok: false, error: 'invalid_request_id' };
  if (!isAction(obj.action)) return { ok: false, error: 'invalid_action' };
  const action = obj.action;
  const allowed = ALLOWED_KEYS[action];
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return { ok: false, error: 'unknown_field' };
  }

  if (action === 'create') {
    const tenantId = uuid(obj.tenant_id);
    const name = rawName(obj.name);
    let timezone = DEFAULT_TIMEZONE;
    if (obj.timezone !== undefined && obj.timezone !== null) {
      if (typeof obj.timezone !== 'string' || obj.timezone.length > MAX_TIMEZONE_LENGTH) return { ok: false, error: 'invalid_field' };
      const trimmed = obj.timezone.trim();
      if (trimmed.length > 0) timezone = trimmed;
    }
    if (!tenantId || name === null) return { ok: false, error: 'invalid_field' };
    return { ok: true, requestId, command: { action, tenantId, name, timezone } };
  }
  if (action === 'rename') {
    const locationId = uuid(obj.location_id);
    const name = rawName(obj.name);
    if (!locationId || name === null) return { ok: false, error: 'invalid_field' };
    return { ok: true, requestId, command: { action, locationId, name } };
  }
  const locationId = uuid(obj.location_id);
  if (!locationId || typeof obj.is_active !== 'boolean') return { ok: false, error: 'invalid_field' };
  return { ok: true, requestId, command: { action, locationId, isActive: obj.is_active } };
}

/** DB error -> stable machine code + HTTP status. The 0151 functions raise P0001 with these message identifiers. */
export function classifyLocationDbError(error: { code?: string; message?: string }): { code: string; httpStatus: number } {
  const message = error.message ?? '';
  if (error.code === '42501' || message.includes('actor_not_platform_staff')) return { code: 'not_platform_staff', httpStatus: 403 };
  if (message.includes('location_limit_reached')) return { code: 'location_limit_reached', httpStatus: 409 };
  if (message.includes('location_name_taken')) return { code: 'location_name_taken', httpStatus: 409 };
  if (message.includes('last_active_location')) return { code: 'last_active_location', httpStatus: 409 };
  if (message.includes('location_has_active_staff')) return { code: 'location_has_active_staff', httpStatus: 409 };
  if (message.includes('tenant_not_active')) return { code: 'tenant_not_active', httpStatus: 409 };
  if (message.includes('location_not_found')) return { code: 'location_not_found', httpStatus: 404 };
  if (message.includes('invalid_location_name')) return { code: 'invalid_location_name', httpStatus: 422 };
  if (message.includes('invalid_timezone')) return { code: 'invalid_timezone', httpStatus: 422 };
  if (error.code === '22004' || error.code === '22P02' || error.code === '22023') return { code: 'invalid_argument', httpStatus: 422 };
  return { code: 'db_error', httpStatus: 500 };
}

function readObject(data: unknown): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

export async function runPlatformLocation(deps: LocationDeps, req: LocationRequest): Promise<LocationOutcome> {
  const log = deps.log ?? (() => {});
  const { requestId, command } = req;
  const action = command.action;
  if (!UUID_RE.test(requestId)) return { httpStatus: 400, body: { error: 'invalid_request_id', request_id: requestId } };
  if (!UUID_RE.test(req.actorId)) return { httpStatus: 401, body: { error: 'not_authenticated', request_id: requestId } };

  let fn: string;
  let args: Record<string, unknown>;
  if (command.action === 'create') {
    fn = 'platform_create_location';
    args = {
      p_tenant_id: command.tenantId,
      p_name: command.name,
      p_timezone: command.timezone,
      p_source_location_id: null,
      p_actor_id: req.actorId,
    };
  } else if (command.action === 'rename') {
    fn = 'platform_rename_location';
    args = { p_location_id: command.locationId, p_name: command.name, p_actor_id: req.actorId };
  } else {
    fn = 'platform_set_location_active';
    args = { p_location_id: command.locationId, p_is_active: command.isActive, p_actor_id: req.actorId };
  }

  const result = await deps.rpc(fn, args);
  if (result.error) {
    const failure = classifyLocationDbError(result.error);
    log({ event: 'platform-location.db_failed', request_id: requestId, action, code: failure.code, db_code: result.error.code ?? null });
    return { httpStatus: failure.httpStatus, body: { error: failure.code, request_id: requestId, action } };
  }

  const row = readObject(result.data);
  const locationId = uuid(row?.location_id);
  if (!row || !locationId) {
    log({ event: 'platform-location.unexpected_result', request_id: requestId, action });
    return { httpStatus: 500, body: { error: 'unexpected_result', request_id: requestId, action } };
  }

  if (command.action === 'create') {
    const tenantId = uuid(row.tenant_id) ?? command.tenantId;
    log({ event: 'platform-location.created', request_id: requestId, tenant_id: tenantId, location_id: locationId });
    return { httpStatus: 200, body: { request_id: requestId, action, location_id: locationId, tenant_id: tenantId, changed: true } };
  }
  const changed = row.changed === true;
  if (command.action === 'rename') {
    log({ event: 'platform-location.renamed', request_id: requestId, location_id: locationId, changed });
    return { httpStatus: 200, body: { request_id: requestId, action, location_id: locationId, changed } };
  }
  const isActive = typeof row.is_active === 'boolean' ? row.is_active : command.isActive;
  log({ event: 'platform-location.set_active', request_id: requestId, location_id: locationId, is_active: isActive, changed });
  return { httpStatus: 200, body: { request_id: requestId, action, location_id: locationId, is_active: isActive, changed } };
}
