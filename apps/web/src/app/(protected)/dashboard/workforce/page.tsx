import { requireTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { listTenantModules } from '@/lib/tenant/modules';
import { listTenantLocations } from '@/lib/tenant/locations';
import { getMyWorkforceStaffProfile } from '@/lib/workforce/staff-profile';
import { hasManagerAccess } from '@/lib/workforce/manager-access';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  ModuleUnavailableState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import { badgeStyle, buttonSecondary, card, colors, mutedText, pageStyle } from '@/lib/ui/theme';
import { primaryCard } from './_ui/workforce-theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Small circular monogram badge, used to give each nav card a distinct visual marker (cafe operations feel, no icon library). */
function IconBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: colors.accentMuted,
        color: colors.accent,
        fontSize: 14,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

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
    <section style={primaryCard}>
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

      // Role-aware nav: only offer the Manager card to a caller who can
      // actually use `/dashboard/workforce/manager` -- mirrors that page's
      // own gate (`hasManagerAccess`, `workforce.staff.manage`) and its own
      // location-resolution fallback exactly, so "the card is shown" and
      // "the route would grant access" never disagree. This is a UX
      // affordance only: the Manager route re-runs this same server-side
      // check independently regardless of what this landing page renders,
      // so hiding the card is never the security boundary by itself.
      const locationsResult = await listTenantLocations(supabase);
      const tenantLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((l) => l.tenantId === activeTenant.tenantId)
          : [];
      const managerLocation = tenantLocations.find((l) => l.isActive) ?? tenantLocations[0];
      const canAccessManager = managerLocation
        ? await hasManagerAccess(supabase, activeTenant.tenantId, managerLocation.locationId)
        : false;

      const profileResult = await getMyWorkforceStaffProfile(supabase, activeTenant.tenantId);

      return (
        <main style={pageStyle(720)}>
          <header>
            <h1 style={{ margin: 0 }}>Workforce</h1>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              Cafe staff scheduling, shift reports, and recipes for {activeTenant.tenantName}.
            </p>
          </header>
          <MyStaffProfileCard profileResult={profileResult} />
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconBadge label="S" />
              <h2 style={{ margin: 0, fontSize: 16 }}>Staff</h2>
            </div>
            <p style={{ margin: '8px 0 0', ...mutedText }}>
              Submit shift preferences, view your published schedule, and file work reports and correction requests.
            </p>
            <Link href="/dashboard/workforce/staff" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
              Open staff dashboard
            </Link>
          </section>
          {canAccessManager ? (
            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconBadge label="M" />
                <h2 style={{ margin: 0, fontSize: 16 }}>Manager</h2>
              </div>
              <p style={{ margin: '8px 0 0', ...mutedText }}>
                Review staff, shift preferences, and the weekly schedule; run auto-distribution and publish shifts.
              </p>
              <Link href="/dashboard/workforce/manager" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
                Open manager dashboard
              </Link>
            </section>
          ) : null}
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconBadge label="R" />
              <h2 style={{ margin: 0, fontSize: 16 }}>Recipes</h2>
            </div>
            <p style={{ margin: '8px 0 0', ...mutedText }}>Browse published recipes and manuals by category.</p>
            <Link href="/dashboard/workforce/recipes" style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}>
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
