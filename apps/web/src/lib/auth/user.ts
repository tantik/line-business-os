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

/**
 * Resolves the authenticated user's id from a cryptographically verified JWT
 * (`auth.getClaims()`, DEBT-124). With the project's asymmetric signing keys
 * (ES256) the signature is checked locally against the cached JWKS -- no Auth
 * server round trip per request; with a symmetric key supabase-js falls back
 * to a network `getUser()` itself, so this never trusts an unverified cookie.
 *
 * Trade-off vs `getUserFromClient`: a token stays valid until it expires
 * (<= 1 h) even if the user was signed out elsewhere or deleted. Use this for
 * page rendering, where RLS is the data boundary anyway; keep
 * `getUserFromClient` where revocation must be seen at once (account
 * settings, platform admin console, sign-in redirects).
 */
export async function getVerifiedUserId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || typeof sub !== 'string' || sub.length === 0) return null;
    return sub;
  } catch {
    return null;
  }
}
