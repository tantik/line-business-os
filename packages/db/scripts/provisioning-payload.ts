/**
 * Tenant provisioning payload (Stage 4B-1): pure builder + validator.
 *
 * `buildProvisioningPayload` turns operator input (business name, slug,
 * location, timezone) plus the versioned package template and the HACCP
 * manifest into the jsonb payload `core.provision_tenant` (migration 0133)
 * accepts. `validateProvisioningPayload` re-checks an arbitrary payload with
 * the same rules as the SQL validator (`core.validate_provisioning_payload`),
 * so the provision-tenant Edge Function (4B-2) can refuse bad input before
 * the RPC. The SQL validator stays the authority (it also checks the plan,
 * package and timezone against the live catalog).
 *
 * Input rules are the ones of the local onboarding planner
 * (`tenant-input-rules.ts`, re-exported by `onboard-tenant.ts`:
 * validateTenantSlug, validateTimezone, validateOwnerEmail, name lengths),
 * reused, not copied.
 *
 * EDGE COPY: this file, `tenant-input-rules.ts`, `cafe-package-template.ts`
 * and `cafe-haccp-presets.ts` are copied verbatim into
 * `supabase/functions/_shared/provisioning/` by
 * `scripts/sync-edge-provisioning.mjs` (drift guard:
 * `_shared/provisioning/provisioning-sync.test.ts`). Keep them free of
 * `node:*` imports and Node globals.
 *
 * PII: the payload never carries an email, phone or personal name. Only
 * whitelisted keys are accepted, here and in SQL. The Owner invitation is a
 * separate step (4B-2).
 *
 * PURE: no I/O, no clock, no randomness.
 */
import {
  CAFE_HACCP_PRESETS_MANIFEST,
  type CafeHaccpPresetsManifest,
} from './cafe-haccp-presets.js';
import { CAFE_PACKAGE_TEMPLATE, type CafePackageTemplate } from './cafe-package-template.js';
import {
  LOCATION_NAME_MAX_LENGTH,
  TENANT_NAME_MAX_LENGTH,
  validateOwnerEmail,
  validateTenantSlug,
  validateTimezone,
  type ParseResult,
} from './tenant-input-rules.js';

/** Payload shape of core.provision_tenant (snake_case = SQL keys). */
export interface ProvisioningPayload {
  slug: string;
  business_name: string;
  location: { name: string; timezone: string };
  plan: { code: string; trial_days: number };
  package_code: string;
  template_version: number;
  schedule_settings: {
    required_headcount_by_weekday: number[];
    max_monthly_hours: number;
    max_weekly_hours: number;
    max_days_per_week: number;
    auto_create_day_of_month: number;
    auto_create_enabled: false;
  };
  shift_types: {
    code: string;
    label_ja: string;
    label_en: string | null;
    starts_at_local: string;
    ends_at_local: string;
    break_minutes: number;
    sort_order: number;
  }[];
  operations: {
    manifest_version: number;
    templates: {
      name: string;
      category: string | null;
      due_time: string;
      window_end_time: string | null;
      recurrence_kind: 'daily' | 'weekdays';
      weekdays?: number[] | null;
      items: {
        label: string;
        response_type: 'boolean' | 'numeric' | 'text';
        is_critical: boolean;
        is_required: boolean;
        numeric_min: number | null;
        numeric_max: number | null;
        numeric_unit: string | null;
      }[];
    }[];
  };
}

/** Raw, operator-supplied provisioning fields (all untrusted). */
export interface RawProvisioningInput {
  businessName?: unknown;
  tenantSlug?: unknown;
  locationName?: unknown;
  timezone?: unknown;
}

export interface ProvisioningInput {
  businessName: string;
  tenantSlug: string;
  locationName: string;
  timezone: string;
}

