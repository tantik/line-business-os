import { requirePublicSupabaseEnv } from '@/lib/supabase/env';

/**
 * Calls the `liff-entry` Edge Function with a verified LINE ID token and
 * returns the single-use magic-link `tokenHash` it hands back on success.
 * Same fetch-with-`apikey`-header shape as
 * `apps/web/src/lib/workforce/invitations.ts`'s call to `invite-employee`,
 * except no `Authorization: Bearer` is sent -- there is no session yet at
 * this point in the flow, which is exactly why `liff-entry` is configured
 * with `verify_jwt = false` (it performs its own strong verification of the
 * LINE ID token instead of relying on the platform's generic Supabase-JWT
 * gate). Runs client-side (the LIFF entry page), so this only ever sends the
 * public low-privilege key (publishable or legacy anon), never a secret.
 */
export type LiffEntryOutcome =
  | { status: 'success'; tokenHash: string; type: 'magiclink' }
  | { status: 'error'; code: string };

export async function exchangeLiffIdToken(idToken: string): Promise<LiffEntryOutcome> {
  const { url, key } = requirePublicSupabaseEnv();
  const endpoint = `${url.replace(/\/$/, '')}/functions/v1/liff-entry`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    return { status: 'error', code: 'network_error' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: 'error', code: 'invalid_response' };
  }

  if (!response.ok) {
    const code = typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : 'unknown_error';
    return { status: 'error', code };
  }

  const tokenHash = (body as { tokenHash?: unknown }).tokenHash;
  const type = (body as { type?: unknown }).type;
  if (typeof tokenHash !== 'string' || type !== 'magiclink') {
    return { status: 'error', code: 'invalid_response' };
  }

  return { status: 'success', tokenHash, type: 'magiclink' };
}
