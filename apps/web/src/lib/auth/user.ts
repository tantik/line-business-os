import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Framework-agnostic auth helper. Resolves the authenticated user from a
 * Supabase client using `auth.getUser()` (which validates the token with the
 * Auth server rather than trusting an unverified cookie).
 *
 * Kept free of any Next.js imports so it is unit-testable with a stubbed client.
 * Returns `null` instead of throwing for the "no authenticated user" case.
 */
export async function getUserFromClient(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
