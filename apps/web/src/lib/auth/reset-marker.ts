import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed proof that THIS session came out of the self-service reset callback.
 *
 * Supabase reports a recovery-link sign-in as `amr: otp` -- the same as the
 * LINE (LIFF) magic-link sign-in (verified on Cloud DEV 2026-10-11) -- so the
 * session alone cannot authorize "new password without the old one". The
 * marker binds user id + Supabase session id + expiry under an HMAC key that
 * only the server holds; a stolen LIFF session has a different session id
 * and cannot mint one. Pure functions (secret passed in) for unit tests.
 */
const MARKER_VERSION = 'v1';

function signingKey(secret: string): Buffer {
  // Domain separation: never use the shared secret directly for this purpose.
  return createHmac('sha256', secret).update('oruwa:password-reset-marker:v1').digest();
}

function mac(secret: string, body: string): string {
  return createHmac('sha256', signingKey(secret)).update(body).digest('base64url');
}

export function createResetMarker(secret: string, userId: string, sessionId: string, expiresAt: number): string {
  const body = `${MARKER_VERSION}.${userId}.${sessionId}.${expiresAt}`;
  return `${body}.${mac(secret, body)}`;
}

export function verifyResetMarker(
  secret: string,
  marker: string,
  expected: { userId: string; sessionId: string; now: number },
): boolean {
  const parts = marker.split('.');
  if (parts.length !== 5) return false;
  const [version, userId, sessionId, expiresRaw, signature] = parts as [string, string, string, string, string];
  if (version !== MARKER_VERSION) return false;
  const body = `${version}.${userId}.${sessionId}.${expiresRaw}`;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  const expiresAt = Number(expiresRaw);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt >= expected.now &&
    userId === expected.userId &&
    sessionId === expected.sessionId
  );
}
