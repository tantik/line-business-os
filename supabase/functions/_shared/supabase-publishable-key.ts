// ============================================================================
// _shared/supabase-publishable-key.ts — user-scoped Supabase API key resolver
// for the hosted Edge Functions (invite-employee).
// ----------------------------------------------------------------------------
// Companion to `_shared/supabase-secret-key.ts`. That file resolves the
// PRIVILEGED key (Auth Admin API); this one resolves the API key for the
// USER-SCOPED client — the app-level key that carries the caller's own JWT in
// the Authorization header, so RLS and permission checks apply unchanged. It
// is NOT a privileged key and never bypasses RLS.
//
// Phase 9 of the legacy-key migration
// (docs/operations/supabase-secret-key-migration-runbook.md). Cloud DEV's
// legacy JWT-based `anon` API key is DISABLED.
//
// Supabase's current model injects `SUPABASE_PUBLISHABLE_KEYS` into a hosted
// Edge Function as a JSON object mapping key names -> publishable key values,
// with a `"default"` entry (same shape as `SUPABASE_SECRET_KEYS`). This
// resolver:
//   1. reads `SUPABASE_PUBLISHABLE_KEYS` and parses it as JSON, safely;
//   2. REQUIRES a non-empty string `"default"` entry;
//   3. fails closed with a value-free `SupabasePublishableKeyConfigError`
//      otherwise — there is no legacy `SUPABASE_ANON_KEY` fallback anymore;
//   4. never logs, echoes, or embeds the key in an error message.
//
// Local `supabase functions serve` does NOT inject `SUPABASE_PUBLISHABLE_KEYS`;
// set it in `supabase/functions/.env` to exercise this locally
// (see `supabase/functions/.env.example`).
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports — the caller passes a
// plain `{ SUPABASE_PUBLISHABLE_KEYS? }` snapshot, so this file is
// unit-testable under Node/tsx as well as Deno.
// ============================================================================

export interface SupabasePublishableKeySource {
  SUPABASE_PUBLISHABLE_KEYS?: string | undefined;
}

/** Thrown when no usable Supabase publishable key can be resolved. Carries a
 *  configuration description only — never a key value. */
export class SupabasePublishableKeyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabasePublishableKeyConfigError';
  }
}

/** Which source the resolved key came from — for non-secret diagnostics/logging. */
export type SupabasePublishableKeySourceKind = 'publishable_keys_default';

export interface ResolvedSupabasePublishableKey {
  key: string;
  source: SupabasePublishableKeySourceKind;
}

/**
 * Resolve the user-scoped Supabase API key for a hosted Edge Function from
 * `SUPABASE_PUBLISHABLE_KEYS["default"]`; throws
 * `SupabasePublishableKeyConfigError` if it is missing, malformed, or empty.
 */
export function resolveSupabasePublishableKey(
  source: SupabasePublishableKeySource,
): ResolvedSupabasePublishableKey {
  const raw = source.SUPABASE_PUBLISHABLE_KEYS;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new SupabasePublishableKeyConfigError(
      'No Supabase publishable key: set SUPABASE_PUBLISHABLE_KEYS (a JSON object with a non-empty "default")',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SupabasePublishableKeyConfigError('SUPABASE_PUBLISHABLE_KEYS is not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SupabasePublishableKeyConfigError('SUPABASE_PUBLISHABLE_KEYS must be a JSON object');
  }
  const def = (parsed as Record<string, unknown>)['default'];
  if (typeof def !== 'string' || def.length === 0) {
    throw new SupabasePublishableKeyConfigError(
      'SUPABASE_PUBLISHABLE_KEYS is missing a non-empty "default" entry',
    );
  }
  return { key: def, source: 'publishable_keys_default' };
}
