import 'server-only';
import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Self-service password reset (DEBT-088).
 *
 * The emailed link reuses the existing `/auth/accept-invite` callback path
 * (already on the Supabase redirect allow-list) with `?flow=reset` and no
 * `invitation_id`; the Reset password email template appends
 * `&token_hash=…&type=recovery` to `{{ .RedirectTo }}`
 * (docs/operations/supabase-invite-email-template-ja.md §2).
 */
export const PASSWORD_RESET_CALLBACK_PATH = '/auth/accept-invite?flow=reset';
export const RESET_PASSWORD_PATH = '/auth/reset-password';
export const LINK_INVALID_PATH = '/auth/link-invalid';
export { MIN_PASSWORD_LENGTH } from './password-rules';

/** A recovery sign-in only authorizes a password change for this long. */
const RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * Set ONLY by the self-service reset callback after `verifyOtp(recovery)`,
 * holding that user's id. The `amr` claim alone cannot tell a recovery link
 * from the LINE (LIFF) magic-link sign-in -- both may report `otp` -- so the
 * new-password screen requires this marker too (security review 2026-10-11).
 */
export const RESET_MARKER_COOKIE = 'oruwa_pw_reset';
export const RESET_MARKER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: RECOVERY_WINDOW_SECONDS,
};

/** Called after a successful reset so the marker cannot be reused. */
export async function clearResetMarker(): Promise<void> {
  const store = await cookies();
  store.delete(RESET_MARKER_COOKIE);
}

/**
 * Absolute callback URL for the reset email, built from the request host.
 * A forged Host header cannot redirect the email elsewhere: Supabase only
 * honours `redirectTo` values on its allow-list (otherwise it falls back to
 * the project Site URL).
 */
export async function passwordResetRedirectUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}${PASSWORD_RESET_CALLBACK_PATH}`;
}

/** Deliberately loose: Supabase validates the address itself; this only catches obvious typos. */
export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True only when the caller's CURRENT session was created by a password-
 * recovery link within the last 15 minutes AND this browser went through the
 * self-service reset callback for the same user (RESET_MARKER_COOKIE). An
 * ordinary password sign-in, a LINE magic-link sign-in, or a stolen
 * long-lived session cannot reach the "set a new password without the old
 * one" screen.
 *
 * The access token is first validated with the Auth server (`getUser(jwt)`),
 * so reading its `amr` claim afterwards is trustworthy.
 */
export async function hasRecentRecoverySession(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  const { data, error } = await supabase.auth.getUser(session.access_token);
  if (error || !data.user) return false;

  const marker = (await cookies()).get(RESET_MARKER_COOKIE)?.value;
  if (!marker || marker !== data.user.id) return false;

  const payload = decodeJwtPayload(session.access_token);
  const amr = Array.isArray(payload?.amr) ? (payload.amr as Array<{ method?: unknown; timestamp?: unknown }>) : [];
  const now = Math.floor(Date.now() / 1000);
  return amr.some(
    (entry) =>
      (entry.method === 'recovery' || entry.method === 'otp') &&
      typeof entry.timestamp === 'number' &&
      now - entry.timestamp >= -60 && // tolerate small clock skew with the Auth server

      now - entry.timestamp <= RECOVERY_WINDOW_SECONDS,
  );
}