function requiredName(input: unknown, label: string, max: number, errors: string[]): string | null {
  if (typeof input !== 'string') {
    errors.push(`${label} is required.`);
    return null;
  }
  const value = input.trim();
  if (value.length === 0) {
    errors.push(`${label} must not be empty.`);
    return null;
  }
  if (value.length > max) {
    errors.push(`${label} must be at most ${max} characters.`);
    return null;
  }
  return value;
}

/** Validate + normalize operator input, collecting every error (onboard-tenant.ts rules). */
export function parseProvisioningInput(raw: RawProvisioningInput): ParseResult<ProvisioningInput> {
  const errors: string[] = [];
  const businessName = requiredName(raw.businessName, 'Business name', TENANT_NAME_MAX_LENGTH, errors);
  const slug = validateTenantSlug(raw.tenantSlug);
  if (!slug.ok) errors.push(slug.error);
  const locationName = requiredName(raw.locationName, 'Location name', LOCATION_NAME_MAX_LENGTH, errors);
  const timezone = validateTimezone(raw.timezone);
  if (!timezone.ok) errors.push(timezone.error);
  if (errors.length > 0 || businessName === null || locationName === null || !slug.ok || !timezone.ok) {
    return { ok: false, errors };
  }
  return { ok: true, value: { businessName, tenantSlug: slug.value, locationName, timezone: timezone.value } };
}

/** Raw body `input` of the provision-tenant Edge Function (4B-2): tenant fields + the Owner email. */
export interface RawProvisioningRequestInput extends RawProvisioningInput {
  ownerEmail?: unknown;
}

/**
 * Parsed Edge Function input. The Owner email is PII: it is kept OUT of the
 * provisioning payload (never sent to core.provision_tenant, never logged) and
 * only used for the Auth invite + its encrypted / blind-indexed copy.
 */
export interface ProvisioningRequestInput {
  tenant: ProvisioningInput;
  ownerEmail: string;
}

const REQUEST_INPUT_KEYS = ['businessName', 'tenantSlug', 'locationName', 'timezone', 'ownerEmail'] as const;

/**
 * Validate the whole Edge Function `input` object: only the known keys, the
 * tenant fields ({@link parseProvisioningInput}) and a required Owner email
 * (`validateOwnerEmail`, normalized to lowercase). Errors never echo the email.
 */
export function parseProvisioningRequestInput(raw: unknown): ParseResult<ProvisioningRequestInput> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['input must be an object.'] };
  }
  const obj = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(obj)) {
    if (!(REQUEST_INPUT_KEYS as readonly string[]).includes(key)) errors.push(`input: unknown key "${key}".`);
  }
  const tenant = parseProvisioningInput(obj);
  if (!tenant.ok) errors.push(...tenant.errors);
  const email = validateOwnerEmail(obj.ownerEmail);
  if (!email.ok) errors.push(email.error);
  if (errors.length > 0 || !tenant.ok || !email.ok) return { ok: false, errors };
  return { ok: true, value: { tenant: tenant.value, ownerEmail: email.value } };
}

/**
 * Build the core.provision_tenant payload from validated input, the package
 * template and the HACCP manifest. Deterministic: same input -> same payload.
 */
