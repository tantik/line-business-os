import { parsePublicEnv } from '@line-os/config/env/public';

/**
 * Browser-safe Supabase public configuration for apps/web.
 *
 * SECURITY:
 * - Reads ONLY `NEXT_PUBLIC_*` values. These are the sole Supabase values
 *   allowed to reach the browser bundle (publishable/anon key + URL + RLS).
 * - The service-role / secret key is server-only and is never read here.
 *   Bundling it into the web app is forbidden (see ADR 0005 + AGENTS.md).
 *
 * LOW-PRIVILEGE KEY (transition — docs/operations/supabase-secret-key-migration-runbook.md):
 * prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (current `sb_publishable_*`
 * model), falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy `anon` JWT)
 * during the migration, and fails closed if neither is set. The precedence
 * itself lives once in `@line-os/config/env/public`; this module only feeds it
 * the raw `process.env` values and exposes the result.
 *
 * The `process.env.NEXT_PUBLIC_*` references are written as direct member
 * accesses so Next.js can statically inline them into the client bundle.
 */
export interface PublicSupabaseConfig {
  url: string;
  /** The resolved low-privilege API key (publishable-preferred, anon fallback). */
  key: string;
  /** Which source `key` came from — non-secret, safe to surface in diagnostics. */
  keySource: 'publishable' | 'legacy_anon';
}

export type ReadPublicSupabaseEnvResult =
  | { ok: true; config: PublicSupabaseConfig }
  | { ok: false; missing: string[] };

/** Non-throwing read; use to render a "missing configuration" state. */
export function readPublicSupabaseEnv(): ReadPublicSupabaseEnvResult {
  const parsed = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) return { ok: false, missing: parsed.missing };
  return {
    ok: true,
    config: {
      url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      key: parsed.data.supabasePublishableKey,
      keySource: parsed.data.supabasePublishableKeySource,
    },
  };
}

/**
 * Throwing read for client construction paths that cannot proceed without
 * config. The error names the missing variables only — never their values.
 */
export function requirePublicSupabaseEnv(): PublicSupabaseConfig {
  const result = readPublicSupabaseEnv();
  if (!result.ok) {
    throw new Error(
      `Missing required Supabase public env: ${result.missing.join(', ')}. ` +
        'Set NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
        '(preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY (temporary fallback) — see .env.example.',
    );
  }
  return result.config;
}
