import 'server-only';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getUserFromClient } from './user';

/**
 * Server-side auth/session baseline. These helpers are the single place pages,
 * layouts, and route handlers should use to read the current user/session — so
 * auth access is centralized, not re-derived per route.
 */

/** Returns the authenticated, server-validated user, or `null`. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  return getUserFromClient(supabase);
}

/**
 * Returns the current session, or `null`. Prefer `getCurrentUser()` for
 * authorization decisions: it validates the token with the Auth server, whereas
 * the session object reflects local cookie state.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}
