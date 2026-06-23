import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { readPublicSupabaseEnv } from './env';

/**
 * Refresh the Supabase auth session on every request and keep the cookies in
 * sync between the browser and server clients. Call this from the Next.js
 * middleware.
 *
 * If the public Supabase env is missing we do NOT crash the whole app — we pass
 * the request through unchanged. Protected routes still fail closed because the
 * server client / auth helpers will report no authenticated user.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = readPublicSupabaseEnv();
  if (!env.ok) return response;

  const supabase = createServerClient(env.config.url, env.config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touch the user so an expired token is refreshed and re-persisted via the
  // cookie setters above. Do not run logic between client creation and this
  // call (per Supabase SSR guidance).
  await supabase.auth.getUser();

  return response;
}
