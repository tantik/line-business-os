import { requireTenantContext } from '@/lib/tenant/context';
import { signOut } from '@/lib/auth/actions';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listTenantModules } from '@/lib/tenant/modules';
import type { ReactNode } from 'react';
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

function DashboardCard({ children }: { children: ReactNode }) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginTop: 16 }}>
      {children}
    </section>
  );
}

function SectionHeader({
  title,
  description,
  meta,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
        {description ? <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{description}</p> : null}
      </div>
      {meta ? <span style={{ color: '#6b7280', fontSize: 14, whiteSpace: 'nowrap' }}>{meta}</span> : null}
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: 'active' | 'inactive' | 'neutral'; children: ReactNode }) {
  const colors = {
    active: { background: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
    inactive: { background: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
    neutral: { background: '#eef2ff', color: '#4338ca', border: '#c7d2fe' },
  }[tone];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        background: colors.background,
        color: colors.color,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {children}
    </span>
  );
}

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', color: '#6b7280' }}>{children}</p>;
}

function AdminActionsPreview() {
  const actions = ['Manage locations', 'Manage modules', 'Invite members', 'Billing'];

  return (
    <DashboardCard>
      <SectionHeader
        title="Admin actions"
        description="Management actions will be enabled in later phases."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          marginTop: 14,
        }}
      >
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled
            style={{
              padding: '8px 12px',
              background: '#f9fafb',
              color: '#9ca3af',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'not-allowed',
            }}
          >
            {action}
          </button>
        ))}
      </div>
    </DashboardCard>
  );
}

/**
 * Read-only tenant admin shell foundation. It demonstrates the protected
 * foundation flow and safe dashboard summaries without enabling management
 * actions or product module workflows yet.
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
        <main style={{ maxWidth: 1040, margin: '0 auto', padding: 32 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <div>
              <h1 style={{ margin: 0 }}>Dashboard</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
                Read-only tenant administration shell. Management actions will mount here in later phases.
              </p>
            </div>
            <SignOutButton />
          </div>
          <DashboardCard>
            <SectionHeader title="Active tenant overview" />
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
          </DashboardCard>
          <AdminActionsPreview />
          <DashboardCard>
            <SectionHeader title="Memberships" meta={`count: ${memberships.length}`} />
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
                          {isActive ? <StatusBadge tone="neutral">active</StatusBadge> : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashboardCard>
          <DashboardCard>
            <SectionHeader title="Locations" meta={`count: ${activeLocations.length}`} />
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
                            <StatusBadge tone={location.isActive ? 'active' : 'inactive'}>
                              {location.isActive ? 'active' : 'inactive'}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyStateText>No locations are available for this tenant yet.</EmptyStateText>
              )
            ) : (
              <EmptyStateText>Locations are temporarily unavailable.</EmptyStateText>
            )}
          </DashboardCard>
          <DashboardCard>
            <SectionHeader
              title="Modules"
              meta={`total: ${activeModules.length} | enabled: ${enabledModuleCount}`}
            />
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
                            <StatusBadge tone={module.isEnabled ? 'active' : 'inactive'}>
                              {module.isEnabled ? 'enabled' : 'disabled'}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyStateText>No modules are available for this tenant yet.</EmptyStateText>
              )
            ) : (
              <EmptyStateText>Modules are temporarily unavailable.</EmptyStateText>
            )}
          </DashboardCard>
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
