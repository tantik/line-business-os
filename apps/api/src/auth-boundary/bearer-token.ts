/**
 * Pure, framework-agnostic `Authorization: Bearer <token>` header parsing.
 *
 * Per RFC 6750 the scheme token is case-sensitive ("Bearer"); a header that
 * doesn't match that exact shape is treated the same as a missing header -
 * both collapse to 401 upstream, since distinguishing "missing" from
 * "malformed" leaks nothing useful to the caller.
 */
const BEARER_PREFIX = 'Bearer ';

/**
 * Extracts the raw access token from an Authorization header value, or
 * `null` if the header is missing, empty, or not of the form `Bearer <token>`.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (token.length === 0) return null;

  return token;
}
