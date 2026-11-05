/**
 * Where the store switcher sends the user back to (DEBT-139 L2). Only the
 * path of a known workspace page is kept -- no host, no `//`, no query (a
 * `?popup=` of the old store would show the new store's popup anyway, but a
 * query may also carry ids of the old store). Anything else -> `/dashboard`.
 */
const WORKSPACE_PATH_RE =
  /^\/(manager|staff|dashboard|inventory|purchases|recipes|operations|issues|weekly-review)(\/[a-z0-9-]+)*\/?$/;

export function safeWorkspaceReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 200) return '/dashboard';
  const path = raw.split(/[?#]/, 1)[0]!;
  return WORKSPACE_PATH_RE.test(path) ? path : '/dashboard';
}
