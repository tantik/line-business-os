import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getCurrentUser } from './session';

/** Where unauthenticated users are sent. Foundation placeholder route. */
export const SIGN_IN_PATH = '/sign-in';

/**
 * Require an authenticated user in a server component / layout / route handler.
 * Redirects unauthenticated requests to the sign-in route instead of leaking an
 * error. Returns the validated user when present.
 */
export async function requireUser(redirectTo: string = SIGN_IN_PATH): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo);
  return user;
}
