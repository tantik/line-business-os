import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { badgeStyle, card, linkAccent, mutedText, pageStyle } from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/**
 * My staff profile card. `profileResult` is a `TenantAccessResult` of the
 * caller's own `api.workforce_my_staff_profile` row -- `data: null` means no
 * matching `workforce.employees` row exists (e.g. an Owner/Admin with no
 * staff record), not an error. Only the fields approved for display are
 * rendered: no `staff_id`, `location_id`, or `created_at`, and no name (the
 * view never exposes one).
 */
function MyStaffProfileCard({
  profileResult,
}: {
  profileResult: Awaited<ReturnType<typeof getMyWorkforceStaffProfile>>;
}) {
  return (
    <section style={card}>
      <h2 style={{ margin: 0, fontSize: 16 }}>My staff profile</h2>
      {profileResult.status === 'success' && profileResult.data ? (
        <dl style={{ margin: '12px 0 0', display: 'grid', rowGap: 8 }}>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Position</dt>
            <dd style={{ margin: 0 }}>{profileResult.data.positionLabel ?? 'Not set'}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Employment type</dt>
            <dd style={{ margin: 0 }}>{profileResult.data.employmentType}</dd>
          </div>
          <div>
            <dt style={{ ...mutedText, fontSize: 13 }}>Status</dt>
            <dd style={{ margin: 0 }}>
              <span style={badgeStyle(profileResult.data.isActive ? 'active' : 'inactive')}>
                {profileResult.data.isActive ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>
        </dl>
      ) : profileResult.status === 'success' ? (
        <p style={{ margin: '8px 0 0', ...mutedText }}>No staff profile linked to your account yet.</p>
      ) : (
        <p style={{ margin: '8px 0 0', ...mutedText }}>Your profile is temporarily unavailable.</p>
      )}
    </section>
  );
}

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

      const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);

      return (
        <main style={pageStyle(720)}>
          <header>
            <h1 style={{ margin: 0 }}>Workforce</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              Staff recipes and reference material for {activeTenant.tenantName}.
            </p>
          </header>
          <MyStaffProfileCard profileResult={profileResult} />
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
