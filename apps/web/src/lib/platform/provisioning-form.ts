import {
  DEFAULT_TIMEZONE,
  LOCATION_NAME_MAX_LENGTH,
  RESERVED_TENANT_SLUGS,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  TENANT_NAME_MAX_LENGTH,
  normalizeTenantSlug,
  validateOwnerEmail,
  validateTenantSlug,
  validateTimezone,
} from '@line-os/db/tenant-input-rules';

/**
 * Admin console create form (Stage 4B-3): field-level validation of the
 * provisioning input, used by the client form (instant feedback) AND the
 * Server Action (authority before the Edge Function call).
 *
 * The rules are NOT re-implemented here: slug / email / timezone checks and
 * the name limits come from `packages/db/scripts/tenant-input-rules.ts`
 * (`@line-os/db/tenant-input-rules`), the same pure, runtime-neutral module the
 * provision-tenant Edge Function uses through its generated copy
 * (`scripts/sync-edge-provisioning.mjs`). This file only maps each rule to a
 * per-field error CODE (the shared validators return English sentences, which
 * must never reach a JA/EN screen) and builds the exact Edge Function `input`
 * shape (`parseProvisioningRequestInput`: businessName, tenantSlug,
 * locationName, timezone, ownerEmail -- package and plan are fixed by the
 * code template, never sent).
 *
 * PURE: no I/O. The owner email is PII: it is never logged and never put in an
 * error value.
 */

export { DEFAULT_TIMEZONE };

export type ProvisioningField = 'businessName' | 'tenantSlug' | 'locationName' | 'timezone' | 'ownerEmail';

export type ProvisioningFieldError = 'required' | 'too_long' | 'slug_format' | 'slug_reserved' | 'slug_length' | 'email_invalid' | 'timezone_invalid';

export interface ProvisioningFormInput {
  businessName: string;
  tenantSlug: string;
  locationName: string;
  timezone: string;
  ownerEmail: string;
}

export type ProvisioningFormResult =
  | { ok: true; value: ProvisioningFormInput }
  | { ok: false; fieldErrors: Partial<Record<ProvisioningField, ProvisioningFieldError>> };

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function name(value: unknown, max: number): { ok: true; value: string } | { ok: false; error: ProvisioningFieldError } {
  const trimmed = str(value).trim();
  if (trimmed.length === 0) return { ok: false, error: 'required' };
  if (trimmed.length > max) return { ok: false, error: 'too_long' };
  return { ok: true, value: trimmed };
}

/** Classify a slug the shared validator already refused (its own checks, in its order: length, pattern, reserved). */
function slugError(raw: string): ProvisioningFieldError {
  const slug = normalizeTenantSlug(raw);
  if (slug.length === 0) return 'required';
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) return 'slug_length';
  if ((RESERVED_TENANT_SLUGS as readonly string[]).includes(slug)) return 'slug_reserved';
  return 'slug_format';
}

/** Validate raw form values (strings from FormData or client state). */
export function validateProvisioningForm(raw: Record<string, unknown>): ProvisioningFormResult {
  const fieldErrors: Partial<Record<ProvisioningField, ProvisioningFieldError>> = {};

  const businessName = name(raw.businessName, TENANT_NAME_MAX_LENGTH);
  if (!businessName.ok) fieldErrors.businessName = businessName.error;

  const slug = validateTenantSlug(str(raw.tenantSlug));
  if (!slug.ok) fieldErrors.tenantSlug = slugError(str(raw.tenantSlug));

  const locationName = name(raw.locationName, LOCATION_NAME_MAX_LENGTH);
  if (!locationName.ok) fieldErrors.locationName = locationName.error;

  const timezone = validateTimezone(str(raw.timezone));
  if (!timezone.ok) fieldErrors.timezone = 'timezone_invalid';

  const emailRaw = str(raw.ownerEmail);
  const email = validateOwnerEmail(emailRaw);
  if (!email.ok) fieldErrors.ownerEmail = emailRaw.trim().length === 0 ? 'required' : 'email_invalid';

  if (!businessName.ok || !slug.ok || !locationName.ok || !timezone.ok || !email.ok) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    value: {
      businessName: businessName.value,
      tenantSlug: slug.value,
      locationName: locationName.value,
      timezone: timezone.value,
      ownerEmail: email.value,
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The provisioning idempotency key: a UUID, lowercased (same rule as the Edge Function's parseProvisionBody). */
export function parseRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}
