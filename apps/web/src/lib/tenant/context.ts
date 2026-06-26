import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { readPublicSupabaseEnv } from '@/lib/supabase/env';
import { getUserFromClient } from '@/lib/auth/user';
import { SIGN_IN_PATH } from '@/lib/auth/require-user';
import { listTenantMemberships } from './membership';
import { selectActiveTenant } from './select';
import { getActiveTenantCookieValue } from './active-tenant-cookie.server';
import type { ActiveTenantContext, TenantAccessResult } from './types';

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
 */
export async function getActiveTenantContext(
  opts: { tenantId?: string } = {},
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

  const user = await getUserFromClient(supabase);
  if (!user) return { status: 'not_authenticated' };

  const memberships = await listTenantMemberships(supabase, user.id);
  if (memberships.status !== 'success') return memberships;

  // Explicit request stays strict; only read the cookie hint when none is given.
  const selected = opts.tenantId
    ? selectActiveTenant(memberships.data, { requestedTenantId: opts.tenantId })
    : selectActiveTenant(memberships.data, {
        candidateTenantId: await getActiveTenantCookieValue(),
      });
  if (!selected.ok) {
    if (selected.reason === 'no_membership') return { status: 'no_membership' };
    return { status: 'unauthorized', message: 'Not a member of the requested tenant.' };
  }

  return {
    status: 'success',
    data: {
      userId: user.id,
      activeTenant: selected.tenant,
      memberships: memberships.data,
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
  opts: { tenantId?: string; redirectTo?: string } = {},
): Promise<TenantAccessResult<ActiveTenantContext>> {
  const result = await getActiveTenantContext({ tenantId: opts.tenantId });
  if (result.status === 'not_authenticated') redirect(opts.redirectTo ?? SIGN_IN_PATH);
  return result;
}