export function buildProvisioningPayload(
  input: ProvisioningInput,
  template: CafePackageTemplate = CAFE_PACKAGE_TEMPLATE,
  manifest: CafeHaccpPresetsManifest = CAFE_HACCP_PRESETS_MANIFEST,
): ProvisioningPayload {
  const s = template.scheduleDefaults;
  return {
    slug: input.tenantSlug,
    business_name: input.businessName,
    location: { name: input.locationName, timezone: input.timezone },
    plan: { code: template.plan.code, trial_days: template.plan.trialDays },
    package_code: template.packageCode,
    template_version: template.version,
    schedule_settings: {
      required_headcount_by_weekday: [...s.requiredHeadcountByWeekday],
      max_monthly_hours: s.maxMonthlyHours,
      max_weekly_hours: s.maxWeeklyHours,
      max_days_per_week: s.maxDaysPerWeek,
      auto_create_day_of_month: s.autoCreateDayOfMonth,
      auto_create_enabled: false,
    },
    shift_types: template.shiftTypes.map((t) => ({
      code: t.code,
      label_ja: t.labelJa,
      label_en: t.labelEn,
      starts_at_local: t.startsAtLocal,
      ends_at_local: t.endsAtLocal,
      break_minutes: t.breakMinutes,
      sort_order: t.sortOrder,
    })),
    operations: {
      manifest_version: manifest.manifestVersion,
      templates: manifest.templates.map((t) => ({
        name: t.name,
        category: t.category,
        due_time: t.dueTime,
        window_end_time: t.windowEndTime,
        recurrence_kind: t.recurrenceKind,
        items: t.items.map((i) => ({
          label: i.label,
          response_type: i.responseType,
          is_critical: i.isCritical,
          is_required: i.isRequired,
          // numeric bounds only on numeric items (operations_checklist_items_numeric_only_chk)
          numeric_min: i.responseType === 'numeric' ? i.numericMin : null,
          numeric_max: i.responseType === 'numeric' ? i.numericMax : null,
          numeric_unit: i.responseType === 'numeric' ? i.numericUnit : null,
        })),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Validator (mirrors core.validate_provisioning_payload, 0133)
// ---------------------------------------------------------------------------

const TOP_KEYS = ['slug', 'business_name', 'location', 'plan', 'package_code', 'template_version',
  'schedule_settings', 'shift_types', 'operations'] as const;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
const SHIFT_CODE = /^[A-Za-z0-9_-]{1,40}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, min: number, max: number): v is string =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const isNullableNumber = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v));

function unknownKeys(obj: Obj, allowed: readonly string[], where: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${where}: unknown key "${key}".`);
  }
}

/**
 * Validate a provisioning payload with the SQL rules. `expectedTemplateVersion`
 * defaults to the code template's version; the SQL side compares against the
 * live core.packages.version. Errors never echo field values (no PII leak).
 */
export function validateProvisioningPayload(
  payload: unknown,
  expectedTemplateVersion: number = CAFE_PACKAGE_TEMPLATE.version,
): ParseResult<ProvisioningPayload> {
  const errors: string[] = [];
  if (!isObj(payload)) return { ok: false, errors: ['payload must be an object.'] };
  unknownKeys(payload, TOP_KEYS, 'payload', errors);

  const slug = validateTenantSlug(payload.slug);
  if (!slug.ok) errors.push(`slug: ${slug.error}`);
  else if (slug.value !== payload.slug) errors.push('slug must be normalized (lowercase, trimmed).');

  if (!isStr(payload.business_name, 1, TENANT_NAME_MAX_LENGTH)) errors.push(`business_name must be 1-${TENANT_NAME_MAX_LENGTH} characters.`);

  const loc = payload.location;
  if (!isObj(loc)) {
    errors.push('location is required.');
  } else {
    unknownKeys(loc, ['name', 'timezone'], 'location', errors);
    if (!isStr(loc.name, 1, LOCATION_NAME_MAX_LENGTH)) errors.push(`location.name must be 1-${LOCATION_NAME_MAX_LENGTH} characters.`);
    if (loc.timezone !== undefined && (typeof loc.timezone !== 'string' || !validateTimezone(loc.timezone).ok)) {
      errors.push('location.timezone unknown.');
    }
  }

  if (payload.plan !== undefined) {
    if (!isObj(payload.plan)) errors.push('plan must be an object.');
    else {
      unknownKeys(payload.plan, ['code', 'trial_days'], 'plan', errors);
      if (payload.plan.code !== undefined && typeof payload.plan.code !== 'string') errors.push('plan.code must be a string.');
      if (payload.plan.trial_days !== undefined && !isInt(payload.plan.trial_days, 1, 90)) errors.push('plan.trial_days must be an integer 1-90.');
    }
  }

  if (typeof payload.package_code !== 'string' || payload.package_code.length === 0) errors.push('package_code is required.');
  if (payload.template_version !== expectedTemplateVersion) errors.push('template_version unknown.');

  if (payload.schedule_settings !== undefined) {
    const s = payload.schedule_settings;
    if (!isObj(s)) errors.push('schedule_settings must be an object.');
    else {
      unknownKeys(s, ['required_headcount_by_weekday', 'max_monthly_hours', 'max_weekly_hours', 'max_days_per_week',
        'auto_create_day_of_month', 'auto_create_enabled'], 'schedule_settings', errors);
      const h = s.required_headcount_by_weekday;
      if (h !== undefined && (!Array.isArray(h) || h.length !== 7 || h.some((n) => !isInt(n, 0, 99)))) {
        errors.push('required_headcount_by_weekday must be 7 integers 0-99.');
      }
      if (s.max_monthly_hours !== undefined && !isInt(s.max_monthly_hours, 0, 744)) errors.push('max_monthly_hours must be an integer 0-744.');
      if (s.max_weekly_hours !== undefined && !isInt(s.max_weekly_hours, 1, 168)) errors.push('max_weekly_hours must be an integer 1-168.');
      if (s.max_days_per_week !== undefined && !isInt(s.max_days_per_week, 1, 7)) errors.push('max_days_per_week must be an integer 1-7.');
      if (s.auto_create_day_of_month !== undefined && !isInt(s.auto_create_day_of_month, 1, 28)) errors.push('auto_create_day_of_month must be an integer 1-28.');
      if (s.auto_create_enabled !== undefined && s.auto_create_enabled !== false) errors.push('auto_create_enabled must be false at provisioning.');
    }
  }

  if (payload.shift_types !== undefined) {
    const list = payload.shift_types;
    if (!Array.isArray(list) || list.length > 20) errors.push('shift_types must be an array of at most 20.');
    else {
      const codes = new Set<string>();
      list.forEach((t: unknown, idx) => {
        const at = `shift_types[${idx}]`;
        if (!isObj(t)) {
          errors.push(`${at} must be an object.`);
          return;
        }
        unknownKeys(t, ['code', 'label_ja', 'label_en', 'starts_at_local', 'ends_at_local', 'break_minutes', 'sort_order'], at, errors);
        if (typeof t.code !== 'string' || !SHIFT_CODE.test(t.code)) errors.push(`${at}.code format.`);
        else if (codes.has(t.code)) errors.push(`${at}.code duplicate.`);
        else codes.add(t.code);
        if (!isStr(t.label_ja, 1, 50)) errors.push(`${at}.label_ja must be 1-50 characters.`);
        if (t.label_en !== undefined && t.label_en !== null && (typeof t.label_en !== 'string' || t.label_en.length > 50)) {
          errors.push(`${at}.label_en must be at most 50 characters.`);
        }
        if (typeof t.starts_at_local !== 'string' || !TIME.test(t.starts_at_local)
          || typeof t.ends_at_local !== 'string' || !TIME.test(t.ends_at_local)
          || t.ends_at_local <= t.starts_at_local) {
          errors.push(`${at} times must be HH:MM with end after start.`);
        }
        if (t.break_minutes !== undefined && !isInt(t.break_minutes, 0, 240)) errors.push(`${at}.break_minutes must be 0-240.`);
        if (t.sort_order !== undefined && !isInt(t.sort_order, 0, 1000)) errors.push(`${at}.sort_order must be 0-1000.`);
      });
    }
  }

  if (payload.operations !== undefined) {
    const ops = payload.operations;
    if (!isObj(ops)) errors.push('operations must be an object.');
    else {
      unknownKeys(ops, ['manifest_version', 'templates'], 'operations', errors);
      if (!isInt(ops.manifest_version, 1, Number.MAX_SAFE_INTEGER)) errors.push('operations.manifest_version is required.');
      if (!Array.isArray(ops.templates) || ops.templates.length > 30) errors.push('operations.templates must be an array of at most 30.');
      else {
        ops.templates.forEach((t: unknown, ti) => {
          const at = `operations.templates[${ti}]`;
          if (!isObj(t)) {
            errors.push(`${at} must be an object.`);
            return;
          }
          unknownKeys(t, ['name', 'category', 'due_time', 'window_end_time', 'recurrence_kind', 'weekdays', 'items'], at, errors);
          if (!isStr(t.name, 1, 200)) errors.push(`${at}.name must be 1-200 characters.`);
          if (t.category !== undefined && t.category !== null && (typeof t.category !== 'string' || t.category.length > 100)) {
            errors.push(`${at}.category must be at most 100 characters.`);
          }
          if (typeof t.due_time !== 'string' || !TIME.test(t.due_time)) errors.push(`${at}.due_time must be HH:MM.`);
          if (t.window_end_time !== undefined && t.window_end_time !== null
            && (typeof t.window_end_time !== 'string' || !TIME.test(t.window_end_time))) {
            errors.push(`${at}.window_end_time must be HH:MM.`);
          }
          if (t.recurrence_kind !== 'daily' && t.recurrence_kind !== 'weekdays') errors.push(`${at}.recurrence_kind must be daily or weekdays.`);
          if (t.recurrence_kind === 'weekdays'
            && (!Array.isArray(t.weekdays) || t.weekdays.length < 1 || t.weekdays.length > 7 || t.weekdays.some((d) => !isInt(d, 1, 7)))) {
            errors.push(`${at}.weekdays must be ISO 1-7.`);
          }
          if (t.recurrence_kind === 'daily' && t.weekdays !== undefined && t.weekdays !== null) errors.push(`${at}: daily takes no weekdays.`);
          if (!Array.isArray(t.items) || t.items.length < 1 || t.items.length > 50) errors.push(`${at}.items must be 1-50.`);
          else {
            t.items.forEach((i: unknown, ii) => {
              const iat = `${at}.items[${ii}]`;
              if (!isObj(i)) {
                errors.push(`${iat} must be an object.`);
                return;
              }
              unknownKeys(i, ['label', 'response_type', 'is_critical', 'is_required', 'numeric_min', 'numeric_max', 'numeric_unit'], iat, errors);
              if (!isStr(i.label, 1, 500)) errors.push(`${iat}.label must be 1-500 characters.`);
              if (i.response_type !== 'boolean' && i.response_type !== 'numeric' && i.response_type !== 'text') errors.push(`${iat}.response_type.`);
              if (typeof i.is_critical !== 'boolean' || typeof i.is_required !== 'boolean') errors.push(`${iat}.is_critical / is_required must be booleans.`);
              if (!isNullableNumber(i.numeric_min) || !isNullableNumber(i.numeric_max)) errors.push(`${iat} numeric bounds must be numbers or null.`);
              if (i.numeric_unit !== undefined && i.numeric_unit !== null && (typeof i.numeric_unit !== 'string' || i.numeric_unit.length > 20)) {
                errors.push(`${iat}.numeric_unit must be at most 20 characters.`);
              }
              // Same rules the table constraints enforce (checked early for a clear error).
              const hasBounds = (i.numeric_min ?? null) !== null || (i.numeric_max ?? null) !== null || (i.numeric_unit ?? null) !== null;
              if (i.response_type !== 'numeric' && hasBounds) errors.push(`${iat}: numeric bounds only on numeric items.`);
              if (typeof i.numeric_min === 'number' && typeof i.numeric_max === 'number' && i.numeric_min > i.numeric_max) {
                errors.push(`${iat}: numeric_min must not exceed numeric_max.`);
              }
            });
          }
        });
      }
    }
  }

  return errors.length === 0 ? { ok: true, value: payload as unknown as ProvisioningPayload } : { ok: false, errors };
}
