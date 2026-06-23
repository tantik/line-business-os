import { createBrowserClient } from '@supabase/ssr';
import { requirePublicSupabaseEnv } from './env';

/**
 * Browser Supabase client (anon/publishable key + RLS only).
 *
 * Uses `@supabase/ssr` so the session is stored in cookies and stays in sync
 * with the server client + middleware. The service-role key must never be
 * referenced anywhere under apps/web.
 */
export function createClient() {
  const { url, anonKey } = requirePublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
