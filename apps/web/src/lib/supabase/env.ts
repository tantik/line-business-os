import { parsePublicEnv } from '@line-os/config/env/public';

/**
 * Browser-safe Supabase public configuration for apps/web.
 *
 * SECURITY:
 * - Reads ONLY `NEXT_PUBLIC_*` values. These are the sole Supabase values
 *   allowed to reach the browser bundle (anon/publishable key + URL + RLS).
 * - The service-role key is server-only and is never read here. Bundling it
 *   into the web app is forbidden (see ADR 0005 + AGENTS.md).
 *
 * The two `process.env.NEXT_PUBLIC_*` references are written as direct member
 * accesses so Next.js can statically inline them into the client bundle.
 */
export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

export type ReadPublicSupabaseEnvResult =
  | { ok: true; config: PublicSupabaseConfig }
  | { ok: false; missing: string[] };

/** Non-throwing read; use to render a "missing configuration" state. */
export function readPublicSupabaseEnv(): ReadPublicSupabaseEnvResult {
  const parsed = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) return { ok: false, missing: parsed.missing };
  return {
    ok: true,
    config: {
      url: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
        'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    );
  }
  return result.config;
}
