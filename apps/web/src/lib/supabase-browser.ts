import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client. Uses ONLY the anon key + RLS. The service_role key
 * must never be referenced in any file under apps/web.
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey);
}
