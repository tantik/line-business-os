import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@line-os/config/env';

/**
 * Supabase client factories.
 *
 * SECURITY:
 * - `createServiceClient()` uses the privileged Supabase key
 *   (`serverEnv().supabasePrivilegedKey` — the required `SUPABASE_SECRET_KEY`,
 *   an `sb_secret_*` value) and BYPASSES RLS. It must ONLY be used in trusted
 *   server contexts (apps/api, apps/worker, seeds). Never import this into the
 *   web client bundle.
 * - `createUserClient(accessToken)` acts as the end user; RLS applies. Use this
 *   for request-scoped access so tenant isolation is enforced by the database.
 *   Its API key is the LOW-PRIVILEGE key from `serverEnv().supabaseUserKey`
 *   (the required `SUPABASE_PUBLISHABLE_KEY`, an `sb_publishable_*` value),
 *   sent ALONGSIDE the caller's `accessToken`, which remains the identity/auth
 *   context — it never uses a privileged / RLS-bypassing key.
 */

export function createServiceClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.supabasePrivilegedKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(accessToken: string): SupabaseClient {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.supabaseUserKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
