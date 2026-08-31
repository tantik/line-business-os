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
// Supabase's current model injects `SUPABASE_PUBLISHABLE_KEYS` into a hosted
// Edge Function as a JSON object mapping key names -> publishable key values,
// with a `"default"` entry (same shape as `SUPABASE_SECRET_KEYS`; access via
// `JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')!)['default']`). The
// legacy `SUPABASE_ANON_KEY` (a JWT) is still injected during the transition.
// This resolver:
//   1. reads `SUPABASE_PUBLISHABLE_KEYS` and parses it as JSON, safely;
//   2. uses the string `"default"` entry if present and non-empty;
//   3. otherwise TEMPORARILY falls back to `SUPABASE_ANON_KEY`;
//   4. fails closed with a value-free `SupabasePublishableKeyConfigError` if
//      neither source yields a usable key;
//   5. never logs, echoes, or embeds the key in an error message.
//
// A `SUPABASE_PUBLISHABLE_KEYS` object that is present but has no usable string
// `"default"` entry falls through to the legacy key rather than guessing which
// non-default entry to use. Malformed JSON, or a JSON value that is not an
// object, is a hard value-free error (predictable, reviewable) — not a silent
// fallthrough — matching `supabase-secret-key.ts`.
//
// PURE MODULE: no `Deno.*`, no `npm:`/`jsr:` imports — the caller passes a
// plain `{ SUPABASE_PUBLISHABLE_KEYS?, SUPABASE_ANON_KEY? }` snapshot, so this
// file is unit-testable under Node/tsx as well as Deno.
// ============================================================================

export interface SupabasePublishableKeySource {
  SUPABASE_PUBLISHABLE_KEYS?: string | undefined;
  SUPABASE_ANON_KEY?: string | undefined;
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
export type SupabasePublishableKeySourceKind = 'publishable_keys_default' | 'legacy_anon';

export interface ResolvedSupabasePublishableKey {
  key: string;
  source: SupabasePublishableKeySourceKind;
}

/**
 * Resolve the user-scoped Supabase API key for a hosted Edge Function.
 * Prefers `SUPABASE_PUBLISHABLE_KEYS["default"]`; falls back to
 * `SUPABASE_ANON_KEY` during the transition; throws
 * `SupabasePublishableKeyConfigError` if neither is usable.
 */
export function resolveSupabasePublishableKey(
  source: SupabasePublishableKeySource,
): ResolvedSupabasePublishableKey {
  const raw = source.SUPABASE_PUBLISHABLE_KEYS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SupabasePublishableKeyConfigError('SUPABASE_PUBLISHABLE_KEYS is not valid JSON');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SupabasePublishableKeyConfigError('SUPABASE_PUBLISHABLE_KEYS must be a JSON object');
    }
    const dict = parsed as Record<string, unknown>;
    const def = dict['default'];
    if (typeof def === 'string' && def.length > 0) {
      return { key: def, source: 'publishable_keys_default' };
    }
    // Object present but no usable string "default" -> fall through to legacy.
  }

  const legacy = source.SUPABASE_ANON_KEY;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return { key: legacy, source: 'legacy_anon' };
  }

  throw new SupabasePublishableKeyConfigError(
    'No Supabase publishable key: set SUPABASE_PUBLISHABLE_KEYS (a JSON object with a non-empty "default") or the legacy SUPABASE_ANON_KEY',
  );
}
