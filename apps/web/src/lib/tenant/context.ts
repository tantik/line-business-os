import 'server-only';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readPublicSupabaseEnv } from '@/lib/supabase/env';
import { getVerifiedUserId } from '@/lib/auth/user';
import { SIGN_IN_PATH } from '@/lib/auth/require-user';
import { loadPageContext } from './page-context';
import { selectActiveTenant } from './select';
import { getActiveTenantCookieValue } from './active-tenant-cookie.server';
import type { ActiveTenantContext, TenantAccessResult, TenantMembership } from './types';

/**
 * Resolve the active tenant context for the current request, end to end:
 *
 *   authenticated user
 *   -> tenant membership lookup (RLS-scoped authenticated client)
 *   -> active tenant context
 *   -> membership role / access result
 *
 * Returns a typed result for every outcome so callers can render the matching
 * safe state. Never uses the service-role key; never trusts a tenant id from
 * the request body (an explicit `tenantId` is only honored if the user is a
 * member of it, otherwise `unauthorized`).
 *
 * Tenant resolution has two trust levels:
 *   - An explicit `opts.tenantId` is STRICT (the cookie is NOT read): it is
 *     honored only if the user is a member, otherwise `unauthorized`.
 *   - Otherwise the active-tenant cookie is read as a LENIENT candidate/hint
 *     and always revalidated against live memberships; a stale/malformed/absent
 *     cookie is ignored in favor of the deterministic default.
 *
 * `opts.user`/`opts.memberships` let a caller that has *already* resolved
 * these in the same request (e.g. `resolvePreviewTenantContext`, which must
 * inspect the membership list itself before it knows which `tenantId` to
 * request here) pass them straight through instead of this function
 * re-issuing the same `auth.getUser()`/membership read a second time. Both
 * values are still exactly what a fresh resolution would have produced -
 * this is reuse within one request, never a cache with a lifetime beyond it.
 */
export async function getActiveTenantContext(
  opts: { tenantId?: string; user?: User; memberships?: TenantMembership[] } = {},
): Promise<TenantAccessResult<ActiveTenantContext>> {
  const env = readPublicSupabaseEnv();
  if (!env.ok) {
    return { status: 'config_error', message: `Missing Supabase config: ${env.missing.join(', ')}` };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    return {
      status: 'config_error',
      message: err instanceof Error ? err.message : 'Failed to create Supabase client.',
    };
  }

  // Verified JWT, no Auth round trip (DEBT-124): only the id is needed here,
  // and the membership read below is RLS-scoped to that same verified user.
  const userId = opts.user?.id ?? (await getVerifiedUserId(supabase));
  if (!userId) return { status: 'not_authenticated' };

  // Memberships come from the request-scoped page context (one RPC shared
  // with the layout and the page, DEBT-135); same rows and outcomes as a
  // direct `api.my_tenant_memberships` read, RLS-scoped to the same user.
  const membershipsResult = opts.memberships
    ? ({ status: 'success', data: opts.memberships } as const)
    : (await loadPageContext()).memberships;
  if (membershipsResult.status !== 'success') return membershipsResult;

  // Explicit request stays strict; only read the cookie hint when none is given.
  const selected = opts.tenantId
    ? selectActiveTenant(membershipsResult.data, { requestedTenantId: opts.tenantId })
    : selectActiveTenant(membershipsResult.data, {
        candidateTenantId: await getActiveTenantCookieValue(),
      });
  if (!selected.ok) {
    if (selected.reason === 'no_membership') return { status: 'no_membership' };
    return { status: 'unauthorized', message: 'Not a member of the requested tenant.' };
  }

  return {
    status: 'success',
    data: {
      userId,
      activeTenant: selected.tenant,
      memberships: membershipsResult.data,
    },
  };
}

/**
 * Require tenant membership in a protected server context. Unauthenticated
 * requests are redirected to sign-in; every other outcome (including
 * `no_membership` / `unauthorized` / `config_error`) is returned so the caller
 * can render a safe state rather than crash.
 */
export async function requireTenantContext(
  opts: { tenantId?: string; redirectTo?: string; user?: User; memberships?: TenantMembership[] } = {},
): Promise<TenantAccessResult<ActiveTenantContext>> {
  const result = await getActiveTenantContext({ tenantId: opts.tenantId, user: opts.user, memberships: opts.memberships });
  if (result.status === 'not_authenticated') redirect(opts.redirectTo ?? SIGN_IN_PATH);
  return result;
}
