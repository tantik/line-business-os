import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * Workforce landing page. Reachable only when the tenant's `workforce`
 * module is enabled -- this is an app-level product entitlement check, not
 * the tenant-isolation boundary; RLS on the underlying `api.workforce_*`
 * views remains the real security mechanism regardless of this check.
 */
export default async function WorkforceLandingPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant } = result.data;
      const supabase = await createClient();
      const modulesResult = await listTenantModules(supabase);
      const workforceEnabled =
        modulesResult.status === 'success' &&
        modulesResult.data.some(
          (module) =>
            module.tenantId === activeTenant.tenantId &&
            module.module === 'workforce' &&
            module.isEnabled,
        );

      if (!workforceEnabled) return <ModuleUnavailableState />;

      return (
        <main style={pageStyle(720)}>
          <header>
            <h1 style={{ margin: 0 }}>Workforce</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              Staff recipes and reference material for {activeTenant.tenantName}.
            </p>
          </header>
          <section style={card}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Recipes</h2>
            <p style={{ margin: '8px 0 0', ...mutedText }}>Browse published recipes by category.</p>
            <Link
              href="/dashboard/workforce/recipes"
              style={{ ...linkAccent, display: 'inline-block', marginTop: 12, textDecoration: 'underline' }}
            >
              View recipes
            </Link>
          </section>
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
