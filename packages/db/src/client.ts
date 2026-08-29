import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@line-os/config/env';

/**
 * Supabase client factories.
 *
 * SECURITY:
 * - `createServiceClient()` uses the privileged Supabase key
 *   (`serverEnv().supabasePrivilegedKey` — an `sb_secret_*` value when
 *   `SUPABASE_SECRET_KEY` is set, otherwise the legacy service_role JWT during
 *   the transition) and BYPASSES RLS. It must ONLY be used in trusted server
 *   contexts (apps/api, apps/worker, seeds). Never import this into the web
 *   client bundle.
 * - `createUserClient(accessToken)` acts as the end user; RLS applies. Use this
 *   for request-scoped access so tenant isolation is enforced by the database.
 */

export function createServiceClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.supabasePrivilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(accessToken: string): SupabaseClient {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
