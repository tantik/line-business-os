import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { requirePublicSupabaseEnv } from './env';

/**
 * Request-scoped server Supabase client (anon/publishable key + RLS only).
 *
 * Reads/writes the auth session via Next.js cookies so server components, route
 * handlers, and server actions all observe the same authenticated session. RLS
 * remains the security boundary; this client never uses the service-role key.
 *
 * In a React Server Component the cookie store is read-only, so `setAll` may
 * throw — that is expected and safe to ignore because the middleware
 * (`updateSession`) is responsible for refreshing/persisting the session.
 */
export async function createClient() {
  const { url, key } = requirePublicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are immutable.
          // Session refresh is handled by the middleware instead.
        }
      },
    },
  });
}
