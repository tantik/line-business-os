import { PREVIEW_BASE_PATH } from './constants';

/**
 * Duplicated from `@/lib/auth/require-user`'s `SIGN_IN_PATH` rather than
 * imported - `require-user.ts` pulls in the `server-only` sentinel package
 * (no Next.js webpack shim under the plain `node:test` runner this repo
 * uses), and this module must stay importable from pure unit tests. Must be
 * kept in sync with `SIGN_IN_PATH` (`/sign-in`) if that ever changes.
 */
const SIGN_IN_PATH = '/sign-in';

/**
 * Allowlist for the sign-in `returnTo` contract (architecture plan Section
 * I). Only the fixed set of Mame To Cha preview public paths are accepted:
 *
 *   /mame-to-cha
 *   /mame-to-cha/manager
 *   /mame-to-cha/staff
 *   /mame-to-cha/recipes
 *   /mame-to-cha/recipes/<segment>
 *
 * Anything else - absolute URLs, protocol-relative `//host`, backslash
 * variants, encoded bypasses, unrelated internal paths, or the internal
 * `/_client-preview/*` route - is rejected outright. No traversal segments,
 * no query string, no fragment.
 */
const PREVIEW_RETURN_TO_PATTERN = /^\/mame-to-cha(?:\/(?:manager|staff|recipes(?:\/[a-zA-Z0-9-]{1,128})?))?$/;

/**
 * Validate an untrusted `returnTo` candidate. Returns the exact allowlisted
 * path on success, or `null` on any rejection - callers must fall back to the
 * existing hardcoded `/dashboard` default, never to the raw input.
 *
 * Pure, no I/O - safe to unit test exhaustively.
 */
export function sanitizePreviewReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Reject anything containing a backslash outright (backslash-variant bypasses,
  // e.g. `/\evil.com`, before any other check runs).
  if (raw.includes('\\')) return null;
  // Reject protocol-relative (`//host/...`) before the single-leading-slash check,
  // since `//` also starts with `/`.
  if (raw.startsWith('//')) return null;
  // Must be a bare relative path starting with exactly one `/` - reject absolute
  // URLs (`https://...`), scheme-relative values, and anything not starting with `/`.
  if (!raw.startsWith('/')) return null;
  // Reject any value that decodes to something outside the allowlist pattern
  // (covers encoded bypasses like `%2F%2Fevil.com` or `%5C`).
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded !== raw) {
    // If decoding changed the value, re-run the same backslash/protocol-relative
    // checks against the decoded form before allowlist matching.
    if (decoded.includes('\\') || decoded.startsWith('//') || !decoded.startsWith('/')) return null;
  }
  if (!PREVIEW_RETURN_TO_PATTERN.test(decoded)) return null;
  return decoded;
}

/** Build the sign-in redirect target carrying a validated, statically-known preview `returnTo`. */
export function buildPreviewSignInRedirect(publicPath: string): string {
  return `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(publicPath)}`;
}

/**
 * Build the sign-in-with-error redirect target for a failed sign-in attempt
 * (credential parse failure or `signInWithPassword` failure), carrying a
 * validated `returnTo` when present so a preview visitor who mistypes their
 * password does not lose their way back after retrying. Uses
 * `URLSearchParams` (never string concatenation) so the value is correctly
 * query-encoded; `safeReturnTo` must already be the output of
 * `sanitizePreviewReturnTo` (or `null`) - an invalid/missing value is simply
 * omitted, never propagated raw. The generic `error=1` flag carries no
 * detail either way (no account enumeration).
 */
export function buildSignInErrorPath(safeReturnTo: string | null): string {
  const params = new URLSearchParams({ error: '1' });
  if (safeReturnTo) params.set('returnTo', safeReturnTo);
  return `${SIGN_IN_PATH}?${params.toString()}`;
}

/** Re-exported for callers that only need the base path constant. */
export { PREVIEW_BASE_PATH };
