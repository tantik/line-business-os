import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getUserFromClient } from '@/lib/auth/user';
import { listTenantMemberships } from '@/lib/tenant/membership';
import { requireTenantContext } from '@/lib/tenant/context';
import type { ActiveTenantContext } from '@/lib/tenant/types';
import { selectPreviewMembership } from './tenant-select';

export { selectPreviewMembership };

/**
 * Fail-closed result for preview tenant resolution. Deliberately coarser than
 * `TenantAccessResult` - every non-success case renders the same neutral "no
 * access" state (architecture plan Section D.5 step 5), so the response never
 * reveals whether the `mame-to-cha` tenant exists, whether the caller has a
 * membership elsewhere, or any other tenant-existence signal.
 */
export type PreviewTenantResult =
  | { status: 'success'; data: ActiveTenantContext }
  | { status: 'not_authenticated' }
  | { status: 'no_access' }
  | { status: 'config_error'; message: string }
  | { status: 'unexpected_error'; message: string };

/**
 * Strict, membership-driven preview tenant resolution (architecture plan
 * Section F1). Never reads or sets `lbo_active_tenant_id` - the resolved
 * tenant id is passed to `requireTenantContext` as an explicit `tenantId`,
 * which is the STRICT path (`context.ts`): the active-tenant cookie is never
 * consulted when `tenantId` is provided.
 *
 * Fails closed to a single neutral `no_access` result for every negative
 * outcome (no session, no membership, foreign-tenant-only membership, or any
 * lookup error) so a caller can never distinguish "you have no access" from
 * "this tenant doesn't exist" or "your membership expired".
 */
export async function resolvePreviewTenantContext(): Promise<PreviewTenantResult> {
  const supabase = await createClient();

  const user = await getUserFromClient(supabase);
  if (!user) return { status: 'not_authenticated' };

  const memberships = await listTenantMemberships(supabase, user.id);
  if (memberships.status === 'config_error') return memberships;
  if (memberships.status !== 'success') return { status: 'no_access' };

  const membership = selectPreviewMembership(memberships.data);
  if (!membership) return { status: 'no_access' };

  // Explicit tenantId => strict path; the active-tenant cookie is never read.
  // `user`/`memberships` are already resolved above - passed through so
  // `requireTenantContext` -> `getActiveTenantContext` does not re-issue the
  // same `auth.getUser()` and membership read a second time.
  const tenantContext = await requireTenantContext({
    tenantId: membership.tenantId,
    user,
    memberships: memberships.data,
  });
  if (tenantContext.status === 'config_error') return tenantContext;
  if (tenantContext.status !== 'success') return { status: 'no_access' };

  return { status: 'success', data: tenantContext.data };
}
