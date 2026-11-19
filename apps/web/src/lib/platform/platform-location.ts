import { DEFAULT_TIMEZONE, validateTimezone } from '@line-os/db/tenant-input-rules';
import { parseLocationName } from '@/lib/tenant/location-manage';
import { parseUuid } from '@/lib/workforce/validation';

/**
 * Admin console store management (DEBT-139 L3c): input parsing for the
 * Server Actions and the mapping of a platform-location Edge Function response
 * (`supabase/functions/_shared/platform-location/job.ts` LocationResponseBody)
 * to one UI result. PURE: no I/O, no Next.js -- unit-testable.
 *
 * The name rule is the cabinet's (`parseLocationName`: trimmed ASCII /
 * full-width spaces, 1-60 code points, same bound as core.assert_location_name,
 * 0151); the timezone rule is the provisioning form's (`validateTimezone`, any
 * IANA zone, empty = Asia/Tokyo). The DB re-checks both. Only machine codes are
 * read from a response; free text never passes through.
 */

export { DEFAULT_TIMEZONE };

export type PlatformLocationErrorCode =
  | 'invalid_input'
  | 'invalid_name'
  | 'invalid_timezone'
  | 'name_taken'
  | 'limit_reached'
  | 'last_active_location'
  | 'has_active_staff'
  | 'tenant_not_active'
  | 'location_not_found'
  | 'not_staff'
  | 'session_expired'
  | 'unavailable'
  | 'unexpected';

/** Every code, for copy-completeness tests and exhaustive UI tables. */
export const PLATFORM_LOCATION_ERROR_CODES: readonly PlatformLocationErrorCode[] = [
  'invalid_input',
  'invalid_name',
  'invalid_timezone',
  'name_taken',
  'limit_reached',
  'last_active_location',
  'has_active_staff',
  'tenant_not_active',
  'location_not_found',
  'not_staff',
  'session_expired',
  'unavailable',
  'unexpected',
];

export type PlatformLocationResult =
  | { status: 'success'; locationId: string; changed: boolean; isActive: boolean | null }
  | { status: 'error'; code: PlatformLocationErrorCode };

/** What the console sends to the function (the action adds request_id). Never an actor id. */
export type PlatformLocationCommand =
  | { action: 'create'; tenantId: string; name: string; timezone: string }
  | { action: 'rename'; locationId: string; name: string }
  | { action: 'set_active'; locationId: string; isActive: boolean };

type Parsed<T> = { ok: true; value: T } | { ok: false; code: PlatformLocationErrorCode };

// --- input -------------------------------------------------------------------------

export function parseCreatePlatformLocationForm(formData: FormData): Parsed<Extract<PlatformLocationCommand, { action: 'create' }>> {
  const tenantId = parseUuid(formData.get('tenantId'));
  if (!tenantId) return { ok: false, code: 'invalid_input' };
  const name = parseLocationName(formData.get('name'));
  if (!name) return { ok: false, code: 'invalid_name' };
  const rawTimezone = formData.get('timezone');
  const timezone = validateTimezone(typeof rawTimezone === 'string' ? rawTimezone : undefined);
  if (!timezone.ok) return { ok: false, code: 'invalid_timezone' };
  return { ok: true, value: { action: 'create', tenantId, name, timezone: timezone.value } };
}

export function parseRenamePlatformLocationForm(formData: FormData): Parsed<Extract<PlatformLocationCommand, { action: 'rename' }>> {
  const locationId = parseUuid(formData.get('locationId'));
  if (!locationId) return { ok: false, code: 'invalid_input' };
  const name = parseLocationName(formData.get('name'));
  if (!name) return { ok: false, code: 'invalid_name' };
  return { ok: true, value: { action: 'rename', locationId, name } };
}

/** `isActive` must be exactly 'true' or 'false' (a missing flag must never archive). */
export function parseSetPlatformLocationActiveForm(formData: FormData): Parsed<Extract<PlatformLocationCommand, { action: 'set_active' }>> {
  const locationId = parseUuid(formData.get('locationId'));
  const raw = formData.get('isActive');
  if (!locationId || (raw !== 'true' && raw !== 'false')) return { ok: false, code: 'invalid_input' };
  return { ok: true, value: { action: 'set_active', locationId, isActive: raw === 'true' } };
}

/** The exact function body: `request_id`, `action` and that action's keys only. */
export function platformLocationRequestBody(requestId: string, command: PlatformLocationCommand): Record<string, unknown> {
  switch (command.action) {
    case 'create':
      return { request_id: requestId, action: 'create', tenant_id: command.tenantId, name: command.name, timezone: command.timezone };
    case 'rename':
      return { request_id: requestId, action: 'rename', location_id: command.locationId, name: command.name };
    case 'set_active':
      return { request_id: requestId, action: 'set_active', location_id: command.locationId, is_active: command.isActive };
  }
}

// --- response ----------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CODE_MAP: Record<string, PlatformLocationErrorCode> = {
  location_limit_reached: 'limit_reached',
  location_name_taken: 'name_taken',
  last_active_location: 'last_active_location',
  location_has_active_staff: 'has_active_staff',
  tenant_not_active: 'tenant_not_active',
  location_not_found: 'location_not_found',
  invalid_location_name: 'invalid_name',
  invalid_timezone: 'invalid_timezone',
  invalid_argument: 'invalid_input',
  invalid_json_body: 'invalid_input',
  invalid_body: 'invalid_input',
  invalid_request_id: 'invalid_input',
  invalid_action: 'invalid_input',
  invalid_field: 'invalid_input',
  unknown_field: 'invalid_input',
  not_platform_staff: 'not_staff',
  not_authenticated: 'session_expired',
  missing_bearer_token: 'session_expired',
  // Function configuration / its own permission read: an environment problem, not the request.
  missing_configuration: 'unavailable',
  permission_check_failed: 'unavailable',
};

/**
 * @param httpStatus HTTP status of the function response, or `null` when the
 *   call failed before any response (network).
 * @param body Parsed JSON body (unknown shape), or `null` when unreadable.
 */
export function mapPlatformLocationResponse(httpStatus: number | null, body: unknown): PlatformLocationResult {
  if (httpStatus === null) return { status: 'error', code: 'unavailable' };
  const obj = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  if (httpStatus >= 200 && httpStatus < 300) {
    const locationId = typeof obj.location_id === 'string' && UUID_RE.test(obj.location_id) ? obj.location_id.toLowerCase() : null;
    if (!locationId || obj.error !== undefined) return { status: 'error', code: 'unexpected' };
    return {
      status: 'success',
      locationId,
      changed: obj.changed === true,
      isActive: typeof obj.is_active === 'boolean' ? obj.is_active : null,
    };
  }

  const known = typeof obj.error === 'string' ? CODE_MAP[obj.error] : undefined;
  if (known) return { status: 'error', code: known };
  if (httpStatus === 401) return { status: 'error', code: 'session_expired' };
  if (httpStatus === 403) return { status: 'error', code: 'not_staff' };
  // 404 without a known code = function not deployed; 502-504 = gateway / cold start.
  if (httpStatus === 404 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) return { status: 'error', code: 'unavailable' };
  return { status: 'error', code: 'unexpected' };
}
