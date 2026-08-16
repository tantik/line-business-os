import { requireTenantContext } from '@/lib/tenant/context';
import { signOut } from '@/lib/auth/actions';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { createClient } from '@/lib/supabase/server';
import { listTenantLocations } from '@/lib/tenant/locations';
import { listTenantModules } from '@/lib/tenant/modules';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ErrorState,
  MissingConfigState,
  NoTenantState,
  UnauthorizedState,
} from '@/components/states';
import {
  badgeStyle,
  buttonDisabled,
  buttonSecondary,
  card,
  colors,
  mutedText,
  pageStyle,
  tableCell,
  tableHeaderCell,
} from '@/lib/ui/theme';

// Authenticated, session-dependent page: render per request, never prerender.
export const dynamic = 'force-dynamic';

/** Minimal sign-out control; posts to the `signOut` Server Action. */
function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" style={buttonSecondary}>
        Sign out
      </button>
    </form>
  );
}

function DashboardCard({ children }: { children: ReactNode }) {
  return <section style={card}>{children}</section>;
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
        {description ? <p style={{ margin: '6px 0 0', ...mutedText }}>{description}</p> : null}
      </div>
      {meta ? <span style={{ ...mutedText, fontSize: 14, whiteSpace: 'nowrap' }}>{meta}</span> : null}
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: 'active' | 'inactive' | 'neutral'; children: ReactNode }) {
  return <span style={badgeStyle(tone)}>{children}</span>;
}

function EmptyStateText({ children }: { children: ReactNode }) {
  return <p style={{ margin: '12px 0 0', ...mutedText }}>{children}</p>;
}

function WorkforcePreview({ enabled }: { enabled: boolean }) {
  return (
    <DashboardCard>
      <SectionHeader title="Workforce" description="Staff recipes and reference material." />
      {enabled ? (
        <Link
          href="/dashboard/workforce"
          style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}
        >
          Open Workforce
        </Link>
      ) : (
        <button type="button" disabled style={{ ...buttonDisabled, marginTop: 12 }}>
          Workforce (not enabled)
        </button>
      )}
    </DashboardCard>
  );
}

function InventoryPreview({ enabled }: { enabled: boolean }) {
  return (
    <DashboardCard>
      <SectionHeader title="Inventory" description="Daily stock check for catalog items across your locations." />
      {enabled ? (
        <Link
          href="/dashboard/inventory"
          style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}
        >
          Open Inventory
        </Link>
      ) : (
        <button type="button" disabled style={{ ...buttonDisabled, marginTop: 12 }}>
          Inventory (not enabled)
        </button>
      )}
    </DashboardCard>
  );
}

function AdminActionsPreview() {
  const actions = ['Manage locations', 'Manage modules', 'Invite members', 'Billing'];

  return (
    <DashboardCard>
      <SectionHeader
        title="Admin actions"
        description="Management actions will be enabled in later phases."
      />
      <Link
        href="/dashboard/admin"
        style={{ ...buttonSecondary, display: 'inline-block', marginTop: 12, textDecoration: 'none' }}
      >
        Open tenant admin
      </Link>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 8,
          marginTop: 14,
        }}
      >
        {actions.map((action) => (
          <button key={action} type="button" disabled style={buttonDisabled}>
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
      const workforceEnabled = activeModules.some(
        (module) => module.module === 'workforce' && module.isEnabled,
      );
      const inventoryEnabled = activeModules.some(
        (module) => module.module === 'inventory' && module.isEnabled,
      );

      return (
        <main style={pageStyle(1040)}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
          >
            <div>
              <h1 style={{ margin: 0 }}>Dashboard</h1>
              <p style={{ margin: '8px 0 0', ...mutedText }}>
                Read-only tenant administration shell. Management actions will mount here in later phases.
              </p>
            </div>
            <SignOutButton />
          </div>
          <DashboardCard>
            <SectionHeader title="Active tenant overview" />
            <p style={{ margin: 0 }}>
              <strong>{activeTenant.tenantName}</strong> <span style={mutedText}>({activeTenant.tenantSlug})</span>
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
                <dt style={{ ...mutedText, fontSize: 13 }}>Slug</dt>
                <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{activeTenant.tenantSlug}</dd>
              </div>
              <div>
                <dt style={{ ...mutedText, fontSize: 13 }}>Kind</dt>
                <dd style={{ margin: '4px 0 0' }}>{activeTenant.tenantKind}</dd>
              </div>
              <div>
                <dt style={{ ...mutedText, fontSize: 13 }}>Memberships</dt>
                <dd style={{ margin: '4px 0 0' }}>{memberships.length}</dd>
              </div>
              <div>
                <dt style={{ ...mutedText, fontSize: 13 }}>Location scope</dt>
                <dd style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{activeLocationScope}</dd>
              </div>
            </dl>
          </DashboardCard>
          <AdminActionsPreview />
          <WorkforcePreview enabled={workforceEnabled} />
          <InventoryPreview enabled={inventoryEnabled} />
          <DashboardCard>
            <SectionHeader title="Memberships" meta={`count: ${memberships.length}`} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left' }}>
                    <th style={tableHeaderCell}>Tenant</th>
                    <th style={tableHeaderCell}>Slug</th>
                    <th style={tableHeaderCell}>Kind</th>
                    <th style={tableHeaderCell}>Status</th>
                    <th style={tableHeaderCell}>Location scope</th>
                    <th style={tableHeaderCell}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => {
                    const isActive = membership.tenantId === activeTenant.tenantId;
                    return (
                      <tr
                        key={`${membership.tenantId}:${membership.locationId ?? 'tenant-wide'}`}
                        aria-current={isActive ? 'true' : undefined}
                        style={{ background: isActive ? colors.accentMuted : 'transparent' }}
                      >
                        <td style={tableCell}>
                          <strong>{membership.tenantName}</strong>
                        </td>
                        <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>{membership.tenantSlug}</td>
                        <td style={tableCell}>{membership.tenantKind}</td>
                        <td style={tableCell}>{membership.status}</td>
                        <td style={{ ...tableCell, overflowWrap: 'anywhere' }}>
                          {membership.locationId ?? 'tenant-wide'}
                        </td>
                        <td style={tableCell}>
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
                      <tr style={{ textAlign: 'left' }}>
                        <th style={tableHeaderCell}>Location</th>
                        <th style={tableHeaderCell}>Timezone</th>
                        <th style={tableHeaderCell}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLocations.map((location) => (
                        <tr key={location.locationId}>
                          <td style={tableCell}>
                            <strong>{location.locationName}</strong>
                          </td>
                          <td style={tableCell}>{location.timezone}</td>
                          <td style={tableCell}>
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
                      <tr style={{ textAlign: 'left' }}>
                        <th style={tableHeaderCell}>Module</th>
                        <th style={tableHeaderCell}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeModules.map((module) => (
                        <tr key={`${module.tenantId}:${module.module}`}>
                          <td style={tableCell}>
                            <strong>{module.module}</strong>
                          </td>
                          <td style={tableCell}>
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
