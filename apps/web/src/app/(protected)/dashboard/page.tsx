import { requireTenantContext } from '@/lib/tenant/context';
import { signOut } from '@/lib/auth/actions';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listTenantModules } from '@/lib/tenant/modules';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Minimal sign-out control; posts to the `signOut` Server Action. */
function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        style={{
          padding: '8px 14px',
          background: '#fff',
          color: '#111827',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </form>
  );
}

/**
 * Minimal authenticated dashboard scaffold. It demonstrates the foundation
 * flow (auth -> membership -> active tenant) and renders the matching safe state
 * for every outcome. It hosts NO product logic - Workforce/Booking/AI modules
 * are not implemented here.
 */
export default async function DashboardPage() {
  const result = await requireTenantContext();

  switch (result.status) {
    case 'success': {
      const { activeTenant, memberships } = result.data;
      const activeLocationScope = activeTenant.locationId ?? 'tenant-wide';
      const supabase = await createClient();
      const [locationsResult, modulesResult] = await Promise.all([
        listTenantLocations(supabase),
        listTenantModules(supabase),
      ]);
      const activeLocations =
        locationsResult.status === 'success'
          ? locationsResult.data.filter((location) => location.tenantId === activeTenant.tenantId)
          : [];
      const activeModules =
        modulesResult.status === 'success'
          ? modulesResult.data.filter((module) => module.tenantId === activeTenant.tenantId)
          : [];
      const enabledModuleCount = activeModules.filter((module) => module.isEnabled).length;

      return (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <SignOutButton />
          </div>
          <p style={{ color: '#6b7280' }}>
            Authenticated foundation scaffold. Modules will mount here in later phases.
          </p>
          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Active tenant</h2>
            <p style={{ margin: 0 }}>
              <strong>{activeTenant.tenantName}</strong>{' '}
              <span style={{ color: '#6b7280' }}>({activeTenant.tenantSlug})</span>
            </p>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                margin: '16px 0 0',
              }}
            >
              <div>
                <dt style={{ color: '#6b7280', fontSize: 13 }}>Slug</dt>
                <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{activeTenant.tenantSlug}</dd>
              </div>
              <div>
                <dt style={{ color: '#6b7280', fontSize: 13 }}>Kind</dt>
                <dd style={{ margin: '4px 0 0' }}>{activeTenant.tenantKind}</dd>
              </div>
              <div>
                <dt style={{ color: '#6b7280', fontSize: 13 }}>Memberships</dt>
                <dd style={{ margin: '4px 0 0' }}>{memberships.length}</dd>
              </div>
              <div>
                <dt style={{ color: '#6b7280', fontSize: 13 }}>Location scope</dt>
                <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{activeLocationScope}</dd>
              </div>
            </dl>
          </section>
          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Memberships</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Tenant</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Slug</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Kind</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Status</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Location scope</th>
                    <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => {
                    const isActive = membership.tenantId === activeTenant.tenantId;
                    return (
                      <tr
                        key={`${membership.tenantId}:${membership.locationId ?? 'tenant-wide'}`}
                        aria-current={isActive ? 'true' : undefined}
                        style={{ background: isActive ? '#eef2ff' : '#fff' }}
                      >
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                          <strong>{membership.tenantName}</strong>
                        </td>
                        <td
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            padding: '10px',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {membership.tenantSlug}
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                          {membership.tenantKind}
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                          {membership.status}
                        </td>
                        <td
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            padding: '10px',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {membership.locationId ?? 'tenant-wide'}
                        </td>
                        <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                          {isActive ? 'yes' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <div
              style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}
            >
              <h2 style={{ margin: 0, fontSize: 16 }}>Locations</h2>
              <span style={{ color: '#6b7280', fontSize: 14 }}>count: {activeLocations.length}</span>
            </div>
            {locationsResult.status === 'success' ? (
              activeLocations.length > 0 ? (
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Location</th>
                        <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Timezone</th>
                        <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLocations.map((location) => (
                        <tr key={location.locationId}>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                            <strong>{location.locationName}</strong>
                          </td>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                            {location.timezone}
                          </td>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                            {location.isActive ? 'active' : 'inactive'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ margin: '12px 0 0', color: '#6b7280' }}>
                  No locations are available for this tenant yet.
                </p>
              )
            ) : (
              <p style={{ margin: '12px 0 0', color: '#6b7280' }}>
                Locations are temporarily unavailable.
              </p>
            )}
          </section>
          <section
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}
          >
            <div
              style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}
            >
              <h2 style={{ margin: 0, fontSize: 16 }}>Modules</h2>
              <span style={{ color: '#6b7280', fontSize: 14 }}>
                total: {activeModules.length} | enabled: {enabledModuleCount}
              </span>
            </div>
            {modulesResult.status === 'success' ? (
              activeModules.length > 0 ? (
                <div style={{ overflowX: 'auto', marginTop: 12 }}>
                  <table style={{ width: '100%', minWidth: 360, borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Module</th>
                        <th style={{ borderBottom: '1px solid #e5e7eb', padding: '8px 10px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeModules.map((module) => (
                        <tr key={`${module.tenantId}:${module.module}`}>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                            <strong>{module.module}</strong>
                          </td>
                          <td style={{ borderBottom: '1px solid #f3f4f6', padding: '10px' }}>
                            {module.isEnabled ? 'enabled' : 'disabled'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ margin: '12px 0 0', color: '#6b7280' }}>
                  No modules are available for this tenant yet.
                </p>
              )
            ) : (
              <p style={{ margin: '12px 0 0', color: '#6b7280' }}>
                Modules are temporarily unavailable.
              </p>
            )}
          </section>
          <TenantSwitcher memberships={memberships} activeTenantId={activeTenant.tenantId} />
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
