import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantAdminMembers } from '@/lib/tenant/admin-members';
import { hasTenantAdminAccess } from '@/lib/tenant/admin-access';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { pageStyle } from '@/lib/ui/theme';
import { AdminDashboardClient } from './admin-dashboard-client';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Tenant Admin page. `requireTenantContext()` only confirms active tenant
 * membership -- it is not a role/permission check, so a page-level
 * authorization gate is required before rendering this internal surface.
 * `hasTenantAdminAccess` checks `core.member.invite`, the same permission
 * that already scopes this page's one live data read
 * (`api.my_tenant_admin_members`, 0018) in SQL -- a plain Staff/Employee
 * member never holds it (0008 seed) and is denied here, before any
 * Admin-only Supabase read, with the repository's normal `UnauthorizedState`.
 * RLS on the underlying `api`/`core` objects remains independent
 * defense-in-depth regardless of this check.
 */
export default async function TenantAdminPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();

      const adminAccess = await hasTenantAdminAccess(supabase, activeTenant.tenantId);
      if (!adminAccess) return <UnauthorizedState />;

      const membersResult = await listTenantAdminMembers(supabase);

      return (
        <main style={pageStyle(960)}>
          <AdminDashboardClient
            tenantName={activeTenant.tenantName}
            tenantSlug={activeTenant.tenantSlug}
            members={
              membersResult.status === 'success'
                ? { status: 'success', data: membersResult.data }
                : membersResult.status === 'unauthorized'
                  ? { status: 'unauthorized', data: null }
                  : { status: 'unexpected_error', data: null }
            }
          />
        </main>
      );
    }
    case 'no_membership':
      return <NoTenantState />;
    case 'unauthorized':
      return <UnauthorizedState />;
    case 'config_error':
      return <MissingConfigState />;
    case 'unexpected_error':
      return <ErrorState />;
    // `not_authenticated` is already redirected to sign-in by requireTenantContext.
    default:
      return <ErrorState />;
  }
}
