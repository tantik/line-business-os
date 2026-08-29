// ============================================================================
// _shared/supabase-secret-key.ts — privileged Supabase key resolver for the
// hosted Edge Functions (liff-entry, invite-employee).
// ----------------------------------------------------------------------------
// Phase 1 of the legacy-service_role → current-secret-key migration
// (docs/operations/supabase-secret-key-migration-runbook.md).
//
// Supabase's current model injects `SUPABASE_SECRET_KEYS` into a hosted Edge
// Function as a JSON object mapping key names -> `sb_secret_*` values, with a
// `"default"` entry. The legacy `SUPABASE_SERVICE_ROLE_KEY` (a JWT) is still
// injected during the transition. This resolver:
//   1. reads `SUPABASE_SECRET_KEYS` and parses it as JSON, safely;
//   2. uses the string `"default"` entry if present and non-empty;
//   3. otherwise TEMPORARILY falls back to `SUPABASE_SERVICE_ROLE_KEY`;
//   4. fails closed with a value-free `SupabaseSecretKeyConfigError` if neither
//      source yields a usable key;
//   5. never logs, echoes, or embeds the secret in an error message.
//
// A `SUPABASE_SECRET_KEYS` object that is present but has no usable string
// `"default"` entry is treated as "no new key available yet" — the resolver
// falls through to the legacy key rather than guessing which non-default entry
// to use. This keeps a partially-configured function working during rollout
// and is removed together with the legacy fallback in a later PR.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports — the caller passes a
// plain `{ SUPABASE_SECRET_KEYS?, SUPABASE_SERVICE_ROLE_KEY? }` snapshot, so
// this file is unit-testable under Node/tsx as well as Deno.
// ============================================================================

export interface SupabaseSecretKeySource {
  SUPABASE_SECRET_KEYS?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
}

/** Thrown when no privileged Supabase key can be resolved. Carries a
 *  configuration description only — never a secret value. */
export class SupabaseSecretKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseSecretKeyConfigError';
  }
}

/** Which source the resolved key came from — for non-secret diagnostics/logging. */
export type SupabaseSecretKeySourceKind = 'secret_keys_default' | 'legacy_service_role';

export interface ResolvedSupabaseSecretKey {
  key: string;
  source: SupabaseSecretKeySourceKind;
}

/**
 * Resolve the privileged Supabase key for a hosted Edge Function.
 * Prefers `SUPABASE_SECRET_KEYS["default"]`; falls back to
 * `SUPABASE_SERVICE_ROLE_KEY` during the transition; throws
 * `SupabaseSecretKeyConfigError` if neither is usable.
 */
export function resolveSupabaseSecretKey(
  source: SupabaseSecretKeySource,
): ResolvedSupabaseSecretKey {
  const raw = source.SUPABASE_SECRET_KEYS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SupabaseSecretKeyConfigError('SUPABASE_SECRET_KEYS is not valid JSON');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SupabaseSecretKeyConfigError('SUPABASE_SECRET_KEYS must be a JSON object');
    }
    const dict = parsed as Record<string, unknown>;
    const def = dict['default'];
    if (typeof def === 'string' && def.length > 0) {
      return { key: def, source: 'secret_keys_default' };
    }
    // Object present but no usable string "default" -> fall through to legacy.
  }

  const legacy = source.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return { key: legacy, source: 'legacy_service_role' };
  }

  throw new SupabaseSecretKeyConfigError(
    'No privileged Supabase key: set SUPABASE_SECRET_KEYS (a JSON object with a non-empty "default") or the legacy SUPABASE_SERVICE_ROLE_KEY',
  );
}
