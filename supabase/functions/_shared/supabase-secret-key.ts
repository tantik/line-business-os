// ============================================================================
// _shared/supabase-secret-key.ts — privileged Supabase key resolver for the
// hosted Edge Functions (invite-employee, liff-entry).
// ----------------------------------------------------------------------------
// Phase 9 of the legacy-service_role → current-secret-key migration
// (docs/operations/supabase-secret-key-migration-runbook.md). Cloud DEV's
// legacy JWT-based `anon`/`service_role` API keys are DISABLED.
//
// Supabase's current model injects `SUPABASE_SECRET_KEYS` into a hosted Edge
// Function as a JSON object mapping key names -> `sb_secret_*` values, with a
// `"default"` entry. This resolver:
//   1. reads `SUPABASE_SECRET_KEYS` and parses it as JSON, safely;
//   2. REQUIRES a non-empty string `"default"` entry;
//   3. fails closed with a value-free `SupabaseSecretKeyConfigError` otherwise
//      — there is no legacy `SUPABASE_SERVICE_ROLE_KEY` fallback anymore;
//   4. never logs, echoes, or embeds the secret in an error message.
//
// Local `supabase functions serve` does NOT inject `SUPABASE_SECRET_KEYS`; set
// it in `supabase/functions/.env` to exercise these functions locally
// (see `supabase/functions/.env.example`).
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports — the caller passes a
// plain `{ SUPABASE_SECRET_KEYS? }` snapshot, so this file is unit-testable
// under Node/tsx as well as Deno.
// ============================================================================

export interface SupabaseSecretKeySource {
  SUPABASE_SECRET_KEYS?: string | undefined;
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
export type SupabaseSecretKeySourceKind = 'secret_keys_default';

export interface ResolvedSupabaseSecretKey {
  key: string;
  source: SupabaseSecretKeySourceKind;
}

/**
 * Resolve the privileged Supabase key for a hosted Edge Function from
 * `SUPABASE_SECRET_KEYS["default"]`; throws `SupabaseSecretKeyConfigError` if it
 * is missing, malformed, or empty.
 */
export function resolveSupabaseSecretKey(
  source: SupabaseSecretKeySource,
): ResolvedSupabaseSecretKey {
  const raw = source.SUPABASE_SECRET_KEYS;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new SupabaseSecretKeyConfigError(
      'No privileged Supabase key: set SUPABASE_SECRET_KEYS (a JSON object with a non-empty "default")',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SupabaseSecretKeyConfigError('SUPABASE_SECRET_KEYS is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SupabaseSecretKeyConfigError('SUPABASE_SECRET_KEYS must be a JSON object');
  }
  const def = (parsed as Record<string, unknown>)['default'];
  if (typeof def !== 'string' || def.length === 0) {
    throw new SupabaseSecretKeyConfigError('SUPABASE_SECRET_KEYS is missing a non-empty "default" entry');
  }
  return { key: def, source: 'secret_keys_default' };
}
